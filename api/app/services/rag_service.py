# app/services/rag_service.py
import os
import json
from typing import List, Dict, Any, Tuple

from pathlib import Path
import numpy as np
from PyPDF2 import PdfReader

from app.services.ollama_service import ollama_embed, ollama_chat
from app.services.pdf_service import get_document_path

# -------- Paths --------
VEC_DIR = Path(__file__).resolve().parent.parent / "storage" / "vectors"
VEC_DIR.mkdir(parents=True, exist_ok=True)

def _index_path(doc_id: str) -> Path:
    return VEC_DIR / f"{doc_id}.json"

# -------- Utils --------
def _chunk_pages(pages: List[str], max_chars: int = 1800, overlap: int = 200) -> List[Tuple[int, str]]:
    chunks: List[Tuple[int, str]] = []
    for i, txt in enumerate(pages):
        t = (txt or "").strip()
        if not t:
            continue
        start = 0
        L = len(t)
        while start < L:
            end = min(L, start + max_chars)
            chunks.append((i + 1, t[start:end]))
            if end == L:
                break
            start = max(0, end - overlap)
    return chunks

def _norm(mat: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(mat, axis=1, keepdims=True) + 1e-9
    return mat / n

# -------- Indexing --------
async def index_document(doc_id: str) -> Dict[str, Any]:
    pdf = get_document_path(doc_id)
    if not pdf or not os.path.exists(pdf):
        return {"ok": False, "reason": "no_pdf"}

    pages: List[str] = []
    try:
        reader = PdfReader(pdf)
        for p in reader.pages:
            try:
                pages.append(p.extract_text() or "")
            except Exception:
                pages.append("")
    except Exception:
        pages = []

    chunks = _chunk_pages(pages)
    if not chunks:
        _index_path(doc_id).write_text(json.dumps({"texts": [], "pages": [], "embeddings": []}), encoding="utf-8")
        return {"ok": True, "chunks": 0}

    texts = [c[1] for c in chunks]
    pages_arr = [c[0] for c in chunks]

    # Compute embeddings
    vecs = await ollama_embed(texts)  # expected: List[List[float]]

    # Persist
    _index_path(doc_id).write_text(
        json.dumps({"texts": texts, "pages": pages_arr, "embeddings": vecs}, ensure_ascii=False),
        encoding="utf-8",
    )
    return {"ok": True, "chunks": len(texts)}

def _load_index(doc_id: str) -> Dict[str, Any]:
    path = _index_path(doc_id)
    if not path.exists():
        return {"texts": [], "pages": [], "embeddings": []}
    return json.loads(path.read_text(encoding="utf-8"))

# -------- QA --------
async def answer_question(doc_id: str, question: str, k: int = 6) -> str:
    idx = _load_index(doc_id)
    texts: List[str] = idx.get("texts", [])
    embeds = idx.get("embeddings", [])
    pages: List[int] = idx.get("pages", [])

    if not texts or not embeds:
        sys = "Eres un asistente legal. Si no hay texto indexado, solicita un PDF legible o con OCR."
        return await ollama_chat([
            {"role": "system", "content": sys},
            {"role": "user", "content": f"Documento sin índice legible. Pregunta: {question}"},
        ])

    # Normalize embeddings
    E = _norm(np.array(embeds, dtype=np.float32))  # (N, D)
    qv = np.array((await ollama_embed([question]))[0], dtype=np.float32)  # (D,)
    qv /= (np.linalg.norm(qv) + 1e-9)

    sims = (E @ qv).tolist()
    k = max(1, min(int(k), len(sims)))
    top = sorted(range(len(sims)), key=lambda i: sims[i], reverse=True)[:k]

    # IMPORTANT: avoid backslashes inside f-string expressions
    NL = "\n"
    ctx = [f"(p.{pages[i]}) " + texts[i].strip().replace(NL, " ") for i in top]

    system = (
        "Eres un abogado asistente. Responde en español, breve y preciso. "
        "Usa SOLO el contexto; si falta información, dilo. Incluye páginas relevantes."
    )
    user = "Pregunta: " + question + "\n\nCONTEXTOS:\n" + "\n\n".join(ctx)

    return await ollama_chat([
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ])

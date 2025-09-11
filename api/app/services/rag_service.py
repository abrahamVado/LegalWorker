# app/services/rag_service.py
import os
import json
from typing import List, Dict, Any, Tuple
from pathlib import Path
from datetime import datetime, timezone

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

def _first_json_blob(s: str) -> dict:
    """Extract the first top-level JSON object from s; fallback to {}."""
    try:
        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(s[start:end+1])
    except Exception:
        pass
    return {}

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

    vecs = await ollama_embed(texts)  # List[List[float]]

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

    E = _norm(np.array(embeds, dtype=np.float32))
    qv = np.array((await ollama_embed([question]))[0], dtype=np.float32)
    qv /= (np.linalg.norm(qv) + 1e-9)

    sims = (E @ qv).tolist()
    k = max(1, min(int(k), len(sims)))
    top = sorted(range(len(sims)), key=lambda i: sims[i], reverse=True)[:k]

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

# -------- Digest (per-document) --------
async def digest_document(doc_id: str, strategy: str = "llm", max_chars: int = 16000) -> Dict[str, Any]:
    """
    Returns a single-document digest aligned to the front-end AnalyzedDoc.
    strategy:
      - "fast": metadata-only, no LLM pass
      - "llm" : quick LLM pass over up to `max_chars` of text for richer fields
    """
    idx = _load_index(doc_id)
    texts: List[str] = idx.get("texts", [])
    pdf_path = get_document_path(doc_id)

    # File stats
    name = Path(pdf_path).name if pdf_path else f"{doc_id}.pdf"
    size_bytes = Path(pdf_path).stat().st_size if (pdf_path and os.path.exists(pdf_path)) else 0
    sizeKB = max(1, int(round(size_bytes / 1024))) if size_bytes else 0
    mtime = Path(pdf_path).stat().st_mtime if (pdf_path and os.path.exists(pdf_path)) else None
    last_modifiedISO = (
        datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        if mtime is not None
        else datetime.now(tz=timezone.utc).isoformat()
    )

    digest: Dict[str, Any] = {
        "id": doc_id,
        "name": name,
        "sizeKB": sizeKB,
        "durationMs": 0,                # fill if you track timings elsewhere
        "type": "Contrato",
        "counterparties": [],
        "riskFlags": [],
        "spellingMistakes": 0,
        "classification": "unknown",
        "lastModifiedISO": last_modifiedISO,
    }

    if strategy != "llm" or not texts:
        return digest

    # Build a capped sample of text
    acc = 0
    sample_chunks: List[str] = []
    for t in texts:
        if acc + len(t) > max_chars:
            break
        sample_chunks.append(t)
        acc += len(t)
    joined = "\n\n".join(sample_chunks) if sample_chunks else ""

    sys = (
        "Eres un asistente legal. Lee el texto y devuelve SOLO JSON, sin comentarios. "
        "Claves: type (Contrato/NDA/Factura/Poder/Aviso de privacidad), "
        "classification (company_creation, association_creation, contract_amendment, privacy_notice, service_agreement), "
        "counterparties (hasta 4), riskFlags (0-4), spellingMistakes (int)."
    )
    user = (
        "Texto:\n---\n" + joined[:max_chars] + "\n---\n"
        "Responde SOLO con JSON con estas claves exactas: "
        '{"type": "...", "classification": "...", "counterparties": ["..."], "riskFlags": ["..."], "spellingMistakes": 0}'
    )

    try:
        raw = await ollama_chat([
            {"role": "system", "content": sys},
            {"role": "user", "content": user},
        ])
        data = _first_json_blob(str(raw))

        if isinstance(data.get("type"), str):
            digest["type"] = data["type"][:64]
        if isinstance(data.get("classification"), str):
            digest["classification"] = data["classification"][:64]
        if isinstance(data.get("counterparties"), list):
            cps = []
            seen = set()
            for c in data["counterparties"]:
                if not isinstance(c, str):
                    continue
                c2 = c.strip()
                if c2 and c2 not in seen:
                    seen.add(c2)
                    cps.append(c2)
            digest["counterparties"] = cps[:4]
        if isinstance(data.get("riskFlags"), list):
            rfs = []
            seen = set()
            for r in data["riskFlags"]:
                if not isinstance(r, str):
                    continue
                r2 = r.strip()
                if r2 and r2 not in seen:
                    seen.add(r2)
                    rfs.append(r2)
            digest["riskFlags"] = rfs[:4]
        if isinstance(data.get("spellingMistakes"), int):
            digest["spellingMistakes"] = max(0, int(data["spellingMistakes"]))
    except Exception:
        # keep defaults if parsing/LLM fails
        pass

    return digest

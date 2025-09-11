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

from dataclasses import dataclass
from typing import Optional


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

# --- MMR selection for diversity ---
def _mmr_indices(E: np.ndarray, qv: np.ndarray, k: int, lam: float = 0.3) -> List[int]:
    """
    Maximal Marginal Relevance.
    E: (N, d) normalized embeddings
    qv: (d,) normalized query vector
    k: number to select
    lam: tradeoff (0->diversity, 1->relevance)
    """
    N = E.shape[0]
    if N == 0: return []
    k = min(k, N)
    sims = (E @ qv)  # (N,)
    selected: List[int] = []
    candidates = set(range(N))
    # pick best first
    i0 = int(np.argmax(sims))
    selected.append(i0)
    candidates.remove(i0)
    while len(selected) < k and candidates:
        # penalize by max sim to anything already selected
        max_div = None
        best = None
        for j in candidates:
            # diversity term
            div = max(float(E[j] @ E[s]) for s in selected)
            score = lam * float(sims[j]) - (1 - lam) * div
            if (max_div is None) or (score > max_div):
                max_div = score
                best = j
        selected.append(best)  # type: ignore
        candidates.remove(best)  # type: ignore
    return selected


# --- LLM re-ranker (optional) ---
async def _llm_rerank(question: str, texts: List[str], k: int) -> List[int]:
    """
    Ask the LLM to rank the candidate chunks for the question.
    Returns indices into the `texts` array (top-k).
    """
    # keep prompt small
    k = max(1, min(k, len(texts)))
    NL = "\n"
    # Build a compact list with ids
    items = []
    for i, t in enumerate(texts):
        t_short = (t[:900] + "…") if len(t) > 900 else t
        items.append(f"[{i}] {t_short.replace(NL, ' ')}")
    system = (
        "Eres un asistente legal. Te daré una pregunta y fragmentos de contexto. "
        "Devuelve SOLO un JSON con un arreglo 'rank' de índices (0..N-1) del más relevante al menos, "
        "y limita a los mejores k. No expliques."
    )
    user = (
        f"Pregunta: {question}\n\n"
        f"Fragmentos:\n{NL.join(items)}\n\n"
        f"Indica el ranking en JSON con forma: {{\"rank\":[i0,i1,...]}} con máximo {k} elementos."
    )
    try:
        raw = await ollama_chat([
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ])
        data = _first_json_blob(str(raw))
        rank = data.get("rank", [])
        if isinstance(rank, list):
            # sanitize
            cand = [int(x) for x in rank if isinstance(x, int) and 0 <= x < len(texts)]
            # unique & cap
            out = []
            seen = set()
            for x in cand:
                if x not in seen:
                    out.append(x)
                    seen.add(x)
                if len(out) >= k:
                    break
            if out:
                return out
    except Exception:
        pass
    # fallback: identity
    return list(range(k))


# --- LLM document digest (structured summary) ---
async def summarize_document_llm(doc_id: str, max_chars: int = 16000) -> Dict[str, Any]:
    """
    Produce a compact JSON summary with legal-oriented fields + salient pages.
    """
    idx = _load_index(doc_id)
    texts: List[str] = idx.get("texts", [])
    pages: List[int] = idx.get("pages", [])
    if not texts:
        return {
            "summary": "",
            "key_points": [],
            "salient_pages": [],
            "entities": {"counterparties": [], "jurisdictions": []},
            "classification": "unknown",
            "type": "Contrato",
        }

    # cap content but preserve chunk boundaries
    acc = 0
    chosen: List[Tuple[int, str]] = []
    for i, t in enumerate(texts):
        if acc + len(t) > max_chars:
            break
        chosen.append((i, t))
        acc += len(t)

    # include page refs for stronger grounding
    NL = "\n"
    snippet_lines = []
    for i, t in chosen:
        p = pages[i] if i < len(pages) else None
        t_short = t.replace(NL, " ")
        snippet_lines.append(f"(p.{p}) {t_short}")

    system = (
        "Eres un asistente legal. Lee el texto y responde SOLO JSON compacto con:\n"
        "type (Contrato/NDA/Factura/Poder/Aviso de privacidad), "
        "classification (company_creation, association_creation, contract_amendment, privacy_notice, service_agreement), "
        "summary (<=3 oraciones), key_points (lista de viñetas cortas), "
        "entities.counterparties (máx 4), entities.jurisdictions (máx 3), "
        "salient_pages (lista de números de página relevantes)."
    )
    user = (
        "Texto (con páginas):\n---\n" + NL.join(snippet_lines) + "\n---\n"
        'JSON esperado: {"type":"...","classification":"...","summary":"...","key_points":["..."],'
        '"entities":{"counterparties":["..."],"jurisdictions":["..."]},"salient_pages":[1,2]}'
    )
    try:
        raw = await ollama_chat([
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ])
        data = _first_json_blob(str(raw)) or {}
    except Exception:
        data = {}

    # sanitize
    out = {
        "type": (data.get("type") or "Contrato")[:64],
        "classification": (data.get("classification") or "unknown")[:64],
        "summary": (data.get("summary") or "")[:1000],
        "key_points": [str(x)[:200] for x in (data.get("key_points") or []) if isinstance(x, str)][:8],
        "entities": {
            "counterparties": [str(x)[:100] for x in (data.get("entities", {}).get("counterparties") or [])][:4],
            "jurisdictions": [str(x)[:60] for x in (data.get("entities", {}).get("jurisdictions") or [])][:3],
        },
        "salient_pages": [int(x) for x in (data.get("salient_pages") or []) if isinstance(x, int)][:10],
    }
    return out

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
async def answer_question(
    doc_id: str,
    question: str,
    k: int = 6,
    strategy: str = "mmr",            # "cosine" or "mmr"
    mmr_lambda: float = 0.3,
    use_llm_rerank: bool = False,
) -> str:
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

    # take a wider candidate set first
    k = max(1, min(int(k), len(texts)))
    cand_n = min(max(12, 3 * k), len(texts))
    # cosine sims
    sims = (E @ qv)
    cand = list(np.argsort(-sims)[:cand_n])

    if strategy == "mmr":
        cand = _mmr_indices(E[cand], qv, k=cand_n, lam=mmr_lambda)
        # map back to original indices if we used a subset
        # here we applied to E[cand], so cand are positions in that slice
        # rebuild absolute ids:
        cand = [list(np.argsort(-sims)[:cand_n])[i] for i in cand]

    # optional LLM re-rank of candidates (stronger relevance)
    if use_llm_rerank:
        cand_texts = [texts[i] for i in cand]
        reranked_local = await _llm_rerank(question, cand_texts, k=k)
        cand = [cand[i] for i in reranked_local]

    top = cand[:k]
    NL = "\n"
    ctx = [f"(p.{pages[i]}) " + texts[i].strip().replace(NL, " ") for i in top]

    system = (
        "Eres un abogado asistente. Responde en español, breve y preciso. "
        "Usa SOLO el contexto; si falta información, dilo. Cita páginas entre paréntesis (p.X)."
    )
    user = "Pregunta: " + question + "\n\nCONTEXTOS:\n" + "\n\n".join(ctx)
    return await ollama_chat([
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ])

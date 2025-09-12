# app/api/contract.py
from __future__ import annotations

import json
import logging
from pathlib import Path
from statistics import median
from typing import Any, Dict, List, Optional, Literal

from datetime import datetime

from fastapi import (
    APIRouter,
    File,
    HTTPException,
    UploadFile,
    status,
    BackgroundTasks,
)
from pydantic import BaseModel, Field

from app.services.pdf_service import save_pdf_files
from app.services.rag_service import (
    build_index_metadata,      # fast, no-embedding overview
    index_document,            # full embedding index (runs in bg)
    answer_question,           # RAG QA
    digest_document,           # base digest (no-LLM)
    summarize_document_llm,    # LLM summary addon
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["frontend-contract"])

# ---------- Feedback storage ----------
FEED_DIR = Path(__file__).resolve().parents[1] / "storage" / "feedback"
FEED_DIR.mkdir(parents=True, exist_ok=True)
FEED_FILE = FEED_DIR / "relevance.jsonl"

# ---------- Models ----------
class IngestResponse(BaseModel):
    ok: bool = True
    status: Literal["indexing", "done"] = "indexing"
    doc_id: str
    chunks: int
    overview: List[Any] = []

class AskRequest(BaseModel):
    doc_id: str
    query: str
    k: int = Field(6, ge=1, le=25)
    strategy: Literal["cosine", "mmr"] = "mmr"
    mmr_lambda: float = Field(0.3, ge=0.0, le=1.0)
    use_llm_rerank: bool = False

class AskResponse(BaseModel):
    answer: str

class FeedbackRequest(BaseModel):
    doc_id: str
    query: str
    positive_chunk_ids: List[int] = []
    negative_chunk_ids: List[int] = []
    answer_quality: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = ""

class DigestRequest(BaseModel):
    doc_id: str
    strategy: Literal["fast", "llm"] = "llm"
    max_chars: int = Field(16000, ge=1000, le=120000)

class DigestsRequest(BaseModel):
    doc_ids: List[str]
    strategy: Literal["fast", "llm"] = "llm"
    max_chars: int = Field(16000, ge=1000, le=120000)

class DigestDoc(BaseModel):
    id: str
    name: str
    sizeKB: int
    durationMs: int
    type: str
    counterparties: List[str]
    riskFlags: List[str]
    spellingMistakes: int
    classification: str
    lastModifiedISO: str
    # LLM fields:
    summary: Optional[str] = ""
    key_points: List[str] = []
    salient_pages: List[int] = []
    entities: Dict[str, Any] = {}

class KpisRequest(BaseModel):
    doc_ids: List[str]
    strategy: Literal["fast", "llm"] = "llm"
    max_chars: int = Field(16000, ge=1000, le=120000)

class KpisResponse(BaseModel):
    total_docs: int
    succeeded: int
    uniqueCounterparties: int
    riskTotal: int
    spellingTotal: int
    totalMB: float
    avgDurationMs: float
    medDurationMs: float
    byClassification: Dict[str, int]
    byType: Dict[str, int]
    oldestISO: Optional[str] = None
    newestISO: Optional[str] = None

# ---------- Helpers ----------
_PDF_CTYPES = {
    "application/pdf",
    "application/x-pdf",
    "application/acrobat",
    "applications/vnd.pdf",
    "text/pdf",
    "text/x-pdf",
}

def _is_pdf_upload(f: UploadFile) -> bool:
    fname = (f.filename or "").lower()
    ctype = (f.content_type or "").lower()
    return (ctype in _PDF_CTYPES) or fname.endswith(".pdf")

# ---------- Routes ----------

@router.post("/ingest", response_model=IngestResponse, status_code=status.HTTP_201_CREATED)
async def ingest(file: UploadFile = File(...), background: BackgroundTasks = None) -> IngestResponse:
    """
    Save PDF, return quick metadata immediately, and build embeddings in background.
    """
    if not file:
        raise HTTPException(status_code=400, detail="No file received")
    if not _is_pdf_upload(file):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    try:
        saved = await save_pdf_files([file])
    except Exception as e:
        logger.exception("save_pdf_files failed")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e!s}")

    if not saved:
        raise HTTPException(status_code=500, detail="Failed to save file (no result)")
    doc = saved[0]

    # Fast metadata (no LLM, no embeddings)
    try:
        meta: Dict[str, Any] = await build_index_metadata(doc.id)
    except Exception as e:
        logger.exception("build_index_metadata failed for doc_id=%s", getattr(doc, "id", None))
        # still try to index in background, but return minimal payload
        meta = {"chunks": 0, "overview": []}

    # Kick off embeddings in the background
    if background is not None:
        background.add_task(index_document, doc.id)

    return IngestResponse(
        ok=True,
        status="indexing",
        doc_id=str(doc.id),
        chunks=int(meta.get("chunks", 0)),
        overview=meta.get("overview", []),
    )

@router.post("/digest", response_model=DigestDoc)
async def digest(req: DigestRequest) -> DigestDoc:
    """
    Return a per-document digest (base info + optional LLM summary).
    """
    try:
        base = await digest_document(req.doc_id, strategy=req.strategy, max_chars=req.max_chars)
        if req.strategy == "llm":
            llm = await summarize_document_llm(req.doc_id, max_chars=req.max_chars)
            base["summary"] = llm.get("summary", "")
            base["key_points"] = llm.get("key_points", [])
            base["salient_pages"] = llm.get("salient_pages", [])
            base["type"] = llm.get("type", base.get("type", "Contrato"))
            base["classification"] = llm.get("classification", base.get("classification", "unknown"))
            base["entities"] = llm.get("entities", {"counterparties": base.get("counterparties", [])})
        return DigestDoc(**base)
    except Exception as e:
        logger.exception("digest failed for doc_id=%s", req.doc_id)
        raise HTTPException(status_code=500, detail=f"Failed to build digest: {e!s}")

@router.post("/digests", response_model=List[DigestDoc])
async def digests(req: DigestsRequest) -> List[DigestDoc]:
    """
    Batch version of /digest.
    """
    out: List[DigestDoc] = []
    for doc_id in req.doc_ids:
        try:
            base = await digest_document(doc_id, strategy=req.strategy, max_chars=req.max_chars)
            if req.strategy == "llm":
                llm = await summarize_document_llm(doc_id, max_chars=req.max_chars)
                base["summary"] = llm.get("summary", "")
                base["key_points"] = llm.get("key_points", [])
                base["salient_pages"] = llm.get("salient_pages", [])
                base["type"] = llm.get("type", base.get("type", "Contrato"))
                base["classification"] = llm.get("classification", base.get("classification", "unknown"))
                base["entities"] = llm.get("entities", {"counterparties": base.get("counterparties", [])})
            out.append(DigestDoc(**base))
        except Exception:
            logger.exception("digest failed for doc_id=%s", doc_id)
            continue
    return out

@router.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest) -> AskResponse:
    """
    RAG QA over an indexed document (MMR / LLM rerank knobs available).
    """
    try:
        answer_text = await answer_question(
            req.doc_id,
            req.query,
            k=req.k,
            strategy=req.strategy,
            mmr_lambda=req.mmr_lambda,
            use_llm_rerank=req.use_llm_rerank,
        )
        return AskResponse(answer=str(answer_text or ""))
    except Exception as e:
        logger.exception("answer_question failed for doc_id=%s", req.doc_id)
        raise HTTPException(status_code=500, detail=f"Failed to answer question: {e!s}")

@router.post("/feedback")
async def feedback(req: FeedbackRequest):
    """
    Store lightweight relevance feedback to improve retrieval later.
    """
    rec = req.model_dump()
    rec["ts"] = datetime.utcnow().isoformat() + "Z"
    with FEED_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return {"ok": True}

@router.post("/kpis", response_model=KpisResponse)
async def kpis(req: KpisRequest) -> KpisResponse:
    """
    Aggregate KPIs over a set of documents by building (or reusing) their digests.
    """
    digests: List[DigestDoc] = []
    for doc_id in req.doc_ids:
        try:
            d = await digest_document(doc_id, strategy=req.strategy, max_chars=req.max_chars)
            digests.append(DigestDoc(**d))
        except Exception:
            continue

    total_docs = len(req.doc_ids)
    succeeded = len(digests)

    risk_total = sum(len(d.riskFlags) for d in digests)
    spelling_total = sum(int(d.spellingMistakes) for d in digests)

    cps = set()
    for d in digests:
        for c in d.counterparties:
            c = (c or "").strip()
            if c:
                cps.add(c)
    unique_cps = len(cps)

    total_mb = sum(max(0, d.sizeKB) for d in digests) / 1024.0
    durations = [max(0, d.durationMs) for d in digests]
    avg_duration = (sum(durations) / len(durations)) if durations else 0.0
    med_duration = median(durations) if durations else 0.0

    by_class: Dict[str, int] = {}
    by_type: Dict[str, int] = {}
    for d in digests:
        by_class[d.classification] = by_class.get(d.classification, 0) + 1
        by_type[d.type] = by_type.get(d.type, 0) + 1

    iso_times = [d.lastModifiedISO for d in digests if d.lastModifiedISO]
    oldest_iso = min(iso_times) if iso_times else None
    newest_iso = max(iso_times) if iso_times else None

    return KpisResponse(
        total_docs=total_docs,
        succeeded=succeeded,
        uniqueCounterparties=unique_cps,
        riskTotal=risk_total,
        spellingTotal=spelling_total,
        totalMB=round(total_mb, 3),
        avgDurationMs=float(round(avg_duration, 2)),
        medDurationMs=float(round(med_duration, 2)),
        byClassification=by_class,
        byType=by_type,
        oldestISO=oldest_iso,
        newestISO=newest_iso,
    )

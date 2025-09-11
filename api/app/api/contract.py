# app/api/contract.py
from __future__ import annotations

import logging
from typing import Any, Dict, List, Literal, Optional, Tuple
from statistics import median

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.services.pdf_service import save_pdf_files
from app.services.rag_service import (
    index_document,
    answer_question,
    digest_document,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["frontend-contract"])


# ========= Models =========

class IngestResponse(BaseModel):
    ok: bool = True
    doc_id: str
    chunks: int
    overview: List[Any] = []


class AskRequest(BaseModel):
    doc_id: str = Field(..., description="ID of the previously-ingested document")
    query: str = Field(..., min_length=1, description="Natural-language question")
    k: int = Field(6, ge=1, le=25, description="How many chunks to retrieve for RAG")


class AskResponse(BaseModel):
    answer: str


class DigestRequest(BaseModel):
    doc_id: str
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


class DigestsRequest(BaseModel):
    doc_ids: List[str]
    strategy: Literal["fast", "llm"] = "llm"
    max_chars: int = Field(16000, ge=1000, le=120000)


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


# ========= Helpers =========

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


# ========= Routes =========

@router.post("/ingest", response_model=IngestResponse, status_code=status.HTTP_201_CREATED)
async def ingest(file: UploadFile = File(...)) -> IngestResponse:
    """
    Accept a single PDF, persist it, then index it with embeddings.
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
    try:
        stats: Dict[str, Any] = await index_document(doc.id)  # build embeddings
    except Exception as e:
        logger.exception("index_document failed for doc_id=%s", getattr(doc, "id", None))
        raise HTTPException(status_code=500, detail=f"Failed to index document: {e!s}")

    chunks = int(stats.get("chunks", 0))
    return IngestResponse(doc_id=str(doc.id), chunks=chunks, overview=[])


@router.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest) -> AskResponse:
    """
    Answer a question over an already-indexed document.
    """
    k = max(1, min(25, req.k))
    try:
        answer_text = await answer_question(req.doc_id, req.query, k)
    except Exception as e:
        logger.exception("answer_question failed for doc_id=%s", req.doc_id)
        raise HTTPException(status_code=500, detail=f"Failed to answer question: {e!s}")

    return AskResponse(answer=str(answer_text or ""))


@router.post("/digest", response_model=DigestDoc)
async def digest(req: DigestRequest) -> DigestDoc:
    """
    Return a per-document digest (shape matches the front-end AnalyzedDoc).
    """
    try:
        doc = await digest_document(req.doc_id, strategy=req.strategy, max_chars=req.max_chars)
        return DigestDoc(**doc)
    except Exception as e:
        logger.exception("digest_document failed for doc_id=%s", req.doc_id)
        raise HTTPException(status_code=500, detail=f"Failed to build digest: {e!s}")


@router.post("/digests", response_model=List[DigestDoc])
async def digests(req: DigestsRequest) -> List[DigestDoc]:
    """
    Batch version of /digest.
    """
    out: List[DigestDoc] = []
    for doc_id in req.doc_ids:
        try:
            d = await digest_document(doc_id, strategy=req.strategy, max_chars=req.max_chars)
            out.append(DigestDoc(**d))
        except Exception as e:
            logger.exception("digest_document failed for doc_id=%s", doc_id)
            # Skip failures; front-end can show 'Errors' KPI
            continue
    return out


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
            # skip on error
            continue

    total_docs = len(req.doc_ids)
    succeeded = len(digests)

    # Counters
    risk_total = sum(len(d.riskFlags) for d in digests)
    spelling_total = sum(int(d.spellingMistakes) for d in digests)

    # Unique counterparties
    cps = set()
    for d in digests:
        for c in d.counterparties:
            cps.add(c.strip())
    unique_cps = len([x for x in cps if x])

    # Sizes / durations
    total_mb = sum(max(0, d.sizeKB) for d in digests) / 1024.0
    durations = [max(0, d.durationMs) for d in digests]
    avg_duration = (sum(durations) / len(durations)) if durations else 0.0
    med_duration = median(durations) if durations else 0.0

    # Breakdown
    by_class = {}
    by_type = {}
    for d in digests:
        by_class[d.classification] = by_class.get(d.classification, 0) + 1
        by_type[d.type] = by_type.get(d.type, 0) + 1

    # Oldest / newest
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

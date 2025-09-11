# app/api/contract.py
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.services.pdf_service import save_pdf_files
from app.services.rag_service import index_document, answer_question

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["frontend-contract"])


# ======== Pydantic models ========

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


# ======== Helpers ========

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


# ======== Routes ========

@router.post("/ingest", response_model=IngestResponse, status_code=status.HTTP_201_CREATED)
async def ingest(file: UploadFile = File(...)) -> IngestResponse:
    """
    Accept a single PDF, persist it via `save_pdf_files`, then index it with `index_document`.
    Returns the new document id and number of generated chunks.
    """
    if not file:
        raise HTTPException(status_code=400, detail="No file received")

    if not _is_pdf_upload(file):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    try:
        saved = await save_pdf_files([file])  # expects a list of Document-like objects
    except Exception as e:
        logger.exception("save_pdf_files failed")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e!s}")

    if not saved:
        raise HTTPException(status_code=500, detail="Failed to save file (no result)")

    doc = saved[0]
    try:
        stats: Dict[str, Any] = await index_document(doc.id)  # build embeddings (e.g., Ollama)
    except Exception as e:
        logger.exception("index_document failed for doc_id=%s", getattr(doc, "id", None))
        raise HTTPException(status_code=500, detail=f"Failed to index document: {e!s}")

    chunks = int(stats.get("chunks", 0))
    # If you later return an overview from your service, wire it here.
    return IngestResponse(doc_id=str(doc.id), chunks=chunks, overview=[])


@router.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest) -> AskResponse:
    """
    Answer a question over an already-indexed document.
    """
    # Clamp defensively even though Pydantic already validates
    k = max(1, min(25, req.k))
    try:
        answer_text = await answer_question(req.doc_id, req.query, k)
    except Exception as e:
        logger.exception("answer_question failed for doc_id=%s", req.doc_id)
        raise HTTPException(status_code=500, detail=f"Failed to answer question: {e!s}")

    # Normalize to string in case your service returns None or other types
    if answer_text is None:
        answer_text = ""

    return AskResponse(answer=str(answer_text))

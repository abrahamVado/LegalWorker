from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Dict, Any

from app.services.pdf_service import save_pdf_files, get_document_path

router = APIRouter(prefix="/api", tags=["frontend-contract"])

@router.post("/ingest")
async def ingest(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file:
        raise HTTPException(status_code=400, detail="No file received")
    fname = (file.filename or "").lower()
    if not (file.content_type == "application/pdf" or fname.endswith(".pdf")):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    saved = await save_pdf_files([file])
    if not saved:
        raise HTTPException(status_code=500, detail="Failed to save file")
    doc = saved[0]
    # Stubbed 'chunks' and 'overview' for now
    return {
        "ok": True,
        "doc_id": doc.id,
        "chunks": 0,
        "overview": [],
    }

@router.post("/ask")
async def ask(payload: Dict[str, Any]) -> Dict[str, Any]:
    doc_id = payload.get("doc_id")
    query = payload.get("query", "")
    if not doc_id:
        raise HTTPException(status_code=400, detail="doc_id is required")
    path = get_document_path(doc_id)
    if not path:
        raise HTTPException(status_code=404, detail="Document not found")
    # Stubbed answer
    return {"answer": f"Stub: your query '{query}' has been received for document {doc_id}."}

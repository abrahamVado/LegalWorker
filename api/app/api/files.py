from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from fastapi.responses import StreamingResponse, FileResponse, Response
from typing import List, Optional

import os

from app.services.pdf_service import (
    list_documents, save_pdf_files,
    get_document_meta, get_document_path,
    delete_document, rename_document
)
from app.models.document import Document
from app.utils.range import parse_range

router = APIRouter(prefix="/api", tags=["files"])

@router.get("/documents", response_model=List[Document])
async def get_documents():
    return await list_documents()

@router.get("/documents/{doc_id}", response_model=Document)
async def get_document(doc_id: str):
    meta = get_document_meta(doc_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Not found")
    return meta

@router.patch("/documents/{doc_id}", response_model=Document)
async def patch_document(doc_id: str, payload: dict):
    new_name: Optional[str] = payload.get("name")
    if not new_name:
        raise HTTPException(status_code=400, detail="name is required")
    updated = rename_document(doc_id, new_name)
    if not updated:
        raise HTTPException(status_code=404, detail="Not found or rename failed")
    return updated

@router.delete("/documents/{doc_id}")
async def remove_document(doc_id: str):
    ok = delete_document(doc_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

@router.get("/documents/{doc_id}/file")
async def get_document_file(doc_id: str, request: Request):
    path = get_document_path(doc_id)
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Not found")

    file_size = os.path.getsize(path)
    range_header = request.headers.get("Range")
    start, end = parse_range(range_header, file_size)
    chunk_size = 1024 * 1024

    def file_iter():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = f.read(min(chunk_size, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    status_code = 206 if range_header else 200
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": "application/pdf",
        "Content-Length": str(end - start + 1),
    }
    if status_code == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"

    return StreamingResponse(file_iter(), status_code=status_code, headers=headers)

@router.post("/upload")
async def upload_pdfs(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files received")
    pdfs = [f for f in files if (f.content_type == "application/pdf" or (f.filename or "").lower().endswith(".pdf"))]
    if not pdfs:
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    saved = await save_pdf_files(pdfs)
    return {"count": len(saved), "documents": saved}

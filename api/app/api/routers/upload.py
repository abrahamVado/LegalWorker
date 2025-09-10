
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List
from app.services.pdf_service import save_pdf_files

router = APIRouter()

@router.post("/upload")
async def upload_pdfs(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files received")

    pdfs = [f for f in files if (f.content_type == "application/pdf" or f.filename.lower().endswith(".pdf"))]
    if not pdfs:
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    saved = await save_pdf_files(pdfs)
    return {"count": len(saved), "documents": saved}

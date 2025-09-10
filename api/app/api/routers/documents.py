
from fastapi import APIRouter, HTTPException
from typing import List
from app.services.pdf_service import list_documents
from app.models.document import Document

router = APIRouter()

@router.get("/documents", response_model=List[Document])
async def get_documents():
    docs = await list_documents()
    return docs

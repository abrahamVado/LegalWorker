from pydantic import BaseModel
from typing import List, Optional

class Citation(BaseModel):
    page_start: int
    page_end: int
    snippet: Optional[str] = None

class Overview(BaseModel):
    topic: str
    answer: str
    citations: List[Citation] = []

class Document(BaseModel):
    id: str
    name: str
    size: int
    pages: Optional[int] = None
    created_at: int
    # stored file name under storage dir
    file: Optional[str] = None
    # optional extracted overview
    overview: Optional[List[Overview]] = None

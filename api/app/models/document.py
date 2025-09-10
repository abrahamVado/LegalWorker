
from pydantic import BaseModel
from datetime import datetime

class Document(BaseModel):
    id: str
    filename: str
    size: int
    created_at: datetime
    path: str

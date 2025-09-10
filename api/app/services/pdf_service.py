
import os
import uuid
from datetime import datetime, timezone
from typing import List
from pathlib import Path
from fastapi import UploadFile
from app.core.config import settings
from app.models.document import Document

storage_dir = Path(settings.STORAGE_DIR)
storage_dir.mkdir(parents=True, exist_ok=True)

async def save_pdf_files(files: List[UploadFile]) -> List[Document]:
    saved: List[Document] = []
    for f in files:
        file_id = str(uuid.uuid4())
        safe_name = f.filename.replace("/", "_").replace("\\", "_")
        dest = storage_dir / f"{file_id}_{safe_name}"
        # stream write
        with dest.open("wb") as out:
            while True:
                chunk = await f.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        await f.close()
        st = dest.stat()
        saved.append(Document(
            id=file_id,
            filename=safe_name,
            size=st.st_size,
            created_at=datetime.fromtimestamp(st.st_ctime, tz=timezone.utc),
            path=str(dest),
        ))
    return saved

async def list_documents() -> List[Document]:
    docs: List[Document] = []
    if not storage_dir.exists():
        return docs
    for p in storage_dir.iterdir():
        if not p.is_file():
            continue
        name_lower = p.name.lower()
        if not (name_lower.endswith(".pdf") or ".pdf" in name_lower):
            continue
        st = p.stat()
        # id is prefix before first underscore if present
        file_id = p.name.split("_", 1)[0]
        docs.append(Document(
            id=file_id,
            filename=p.name.split("_", 1)[1] if "_" in p.name else p.name,
            size=st.st_size,
            created_at=datetime.fromtimestamp(st.st_ctime, tz=timezone.utc),
            path=str(p),
        ))
    # Most recent first
    docs.sort(key=lambda d: d.created_at, reverse=True)
    return docs

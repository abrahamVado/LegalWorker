import os
import io
import json
import time
import uuid
from typing import List, Dict, Any, Optional

import aiofiles
from fastapi import UploadFile

from app.settings import settings
from app.utils.paths import storage_paths, ensure_dir, safe_join
from app.models.document import Document, Overview

try:
    from PyPDF2 import PdfReader
except Exception:
    PdfReader = None

def _read_index(index_path: str) -> Dict[str, Any]:
    if not os.path.exists(index_path):
        return {"docs": {}}
    try:
        with open(index_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"docs": {}}

def _write_index(index_path: str, data: Dict[str, Any]):
    tmp = index_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, index_path)

async def _count_pages(file_bytes: bytes) -> Optional[int]:
    if PdfReader is None:
        return None
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        return len(reader.pages)
    except Exception:
        return None

async def save_pdf_files(files: List[UploadFile]) -> List[Document]:
    storage_dir, index_path = storage_paths(settings.STORAGE_DIR)
    ensure_dir(storage_dir)

    idx = _read_index(index_path)
    docs = idx.get("docs", {})

    results: List[Document] = []
    for up in files:
        raw = await up.read()
        pages = await _count_pages(raw)
        doc_id = uuid.uuid4().hex
        created_at = int(time.time())
        name = up.filename or f"document-{created_at}.pdf"
        size = len(raw)

        safe_name = name
        filename = f"{doc_id}__{safe_name}"
        out_path = safe_join(storage_dir, filename)
        async with aiofiles.open(out_path, "wb") as f:
            await f.write(raw)

        docs[doc_id] = {
            "id": doc_id,
            "name": name,
            "size": size,
            "pages": pages,
            "created_at": created_at,
            "file": filename,
            "overview": [],
        }

        results.append(Document(**docs[doc_id]))

    idx["docs"] = docs
    _write_index(index_path, idx)
    return results

async def list_documents() -> List[Document]:
    storage_dir, index_path = storage_paths(settings.STORAGE_DIR)
    idx = _read_index(index_path)
    docs = idx.get("docs", {})
    return [Document(**d) for d in docs.values()]

def get_document_path(doc_id: str) -> Optional[str]:
    storage_dir, index_path = storage_paths(settings.STORAGE_DIR)
    idx = _read_index(index_path)
    meta = idx.get("docs", {}).get(doc_id)
    if not meta:
        return None
    return os.path.join(storage_dir, meta["file"])

def get_document_meta(doc_id: str) -> Optional[Document]:
    storage_dir, index_path = storage_paths(settings.STORAGE_DIR)
    idx = _read_index(index_path)
    meta = idx.get("docs", {}).get(doc_id)
    return Document(**meta) if meta else None

def delete_document(doc_id: str) -> bool:
    storage_dir, index_path = storage_paths(settings.STORAGE_DIR)
    idx = _read_index(index_path)
    docs = idx.get("docs", {})
    meta = docs.pop(doc_id, None)
    if not meta:
        return False
    # delete file
    try:
        fpath = os.path.join(storage_dir, meta["file"])
        if os.path.exists(fpath):
            os.remove(fpath)
    except Exception:
        pass
    idx["docs"] = docs
    _write_index(index_path, idx)
    return True

def rename_document(doc_id: str, new_name: str) -> Optional[Document]:
    storage_dir, index_path = storage_paths(settings.STORAGE_DIR)
    idx = _read_index(index_path)
    docs = idx.get("docs", {})
    meta = docs.get(doc_id)
    if not meta:
        return None

    old_file = meta.get("file")
    safe_new = new_name or meta["name"]
    new_file = f"{doc_id}__{safe_new}"

    old_path = os.path.join(storage_dir, old_file)
    new_path = os.path.join(storage_dir, new_file)
    try:
        if os.path.exists(old_path):
            os.replace(old_path, new_path)
        meta["name"] = new_name
        meta["file"] = new_file
        docs[doc_id] = meta
        _write_index(index_path, idx)
        return Document(**meta)
    except Exception:
        return None

def set_overview(doc_id: str, overview: List[Overview]) -> bool:
    storage_dir, index_path = storage_paths(settings.STORAGE_DIR)
    idx = _read_index(index_path)
    docs = idx.get("docs", {})
    meta = docs.get(doc_id)
    if not meta:
        return False
    meta["overview"] = [o.model_dump() if hasattr(o, "model_dump") else o for o in overview]
    docs[doc_id] = meta
    _write_index(index_path, idx)
    return True

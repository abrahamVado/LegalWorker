import os
from app.utils.safe import safe_filename

def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)

def safe_join(base: str, name: str) -> str:
    return os.path.join(base, safe_filename(name))

def storage_paths(storage_dir: str):
    ensure_dir(storage_dir)
    index_path = os.path.join(storage_dir, "index.json")
    return storage_dir, index_path

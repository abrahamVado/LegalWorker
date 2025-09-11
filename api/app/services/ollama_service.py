# app/services/ollama_service.py
import httpx
from typing import Any, Dict, List, Optional
from app.settings import settings

BASE = settings.OLLAMA_URL

def _gpu_opts() -> Dict[str, Any]:
    o: Dict[str, Any] = {}
    if settings.OLLAMA_NUM_GPU_LAYERS is not None:
        o["num_gpu"] = settings.OLLAMA_NUM_GPU_LAYERS
    if settings.OLLAMA_MAIN_GPU is not None:
        o["main_gpu"] = settings.OLLAMA_MAIN_GPU
    if settings.OLLAMA_LOW_VRAM:
        o["low_vram"] = True
    return o

async def ollama_chat(messages: List[Dict[str, str]],
                      model: Optional[str] = None,
                      options: Optional[Dict[str, Any]] = None) -> str:
    merged = {**_gpu_opts(), **(options or {})}
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(f"{BASE}/api/chat", json={
            "model": model or settings.OLLAMA_MODEL,
            "messages": messages,
            "options": merged,
            "stream": False,
        })
        r.raise_for_status()
        data = r.json()
        return data.get("message", {}).get("content", "")

async def ollama_embed(texts: List[str], model: Optional[str] = None) -> List[List[float]]:
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(f"{BASE}/api/embeddings", json={
            "model": model or settings.OLLAMA_EMBED_MODEL,
            "input": texts,
            "options": _gpu_opts(),
        })
        r.raise_for_status()
        return r.json().get("embeddings", [])

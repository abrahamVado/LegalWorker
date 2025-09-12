# app/services/ollama_service.py
import os
import json
import httpx
from typing import List, Dict, Any, Optional
import asyncio
from httpx import ConnectTimeout

# ---------------- Config (override with env vars) ----------------
BASE         = os.getenv("OLLAMA_BASE", "http://127.0.0.1:11434")
EMBED_MODEL  = os.getenv("EMBED_MODEL", "nomic-embed-text")
CHAT_MODEL   = os.getenv("CHAT_MODEL", "llama3.1:8b")
_TIMEOUT = httpx.Timeout(timeout=180.0, connect=15.0)

# GPU knobs (env overrides)
#   OLLAMA_NUM_GPU   -> int (how much to offload; start with 1 and go up)
#   OLLAMA_MAIN_GPU  -> int (GPU index in multi-GPU rigs)
#   OLLAMA_LOW_VRAM  -> bool ('1','true','yes' -> True)
#   OLLAMA_NUM_CTX   -> int (optional, context window for chat)
#   OLLAMA_KEEP_ALIVE-> e.g. '5m' to keep model in VRAM
def _parse_bool(s: Optional[str]) -> Optional[bool]:
    if s is None: return None
    return s.lower() in ("1", "true", "yes", "on")

NUM_GPU_ENV    = os.getenv("OLLAMA_NUM_GPU")
MAIN_GPU_ENV   = os.getenv("OLLAMA_MAIN_GPU")
LOW_VRAM_ENV   = os.getenv("OLLAMA_LOW_VRAM")
NUM_CTX_ENV    = os.getenv("OLLAMA_NUM_CTX")
KEEP_ALIVE_ENV = os.getenv("OLLAMA_KEEP_ALIVE", "5m")  # helps keep VRAM warm

def _gpu_options() -> Dict[str, Any]:
    opts: Dict[str, Any] = {}
    if NUM_GPU_ENV is not None:
        try:
            opts["num_gpu"] = int(NUM_GPU_ENV)
        except ValueError:
            pass
    if MAIN_GPU_ENV is not None:
        try:
            opts["main_gpu"] = int(MAIN_GPU_ENV)
        except ValueError:
            pass
    b = _parse_bool(LOW_VRAM_ENV)
    if b is not None:
        opts["low_vram"] = b
    if NUM_CTX_ENV is not None:
        try:
            opts["num_ctx"] = int(NUM_CTX_ENV)
        except ValueError:
            pass
    return opts

# Reasonable timeouts (read can be longer for LLM)
_TIMEOUT = httpx.Timeout(timeout=120.0, connect=5.0)

# One shared async client
client = httpx.AsyncClient(
    base_url=BASE,
    timeout=_TIMEOUT,
    headers={"Accept": "application/json"},
    # Optional: keep-alive at transport level (httpx controls this by default)
)

# ---------------- Model presence / server helpers ----------------
async def _get_models(retries: int = 3, backoff: float = 1.0) -> Dict[str, Any]:
    last = None
    for i in range(retries):
        try:
            r = await client.get("/api/tags")
            r.raise_for_status()
            return r.json()
        except ConnectTimeout as e:
            last = e
            await asyncio.sleep(backoff * (2 ** i))  # 1s, 2s, 4s
    # final attempt (raise full error)
    r = await client.get("/api/tags")
    r.raise_for_status()
    return r.json()


async def _ensure_models():
    tags = await _get_models()
    names = {m.get("name") for m in tags.get("models", []) if isinstance(m, dict)}

    def present(model: str) -> bool:
        if not model:
            return True
        # accept prefix matches like "llama3.1:8b" vs "llama3.1:8b-q4_K_M"
        return any(name and (name == model or name.startswith(model)) for name in names)

    missing = [m for m in [EMBED_MODEL, CHAT_MODEL] if not present(m)]
    if missing:
        raise RuntimeError(
            f"Missing Ollama models: {missing}. "
            f"Install them: ollama pull {' '.join(missing)}"
        )

async def ollama_ps() -> Dict[str, Any]:
    """
    Return what's currently loaded (includes size_vram per model).
    Helpful to confirm GPU usage from code.
    """
    r = await client.get("/api/ps")
    r.raise_for_status()
    return r.json()

# ---------------- Public API ----------------
async def ollama_embed(texts: List[str]) -> List[List[float]]:
    """
    Returns one embedding per input string.
    Ollama /api/embeddings accepts ONE prompt per request.
    """
    await _ensure_models()
    out: List[List[float]] = []
    opts = _gpu_options()
    payload_base = {"model": EMBED_MODEL}
    if KEEP_ALIVE_ENV:
        payload_base["keep_alive"] = KEEP_ALIVE_ENV  # keep model warm in VRAM

    for idx, t in enumerate(texts):
        prompt = (t or "").strip()
        if not prompt:
            out.append([])
            continue
        try:
            payload = dict(payload_base)
            payload.update({"prompt": prompt})
            if opts:
                payload["options"] = opts
            r = await client.post("/api/embeddings", json=payload)
            r.raise_for_status()
            data = r.json()
            vec = data.get("embedding")
            if not vec:
                # Some builds expose an OpenAI-like shape
                vec = (data.get("data") or [{}])[0].get("embedding")
            if not vec:
                raise RuntimeError(f"no embedding received (status={r.status_code}, body={r.text[:200]})")
            out.append(vec)
        except Exception as e:
            raise RuntimeError(f"Ollama embeddings error at item {idx}: {e}") from e
    return out

async def ollama_chat(messages: List[Dict[str, str]]) -> str:
    """
    Chat with stream disabled so we always get the full JSON response.
    messages = [{role:'system'|'user'|'assistant', content:'...'}, ...]
    """
    await _ensure_models()
    opts = _gpu_options()
    payload: Dict[str, Any] = {
        "model": CHAT_MODEL,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0.2,
            # You can add more defaults here (top_p, repeat_penalty, etc.)
        },
    }
    if KEEP_ALIVE_ENV:
        payload["keep_alive"] = KEEP_ALIVE_ENV
    if opts:
        # merge GPU/context options
        payload["options"].update(opts)

    try:
        r = await client.post("/api/chat", json=payload)
        r.raise_for_status()
        data = r.json()
        # Newer /api/chat shape:
        msg = (data.get("message") or {}).get("content")
        if msg:
            return str(msg).strip()
        # Fallback to /api/generate-like field if server returns it
        if "response" in data:
            return str(data["response"]).strip()
        # Last resort: raw text
        return r.text.strip()
    except Exception as e:
        raise RuntimeError(f"Ollama chat error: {e}") from e

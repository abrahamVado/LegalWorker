
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse, RedirectResponse
from pathlib import Path

from app.core.config import settings
from app.api.routers.upload import router as upload_router
from app.api.routers.documents import router as documents_router

app = FastAPI(title=settings.APP_NAME)

# CORS for dev (allow Vite)
if settings.ENV.lower() == "dev":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Routers (API)
app.include_router(upload_router, prefix="/api", tags=["upload"])
app.include_router(documents_router, prefix="/api", tags=["documents"])

# Health check
@app.get("/health")
def health():
    return {"status": "ok"}

# Static serving (production-friendly). Mount if directory exists and not empty.
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

    # Optional: redirect root to index.html explicitly (StaticFiles html=True already does this)
    @app.get("/", include_in_schema=False)
    def root_index():
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        return RedirectResponse(url="/docs")

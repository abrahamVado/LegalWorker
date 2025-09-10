
# FastAPI Backend — Legal Document Analyzer

A lightweight FastAPI backend to support your React/Vite front‑end for the legal PDF analyzer.

## Features
- ✅ **PDF Upload** (single or multiple files) with filtering and basic metadata
- ✅ **List Documents** from local storage
- ✅ **CORS** enabled for local dev with Vite
- ✅ **Static Serving** for production (serve built React from `app/static/`)
- ✅ **12‑factor** configuration via `.env` (Pydantic Settings)
- ✅ **Dockerfile** and `uvicorn` entry

> In dev: run FastAPI and Vite separately (CORS on).
> In prod: put your built frontend (`dist`) into `app/static/` (rename folder or copy files) and FastAPI will serve it.

## Quickstart (dev)
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# run API
uvicorn app.main:app --reload --port 8000
# API docs: http://localhost:8000/docs

# run your Vite app on port 5173 (typical) and point it at http://localhost:8000
```

## Env
Create `.env` from the example:
```bash
cp .env.example .env
```

### Notable variables
- `APP_NAME` — display name
- `ENV` — `dev` / `prod`
- `ALLOWED_ORIGINS` — CSV of origins for CORS (e.g. `http://localhost:5173,http://127.0.0.1:5173`)
- `STORAGE_DIR` — where PDFs are stored (defaults to `app/storage/documents`)

## API
- `POST /api/upload` — multipart upload for PDF files (accepts multiple `files`)
- `GET /api/documents` — list stored documents (filename, size, created_at)
- `GET /health` — liveness check

OpenAPI docs at `/docs`.

## Frontend (prod)
Put your built frontend files into `app/static/` (e.g., copy Vite's `dist` contents). The app mounts that directory at `/` and serves `index.html` for unknown routes to support SPA routing.

## Tests
Example placeholder under `tests/`.

## Docker
```bash
docker build -t legal-analyzer-api .
docker run --rm -it -p 8000:8000 --env-file .env -v $(pwd)/app/storage:/app/app/storage legal-analyzer-api
```

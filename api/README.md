# FastAPI Backend — Legal Document Analyzer (Full)

A production-ready FastAPI backend tailored for your React/Vite front‑end.

## What’s included
- **Frontend contract**:
  - `POST /api/ingest` — single PDF upload (`file`) → `{ ok, doc_id, chunks, overview }`
  - `POST /api/ask` — stubbed Q&A → `{ answer }`
- **Files API**:
  - `POST /api/upload` — multi-upload (`files[]`)
  - `GET /api/documents` — list all docs
  - `GET /api/documents/{id}` — single doc metadata
  - `PATCH /api/documents/{id}` — rename (and renames file on disk)
  - `DELETE /api/documents/{id}` — delete metadata + file
  - `GET /api/documents/{id}/file` — stream PDF (supports HTTP Range)
- **CORS** via `.env` (`ALLOWED_ORIGINS`)
- **Static serving**: drop your built frontend (Vite `dist`) into `app/static/`
- **Storage**: files under `app/storage/documents/`, index JSON maintained
- **Env/Settings** with `pydantic-settings`
- **Dockerfile** and `requirements.txt`

## Quickstart
```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
# OpenAPI: http://127.0.0.1:8000/docs
```

## Configure frontend
Set the base URL in your Vite app:
```
VITE_API_BASE=http://127.0.0.1:8000
```

## Endpoints (summary)
- `GET /health`
- `POST /api/ingest`
- `POST /api/ask`
- `POST /api/upload`
- `GET /api/documents`
- `GET /api/documents/{id}`
- `PATCH /api/documents/{id}`
- `DELETE /api/documents/{id}`
- `GET /api/documents/{id}/file`

## Docker
```bash
docker build -t legal-analyzer-api .
docker run --rm -it -p 8000:8000 --env-file .env -v $(pwd)/app/storage:/app/app/storage legal-analyzer-api
```

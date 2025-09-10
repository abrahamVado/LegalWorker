# PDF Workspace — React Frontend

Implements your light design with:
- **Drag & drop** PDF uploads (anywhere on the window)
- **Sidebar library** to administer uploaded PDFs (rename/delete)
- **Viewer**: PDF canvas (pdf.js) + tools
- **Chat pane** with two tabs: **QuickDashboard** and **Chat with model**

## Run
1. `npm install`
2. Create `.env` with your API base (or rely on default):
   ```
   VITE_API_BASE=http://127.0.0.1:8080
   ```
3. `npm run dev`

## Where to plug your FastAPI
- Ingest endpoint: `POST /api/ingest` returning `{ ok, doc_id, chunks, overview[] }`. Implemented in `src/store/useStore.ts` `addFiles()`.
- Ask endpoint: `POST /api/ask` returning `{ answer }`. Implemented in `src/store/useStore.ts` `send()`.

## Notes
- For preview, we render **page 1** of each PDF using `pdfjs-dist` with a local `blob:` URL.
- The sidebar shows a processing card while multiple files are being ingested.
- You can expand QuickDashboard to render your legal checklist answers with citations.

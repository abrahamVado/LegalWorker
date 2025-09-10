import React, { useCallback, useRef, useState } from "react";
import { PiFilePdfDuotone, PiFolderDuotone } from "react-icons/pi";
import "./IntroStep.css";

/*─────────────────────────────────────────────────────────────────────────────
  IntroStep: Step 1 of the workflow
  - Lets the user add PDFs (via drag/drop, file picker, or folder picker).
  - Normalizes dropped/selected input so only PDF files are passed upwards.
  - Calls `onReady(files)` with the selected PDFs.
─────────────────────────────────────────────────────────────────────────────*/
export default function IntroStep({
  onReady,
}: {
  onReady: (files: File[]) => void;
}) {
  /*───────────────────────────────────────────────────────────────────────────
    #1 — Local state + refs
    - isDragging: highlights drop zone while dragging
    - zoneRef: reference to drop zone for drag-leave checks
    - fileInputRef / folderInputRef: hidden <input> elements to trigger pickers
  ───────────────────────────────────────────────────────────────────────────*/
  const [isDragging, setDragging] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  /*───────────────────────────────────────────────────────────────────────────
    #2 — Directory reader (recursive)
    - Uses webkit directory API (non-standard) to read files recursively.
    - Collects files in subfolders as well.
  ───────────────────────────────────────────────────────────────────────────*/
  const readDirectory = async (dirEntry: any): Promise<File[]> => {
    const acc: File[] = [];
    const reader = dirEntry.createReader();
    const readBatch = (): Promise<any[]> =>
      new Promise((resolve) => reader.readEntries(resolve));

    let entries: any[] = [];
    do {
      entries = await readBatch();
      for (const entry of entries) {
        if (entry.isFile) {
          const file: File = await new Promise((res) => entry.file(res));
          acc.push(file);
        } else if (entry.isDirectory) {
          const nested = await readDirectory(entry);
          acc.push(...nested);
        }
      }
    } while (entries.length > 0);
    return acc;
  };

  /*───────────────────────────────────────────────────────────────────────────
    #3 — Normalize DataTransfer (drag/drop)
    - Supports dropping single PDFs, multiple PDFs, or entire folders.
    - Filters out only `.pdf` files.
  ───────────────────────────────────────────────────────────────────────────*/
  const collectPDFFilesFromDataTransfer = useCallback(
    async (dt: DataTransfer): Promise<File[]> => {
      const out: File[] = [];
      const items = Array.from(dt.items || []);

      for (const item of items) {
        if (item.kind !== "file") continue;
        const anyItem = item as any;
        const entry = anyItem.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          const files = await readDirectory(entry);
          out.push(...files);
        } else {
          const f = item.getAsFile();
          if (f) out.push(f);
        }
      }

      // fallback: plain file list
      if (out.length === 0 && dt.files) out.push(...Array.from(dt.files));

      // only PDFs
      return out.filter(
        (f) =>
          f.type === "application/pdf" ||
          f.name.toLowerCase().endsWith(".pdf"),
      );
    },
    [],
  );

  /*───────────────────────────────────────────────────────────────────────────
    #4 — Drag/drop handlers
  ───────────────────────────────────────────────────────────────────────────*/
  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      const files = await collectPDFFilesFromDataTransfer(e.dataTransfer);
      onReady(files);
    },
    [collectPDFFilesFromDataTransfer, onReady],
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!zoneRef.current?.contains(e.relatedTarget as Node)) setDragging(false);
  }, []);

  /*───────────────────────────────────────────────────────────────────────────
    #5 — File/Folder picker helpers
  ───────────────────────────────────────────────────────────────────────────*/
  const onPickFiles = useCallback(() => fileInputRef.current?.click(), []);
  const onPickFolder = useCallback(() => folderInputRef.current?.click(), []);

  const onFilesSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files ? Array.from(e.target.files) : [];
      onReady(list);
      e.target.value = ""; // reset so re-picking same file works
    },
    [onReady],
  );

  /*───────────────────────────────────────────────────────────────────────────
    #6 — Render
    - Viewer frame → Drop zone → Centered card with actions
  ───────────────────────────────────────────────────────────────────────────*/
  return (
    <main className="canvas intro">
      <section className="window window--onecol">
        <div className="viewer" style={{ background: "transparent" }}>
          {/* Top bar */}
          <div className="viewer__bar">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <strong>Legal Document Analyzer</strong>
              
            </div>
            <div className="tools">
              <div className="crumb" />
            </div>
          </div>

          {/* Content area */}
          <div className="viewer__content" style={{ gridTemplateColumns: "1fr" }}>
            <div
              className={`pdf-pane ${isDragging ? "dragging" : ""}`}
              ref={zoneRef}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              role="region"
              aria-label="Drop PDFs here"
              /* Center children vertically/horizontally */
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: "60vh", // ensures vertical space
              }}
            >
              <div className="card intro-card">
                <h2>Bring your legal documents</h2>
                <p className="muted">
                  Drop files or an entire folder. We’ll only import PDFs.
                </p>

                <div className="button-flex-scope">
                  <div className="btn-container">
                    <button
                      className="button-flex btn--indigo has-left-icon btn--sm"
                      onClick={onPickFiles}
                    >
                      <span
                        className="button-flex__icon button-flex__icon--left"
                        aria-hidden
                      >
                        <PiFilePdfDuotone size={40} color="#fff" />
                      </span>
                      <span>Select PDF files</span>
                    </button>
                    <button
                      className="button-flex btn--violet has-left-icon btn--sm"
                      onClick={onPickFolder}
                    >
                      <span
                        className="button-flex__icon button-flex__icon--left"
                        aria-hidden
                      >
                        <PiFolderDuotone size={40} color="#fff" />
                      </span>
                      <span>Select a folder</span>
                    </button>
                  </div>
                </div>

                <p className="hint">
                  …or drag &amp; drop anywhere inside the dashed box
                </p>
              </div>   
            </div>
          </div>
        </div>

        {/* Hidden inputs (triggered by buttons) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          style={{ display: "none" }}
          onChange={onFilesSelected}
        />
        <input
          ref={folderInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={onFilesSelected}
          // @ts-expect-error non-standard
          webkitdirectory=""
          directory=""
        />
      </section>
    </main>
  );
}

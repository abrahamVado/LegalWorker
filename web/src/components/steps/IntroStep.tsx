import React, { useCallback, useRef, useState } from 'react'
import { PiFilePdfDuotone, PiFolderDuotone } from 'react-icons/pi'
import './IntroStep.css'

export default function IntroStep({ onReady }: { onReady: (files: File[]) => void }) {
  const [isDragging, setDragging] = useState(false)
  const zoneRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const readDirectory = async (dirEntry: any): Promise<File[]> => {
    const acc: File[] = []
    const reader = dirEntry.createReader()
    const readBatch = (): Promise<any[]> => new Promise(resolve => reader.readEntries(resolve))
    let entries: any[] = []
    do {
      entries = await readBatch()
      for (const entry of entries) {
        if (entry.isFile) {
          const file: File = await new Promise(res => entry.file(res))
          acc.push(file)
        } else if (entry.isDirectory) {
          const nested = await readDirectory(entry)
          acc.push(...nested)
        }
      }
    } while (entries.length > 0)
    return acc
  }

  const collectPDFFilesFromDataTransfer = useCallback(async (dt: DataTransfer): Promise<File[]> => {
    const out: File[] = []
    const items = Array.from(dt.items || [])
    for (const item of items) {
      if (item.kind !== 'file') continue
      const anyItem = item as any
      const entry = anyItem.webkitGetAsEntry?.()
      if (entry?.isDirectory) {
        const files = await readDirectory(entry)
        out.push(...files)
      } else {
        const f = item.getAsFile()
        if (f) out.push(f)
      }
    }
    if (out.length === 0 && dt.files) out.push(...Array.from(dt.files))
    return out.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
  }, [])

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    const files = await collectPDFFilesFromDataTransfer(e.dataTransfer)
    onReady(files)
  }, [collectPDFFilesFromDataTransfer, onReady])

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!zoneRef.current?.contains(e.relatedTarget as Node)) setDragging(false)
  }, [])

  const onPickFiles = useCallback(() => fileInputRef.current?.click(), [])
  const onPickFolder = useCallback(() => folderInputRef.current?.click(), [])

  const onFilesSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : []
    onReady(list)
    e.target.value = ''
  }, [onReady])

  return (
    <main className="canvas intro">
      <section className="window window--onecol">
        <div className="viewer" style={{ background: 'transparent' }}>
          <div className="viewer__bar">
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <strong>Legal Document Analyzer</strong>
              <div className="crumb" />
            </div>
            <div className="tools">
              <span className="pill">Step 1</span>
              <span className="muted">Add PDFs</span>
            </div>
          </div>

          <div className="viewer__content" style={{ gridTemplateColumns: '1fr' }}>
            <div
              className={`pdf-pane dotted \${isDragging ? 'dragging' : ''}`}
              ref={zoneRef}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              role="region"
              aria-label="Drop PDFs here"
            >
              <div className="card intro-card">
                <h2>Bring your legal documents</h2>
                <p className="muted">Drop files or an entire folder. We’ll only import PDFs.</p>

                <div className="button-flex-scope">
                  <div className="btn-container">
                    <button className="button-flex btn--indigo has-left-icon btn--md" onClick={onPickFiles}>
                      <span className="button-flex__icon button-flex__icon--left" aria-hidden>
                        <PiFilePdfDuotone size={40} color="#fff" />
                      </span>
                      <span>Select PDF files</span>
                    </button>
                    <button className="button-flex btn--violet has-left-icon btn--md" onClick={onPickFolder}>
                      <span className="button-flex__icon button-flex__icon--left" aria-hidden>
                        <PiFolderDuotone size={40} color="#fff" />
                      </span>
                      <span>Select a folder</span>
                    </button>
                  </div>
                </div>

                <p className="hint">…or drag &amp; drop anywhere inside the dashed box</p>
              </div>
            </div>
          </div>
        </div>

        {/* Hidden inputs */}
        <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" multiple style={{ display: 'none' }} onChange={onFilesSelected} />
        <input ref={folderInputRef} type="file" style={{ display: 'none' }} onChange={onFilesSelected}
          // @ts-expect-error non-standard
          webkitdirectory="" directory="" />
      </section>
    </main>
  )
}

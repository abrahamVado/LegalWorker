import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Viewer from '@/components/Viewer'
import { useStore } from '@/store/useStore'
import QuickDash from '@components/QuickDash'
import FileTreeSidebar from '@/components/steps/FileTreeSidebar'
import './WorkspaceStep.css'
import RightSidebar from '@components/RightSidebar';

const ACCEPT = ['application/pdf']
const ACCEPT_EXT = ['.pdf']

function isPdfFile(f: File) {
  const nameOk = f.name?.toLowerCase().endsWith('.pdf')
  const typeOk = ACCEPT.includes((f.type || '').toLowerCase())
  return nameOk || typeOk
}

async function extractFilesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const out: File[] = []
  if (dt.items && dt.items.length) {
    for (const it of Array.from(dt.items)) {
      if (it.kind === 'file') {
        const f = it.getAsFile()
        if (f && isPdfFile(f)) out.push(f)
      }
    }
    return out
  }
  if (dt.files && dt.files.length) {
    for (const f of Array.from(dt.files)) if (isPdfFile(f)) out.push(f)
  }
  return out
}

/** ------- Right panel with tabs (KPIs | Chat) ------- */
function RightPanel() {
  const [tab, setTab] = useState<'kpis' | 'chat'>('kpis')
  const selectedId = useStore(s => s.selectedId)
  const messages = useStore(s => (selectedId ? (s.messages[selectedId] || []) : []))
  const send = useStore(s => s.send)

  const [text, setText] = useState('')
  const canSend = useMemo(() => (selectedId && text.trim().length > 0), [selectedId, text])

  return (
    <div className="rp">
      <div className="rp__tabs" role="tablist" aria-label="Details">
        <button
          role="tab"
          aria-selected={tab === 'kpis'}
          className={tab === 'kpis' ? 'active' : ''}
          onClick={() => setTab('kpis')}
        >
          KPIs
        </button>
        <button
          role="tab"
          aria-selected={tab === 'chat'}
          className={tab === 'chat' ? 'active' : ''}
          onClick={() => setTab('chat')}
        >
          Chat
        </button>
      </div>

      <div className="rp__body">
        {tab === 'kpis' ? (
          <div className="rp__kpis" role="tabpanel" aria-label="KPIs">
            <QuickDash />
          </div>
        ) : (
          <div className="rp__chat" role="tabpanel" aria-label="Chat with model">
            <div className="chatlog" aria-live="polite">
              {messages.length === 0 ? (
                <div className="muted">Ask anything about the selected PDF.</div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`bubble bubble--${m.role}`}>
                    {m.text}
                  </div>
                ))
              )}
            </div>
            <form
              className="chatform"
              onSubmit={e => {
                e.preventDefault()
                if (!canSend) return
                void send(text)
                setText('')
              }}
            >
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Ask the model about this PDF…"
                rows={3}
              />
              <div className="row">
                <button type="submit" className="btn btn--primary" disabled={!canSend}>
                  Ask
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

export default function WorkspaceStep() {
  const addFiles = useStore(s => s.addFiles)
  const [isDragging, setDragging] = useState(false)
  const [dragCount, setDragCount] = useState(0)
  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => { e.preventDefault(); setDragCount(c => (c === 0 && setDragging(true), c + 1)) }
    const onDragOver = (e: DragEvent) => { e.preventDefault() }
    const onDragLeave = (e: DragEvent) => { e.preventDefault(); setDragCount(c => { const n = Math.max(0, c - 1); if (n === 0) setDragging(false); return n }) }
    const onDrop = async (e: DragEvent) => {
      e.preventDefault(); setDragCount(0); setDragging(false)
      if (!e.dataTransfer) return
      const files = await extractFilesFromDataTransfer(e.dataTransfer)
      if (files.length) void addFiles(files)
    }
    const opts: AddEventListenerOptions & EventListenerOptions = { passive: false }
    window.addEventListener('dragenter', onDragEnter, opts)
    window.addEventListener('dragover', onDragOver, opts)
    window.addEventListener('dragleave', onDragLeave, opts)
    window.addEventListener('drop', onDrop, opts)
    return () => {
      window.removeEventListener('dragenter', onDragEnter, opts)
      window.removeEventListener('dragover', onDragOver, opts)
      window.removeEventListener('dragleave', onDragLeave, opts)
      window.removeEventListener('drop', onDrop, opts)
    }
  }, [addFiles])

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const picked: File[] = []
      for (const it of Array.from(items)) {
        if (it.kind === 'file') {
          const f = it.getAsFile()
          if (f && isPdfFile(f)) picked.push(f)
        }
      }
      if (picked.length) { e.preventDefault(); void addFiles(picked) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = e.target.files ? Array.from(e.target.files) : []
    const pdfs = fs.filter(isPdfFile)
    if (pdfs.length) void addFiles(pdfs)
    e.target.value = ''
  }, [addFiles])

  return (
    <main className="canvas">
      <section className="window window--workspace" role="group" aria-label="PDF workspace">
        {/* External left sidebar (keep this – you said it's nice) */}
        <div data-file-tree-sidebar>
          <FileTreeSidebar />
        </div>

        {/* Center + Right live inside Viewer; left disabled; right hosts KPIs+Chat */}
        <div className="workspace-center">
          <Viewer showLeft={false} showRight={true} rightSlot={<RightSidebar />} pdfMode="native" />
        </div>

        {/* Drop Overlay */}
        <div
          ref={overlayRef}
          className={`drop-overlay ${isDragging ? 'active' : ''}`}
          aria-hidden={!isDragging}
          aria-live="polite"
          onClick={() => inputRef.current?.click()}
          title="Click to pick PDFs, or drop them here"
        >
          <div className="box">Drop PDFs or folders anywhere<br/><small>(or click to pick)</small></div>
        </div>

        {/* Hidden input */}
        <input
          ref={inputRef}
          type="file"
          accept={[...ACCEPT, ...ACCEPT_EXT].join(',')}
          multiple
          // @ts-expect-error non-standard but widely supported
          webkitdirectory="true"
          style={{ display: 'none' }}
          onChange={onPick}
        />
      </section>
    </main>
  )
}

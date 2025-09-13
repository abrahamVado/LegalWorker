import React, { useCallback, useEffect, useRef, useState } from 'react'
import Viewer from '@/components/Viewer'
import { useStore } from '@/store/useStore'
import FileTreeSidebar from '@/components/steps/FileTreeSidebar'
import RightSidebar from '@components/RightSidebar'
import './WorkspaceStep.css' // keep your base SCSS; add the CSS snippet below

const ACCEPT = ['application/pdf']
const ACCEPT_EXT = ['.pdf']
const STORE_KEY = 'workspace-cols-v1'
const HANDLE = 6

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
  if (dt.files && dt.files.length) for (const f of Array.from(dt.files)) if (isPdfFile(f)) out.push(f)
  return out
}

export default function WorkspaceStep() {
  const addFiles = useStore(s => s.addFiles)

  // === Refs for layout pieces
  const outerRef = useRef<HTMLElement>(null)     // <section class="window window--workspace">
  const innerRef = useRef<HTMLDivElement>(null)  // inner Center|Handle|Right grid
  const outerHandleRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // === Load/persist sizes (outer left + inner right)
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} } }
  const init = load()
  const [outerLeft, setOuterLeft] = useState<number>(Number.isFinite(init.outerLeft) ? init.outerLeft : 260)
  const [rightW, setRightW]       = useState<number>(Number.isFinite(init.right) ? init.right : 340)

  // Minimums (tune as needed)
  const MIN = { left: 120, center: 240, right: 120 }

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ outerLeft, right: rightW }))
  }, [outerLeft, rightW])

  // Apply OUTER grid override + place outer handle
  useEffect(() => {
    if (!outerRef.current) return
    outerRef.current.style.gridTemplateColumns = `${Math.round(outerLeft)}px 1fr`
    if (outerHandleRef.current) {
      outerHandleRef.current.style.left = `${Math.round(outerLeft - HANDLE / 2)}px`
      outerHandleRef.current.style.width = `${HANDLE}px`
    }
  }, [outerLeft])

  // Clamp helpers
  const clampOuter = useCallback(() => {
    if (!outerRef.current) return
    const total = outerRef.current.clientWidth
    const maxOuter = total - (MIN.center + HANDLE + rightW)    // leave room for center min + inner handle + right
    setOuterLeft(v => Math.max(MIN.left, Math.min(v, maxOuter)))
  }, [rightW])

  const clampRight = useCallback(() => {
    if (!innerRef.current) return
    const innerWidth = innerRef.current.clientWidth
    const maxRight = innerWidth - (HANDLE + MIN.center)
    setRightW(v => Math.max(MIN.right, Math.min(v, maxRight)))
  }, [])

  // Observe container size changes
  useEffect(() => {
    const ros: ResizeObserver[] = []
    if (outerRef.current) {
      const ro = new ResizeObserver(clampOuter)
      ro.observe(outerRef.current); ros.push(ro)
    }
    if (innerRef.current) {
      const ro = new ResizeObserver(clampRight)
      ro.observe(innerRef.current); ros.push(ro)
    }
    return () => ros.forEach(r => r.disconnect())
  }, [clampOuter, clampRight])

  // === Drag logic (pointer + mouse + touch)
  const drag = useRef<{
    which: 'outer'|'right'
    startX: number
    startOuter: number
    startRight: number
    outerW: number
    innerW: number
  } | null>(null)

  const getX = (ev: any) =>
    typeof ev.clientX === 'number' ? ev.clientX
    : ev.touches?.[0]?.clientX ?? ev.changedTouches?.[0]?.clientX ?? 0

  const begin = (which: 'outer'|'right', x: number) => {
    drag.current = {
      which,
      startX: x,
      startOuter: outerLeft,
      startRight: rightW,
      outerW: outerRef.current?.clientWidth ?? 0,
      innerW: innerRef.current?.clientWidth ?? 0,
    }
    window.addEventListener('pointermove', onMove as any, { passive: false })
    window.addEventListener('pointerup', onUp as any, { passive: true })
    window.addEventListener('mousemove', onMove as any, { passive: false })
    window.addEventListener('mouseup', onUp as any, { passive: true })
    window.addEventListener('touchmove', onMove as any, { passive: false })
    window.addEventListener('touchend', onUp as any, { passive: true })
    window.addEventListener('touchcancel', onUp as any, { passive: true })
  }

  const onMove = (ev: Event) => {
    const s = drag.current
    if (!s) return
    const dx = getX(ev) - s.startX
    if (s.which === 'outer') {
      const maxOuter = s.outerW - (MIN.center + HANDLE + rightW)
      setOuterLeft(Math.max(MIN.left, Math.min(s.startOuter + dx, maxOuter)))
    } else {
      const maxRight = s.innerW - (HANDLE + MIN.center)
      setRightW(Math.max(MIN.right, Math.min(s.startRight - dx, maxRight)))
    }
  }

  const onUp = () => {
    drag.current = null
    window.removeEventListener('pointermove', onMove as any)
    window.removeEventListener('pointerup', onUp as any)
    window.removeEventListener('mousemove', onMove as any)
    window.removeEventListener('mouseup', onUp as any)
    window.removeEventListener('touchmove', onMove as any)
    window.removeEventListener('touchend', onUp as any)
    window.removeEventListener('touchcancel', onUp as any)
    clampOuter(); clampRight()
  }

  // Bindings
  const outerPointerDown = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); begin('outer', e.clientX) }
  const outerMouseDown   = (e: React.MouseEvent)   => begin('outer', e.clientX)
  const outerTouchStart  = (e: React.TouchEvent)   => begin('outer', e.touches[0]?.clientX ?? 0)

  const rightPointerDown = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); begin('right', e.clientX) }
  const rightMouseDown   = (e: React.MouseEvent)   => begin('right', e.clientX)
  const rightTouchStart  = (e: React.TouchEvent)   => begin('right', e.touches[0]?.clientX ?? 0)

  // === DnD + paste
  const [isDragging, setDragging] = useState(false)
  const [dragCount, setDragCount] = useState(0)

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => { e.preventDefault(); setDragCount(c => (c === 0 && setDragging(true), c + 1)) }
    const onDragOver  = (e: DragEvent) => { e.preventDefault() }
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
      {/* Outer 2-col grid comes from your base SCSS: .window.window--workspace { grid-template-columns: 260px 1fr; } */}
      <section ref={outerRef} className="window window--workspace" role="group" aria-label="PDF workspace">
        {/* OUTER LEFT column */}
        <div data-file-tree-sidebar>
          <FileTreeSidebar />
        </div>

        {/* OUTER RIGHT cell → inner Center|Handle|Right */}
        <div className="workspace-center">
          <div
            ref={innerRef}
            className="center-right-grid"
            style={
              {
                ['--right' as any]: `${rightW}px`,
                ['--handle' as any]: `${HANDLE}px`,
                ['--center-min' as any]: `${MIN.center}px`,
              } as React.CSSProperties
            }
          >
            {/* Center */}
            <section className="cr-col cr-col--center">
              <Viewer showLeft={false} showRight={false} pdfMode="native" />
            </section>

            {/* Inner handle */}
            <div
              className="cr-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize right panel"
              tabIndex={0}
              onPointerDown={rightPointerDown}
              onMouseDown={rightMouseDown}
              onTouchStart={rightTouchStart}
            />

            {/* Right */}
            <aside className="cr-col cr-col--right">
              <RightSidebar />
            </aside>
          </div>
        </div>

        {/* OUTER handle overlaying the outer split */}
        <div
          ref={outerHandleRef}
          className="ws-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize left sidebar"
          tabIndex={0}
          onPointerDown={outerPointerDown}
          onMouseDown={outerMouseDown}
          onTouchStart={outerTouchStart}
          title="Drag to resize left sidebar"
        />

        {/* Hidden input for click-to-upload */}
        <input
          id="hidden-file-input"
          ref={inputRef}
          type="file"
          accept={[...ACCEPT, ...ACCEPT_EXT].join(',')}
          multiple
          // @ts-expect-error non-standard but widely supported
          webkitdirectory="true"
          style={{ display: 'none' }}
          onChange={onPick}
        />

        {/* Drop overlay (optional) */}
        <div
          className={`drop-overlay ${isDragging ? 'active' : ''}`}
          aria-hidden={!isDragging}
          aria-live="polite"
          title="Click to pick PDFs, or drop them here"
          onClick={() => inputRef.current?.click()}
        >
          <div className="box">Drop PDFs or folders anywhere<br/><small>(or click to pick)</small></div>
        </div>
      </section>
    </main>
  )
}

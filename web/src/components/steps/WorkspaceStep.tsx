import React, { useEffect, useRef, useState } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { Viewer } from '@/components/Viewer'
import { useStore } from '@/store/useStore'
import './WorkspaceStep.css'

export default function WorkspaceStep() {
  const addFiles = useStore(s => s.addFiles)
  const [isDragging, setDragging] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true) }
    const onDragLeave = (e: DragEvent) => { e.preventDefault(); setDragging(false) }
    const onDrop = (e: DragEvent) => {
      e.preventDefault(); setDragging(false)
      const files = e.dataTransfer?.files
        ? Array.from(e.dataTransfer.files).filter(
            f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
          )
        : []
      addFiles(files as File[])
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addFiles])

  return (
    <main className="canvas">
      <section className="window" role="group" aria-label="PDF workspace" style={{ position:'relative' }}>
        <Sidebar />
        <Viewer />
        <div ref={overlayRef} className={`drop-overlay ${isDragging ? 'active' : ''}`}>
          <div className="box">Drop PDFs anywhere</div>
        </div>
      </section>
    </main>
  )
}

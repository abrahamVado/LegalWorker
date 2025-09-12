// components/Viewer.tsx
import React, { useMemo } from 'react'
import { useStore, buildTreeFromDocs } from '@/store/useStore'
import { PdfCanvas } from '@/components/PdfCanvas'
import FolderTree from '@/components/FolderTree'
import './Viewer.css'

type ViewerProps = {
  showLeft?: boolean
  showRight?: boolean
  rightSlot?: React.ReactNode
  /** 'native' uses the browser PDF viewer (iframe), 'canvas' uses pdf.js canvas */
  pdfMode?: 'native' | 'canvas'
}

export default function Viewer({
  showLeft = true,
  showRight = true,
  rightSlot = null,
  pdfMode = 'native',
}: ViewerProps) {
  const docs = useStore(s => s.docs)
  const order = useStore(s => s.order)
  const selectedId = useStore(s => s.selectedId)
  const setSelectedId = useStore(s => s.setSelectedId ?? s.select)

  const doc = selectedId ? docs[selectedId] : undefined
  const treeRoot = useMemo(() => buildTreeFromDocs(docs, order), [docs, order])
  const selectedNodeId = selectedId ? `f:${selectedId}` : undefined

  // Build grid columns based on which sidebars are shown
  const gridCols = `${showLeft ? '280px ' : ''}1fr${showRight ? ' 340px' : ''}`

  return (
    <section className="viewer viewer--3col" aria-label="Document workspace">
      <header className="viewer__bar">
        <div className="crumb" aria-live="polite">Workspace</div>
        <div className="tools">
          <span className="pill">
            {doc ? 1 : 0} <span className="muted">/ {doc ? (doc.pages || '…') : 0}</span>
          </span>
        </div>
      </header>

      <div
        className="viewer__content viewer__content--3col"
        style={{ gridTemplateColumns: gridCols }}
      >
        {/* LEFT: Folder tree */}
        {showLeft && (
          <aside className="col col--left" aria-label="Folder tree">
            <nav className="tree" aria-label="Workspace">
              <FolderTree
                root={treeRoot}
                selectedId={selectedNodeId}
                onSelect={(nodeId: string) => {
                  if (nodeId.startsWith('f:')) setSelectedId(nodeId.slice(2))
                }}
              />
            </nav>
          </aside>
        )}

        {/* CENTER: PDF report */}
        <main className="col col--center" aria-label="Report">
          {!doc ? (
            <div className="empty empty--center">
              <div className="card card--ghost">
                <h3>Select a PDF to access its report</h3>
                <p className="muted">Choose a file from the folder tree on the left.</p>
              </div>
            </div>
          ) : (
            <section className="report">
              <div className="report__header">
                <strong title={doc.name}>{doc.name}</strong>
              </div>
              <div className="report__body">
                {pdfMode === 'native' ? (
                  <iframe
                    className="pdf-frame"
                    src={doc.blobUrl || undefined}
                    title={doc.name}
                  />
                ) : (
                  <PdfCanvas blobUrl={doc.blobUrl || undefined} />
                )}
              </div>
            </section>
          )}
        </main>

        {/* RIGHT: Whatever you pass in rightSlot (KPIs/Chat) */}
        {showRight && (
          <aside className="col col--right" aria-label="Details">
            {rightSlot /* e.g. <RightPanel/> from your WorkspaceStep */}
          </aside>
        )}
      </div>
    </section>
  )
}

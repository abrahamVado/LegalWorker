import React from 'react'
import { useStore, buildTreeFromDocs } from '@/store/useStore'
import { PdfCanvas } from '@/components/PdfCanvas'
import FolderTree from '@/components/FolderTree'
import KpiPanel from '@/components/KpiPanel'
import '@/components/Viewer.css'

export function Viewer() {
  const docs = useStore(s => s.docs)
  const order = useStore(s => s.order)
  const selectedId = useStore(s => s.selectedId)
  const setSelectedId = useStore(s => s.setSelectedId ?? s.select)

  const doc = selectedId ? docs[selectedId] : undefined
  const treeRoot = buildTreeFromDocs(docs, order)
  const selectedNodeId = selectedId ? `f:${selectedId}` : undefined

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

      <div className="viewer__content viewer__content--3col">
        <aside className="col col--left" aria-label="Folder tree">
          <FolderTree
            root={treeRoot}
            selectedId={selectedNodeId}
            onSelect={(nodeId: string) => {
              if (nodeId.startsWith('f:')) setSelectedId(nodeId.slice(2))
            }}
          />
        </aside>

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
                <PdfCanvas blobUrl={doc.blobUrl || undefined} />
              </div>
            </section>
          )}
        </main>

        <aside className="col col--right" aria-label="KPI settings">
          <KpiPanel docId={doc?.id ?? null} />
        </aside>
      </div>
    </section>
  )
}

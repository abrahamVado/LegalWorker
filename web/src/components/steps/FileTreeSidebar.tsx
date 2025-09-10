// /src/components/FileTreeSidebar.tsx
import React, { useMemo, useState } from 'react'
import { useStore, buildTreeFromDocs, TreeNode } from '@/store/useStore'
import './FileTreeSidebar.css'

function NodeRow({ node, depth, onSelect, selectedId }: {
  node: TreeNode
  depth: number
  onSelect: (id: string) => void
  selectedId: string | null
}) {
  const [open, setOpen] = useState(true)

  if (node.type === 'file') {
    const isActive = node.fileId === selectedId
    return (
      <div
        className={`ft-row ft-file ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: depth * 14 + 8 }}
        onClick={() => node.fileId && onSelect(node.fileId)}
        title={node.path}
      >
        <span className="ft-icon">📄</span>
        <span className="ft-name">{node.name}</span>
      </div>
    )
  }

  return (
    <div className="ft-dir-block">
      <div
        className="ft-row ft-dir"
        style={{ paddingLeft: depth * 14 + 6 }}
        onClick={() => setOpen(v => !v)}
        title={node.path || '/'}
      >
        <span className="ft-icon">{open ? '📂' : '📁'}</span>
        <span className="ft-name">{node.name || 'root'}</span>
      </div>
      {open && node.children?.map(child => (
        <NodeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      ))}
    </div>
  )
}

export default function FileTreeSidebar() {
  const docs = useStore(s => s.docs)
  const order = useStore(s => s.order)
  const selectedId = useStore(s => s.selectedId)
  const select = useStore(s => s.select)

  const tree = useMemo(() => buildTreeFromDocs(docs, order), [docs, order])
  const children = tree.children ?? []

  return (
    <aside className="sidebar filetree" aria-label="Processed PDFs">
      <header className="ft-head">Documents</header>
      <div className="ft-scroll">
        {children.length === 0 ? (
          <div className="ft-empty">Drop PDFs (or a folder) to begin</div>
        ) : (
          children.map(n => (
            <NodeRow
              key={n.id}
              node={n}
              depth={0}
              onSelect={select}
              selectedId={selectedId}
            />
          ))
        )}
      </div>
    </aside>
  )
}

// src/components/FolderTree.tsx
import React from 'react'
import type { TreeNode } from '@/store/useStore'

export default function FolderTree({
  root,
  selectedId,
  onSelect,
}: {
  root?: TreeNode
  selectedId?: string
  onSelect: (id: string) => void
}) {
  if (!root) return <div className="card card--ghost">No files yet.</div>

  const Row = ({ node, depth }: { node: TreeNode; depth: number }) => {
    const isSelected = node.id === selectedId
    return (
      <div className={`tree-item ${isSelected ? 'is-selected' : ''}`} style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          className="tree-row"
          onClick={() => onSelect(node.id)}
          aria-current={isSelected ? 'true' : undefined}
          title={node.name}
        >
          <span className="tree-icon" aria-hidden>{node.type === 'dir' ? '📁' : '📄'}</span>
          <span className="tree-label">{node.name}</span>
        </button>
        {node.children?.map(ch => <Row key={ch.id} node={ch} depth={depth + 1} />)}
      </div>
    )
  }

  return (
    <nav className="tree" aria-label="Workspace">
      <Row node={root} depth={0} />
    </nav>
  )
}

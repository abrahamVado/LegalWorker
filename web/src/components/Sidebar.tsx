import React, { useRef } from 'react'
import { useStore } from '@/store/useStore'
import clsx from 'clsx'

export function Sidebar(){
  const { order, docs, selectedId, select, uploading, removeDoc, renameDoc, addFiles } = useStore()
  const inputRef = useRef<HTMLInputElement>(null)

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.pdf')) : []
    addFiles(files as File[])
  }

  return (
    <aside className="sidebar" aria-label="Threads">
      <div className="side-top button-flex-scope" style={{ gap: 8 }}>
        <button
          className="button-flex btn--slate btn--sm has-left-icon"
          aria-label="Back"
          onClick={() => window.history.back()}
        >
          <span className="button-flex__icon">‹</span>
          <span>Back</span>
        </button>

        <button
          className="button-flex btn--violet btn--sm has-left-icon"
          onClick={() => inputRef.current?.click()}
        >
          <span className="button-flex__icon">＋</span>
          <span>Add</span>
        </button>

        <input
          ref={inputRef}
          hidden
          type="file"
          accept="application/pdf"
          multiple
          onChange={onPick}
        />
      </div>

      {uploading && (
        <div className="processing card dotted">
          <div className="processing__label">
            Processing… {uploading.done} / {uploading.total}
          </div>
          <div className="progress">
            <span style={{ width: `${Math.round((uploading.done/uploading.total)*100)}%` }} />
          </div>
        </div>
      )}

      <ul className="thread-list" role="list">
        {order.map(id => {
          const d = docs[id]
          return (
            <li
              key={id}
              className={clsx('thread', { 'is-active': id === selectedId })}
              onClick={() => select(id)}
            >
              <span className="thread__icon">📄</span>
              <span className="thread__line" style={{ width: '100%' }}>{d.name}</span>

              <span className="thread__actions button-flex-scope">
                <button
                  className="button-flex btn--gray btn--sm has-left-icon"
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation()
                    const name = prompt('Rename file', d.name)
                    if (name) renameDoc(id, name)
                  }}
                >
                  <span className="button-flex__icon">✎</span>
                  <span>Rename</span>
                </button>

                <button
                  className="button-flex btn--red btn--sm has-left-icon"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeDoc(id)
                  }}
                >
                  <span className="button-flex__icon">🗑️</span>
                  <span>Remove</span>
                </button>
              </span>
            </li>
          )
        })}
      </ul>

      <div className="drop-hint" aria-hidden="true">
        <svg viewBox="0 0 140 120" width="120" height="100">
          <defs>
            <linearGradient id="g" x1="0" x2="1">
              <stop offset="0" stopColor="#7b61ff"/>
              <stop offset="1" stopColor="#9c6bff"/>
            </linearGradient>
          </defs>
          <rect x="10" y="24" rx="6" ry="6" width="64" height="78" fill="#f0eefc" stroke="#e4e1fa"/>
          <rect x="18" y="36" width="48" height="6" rx="3" fill="#e0def7"/>
          <rect x="18" y="48" width="40" height="6" rx="3" fill="#e0def7"/>
          <rect x="42" y="10" rx="6" ry="6" width="64" height="78" fill="url(#g)" stroke="#6c55e6"/>
          <text x="54" y="56" fontFamily="Inter, ui-sans-serif, system-ui" fontWeight="800" fontSize="18" fill="#ffffff">PDF</text>
          <path d="M22,98 C56,98 70,98 110,98" stroke="#7b61ff" strokeWidth="6" fill="none" markerEnd="url(#arr)"/>
          <defs>
            <marker id="arr" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#7b61ff" />
            </marker>
          </defs>
        </svg>
      </div>
    </aside>
  )
}

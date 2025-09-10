import React, { useState } from 'react'
import { useStore } from '@/store/useStore'
import { PdfCanvas } from '@/components/PdfCanvas'
import { QuickDashboard } from '@/components/QuickDashboard'
import { ChatPanel } from '@/components/ChatPanel'

export function Viewer(){
  const selectedId = useStore(s => s.selectedId)
  const doc = useStore(s => (s.selectedId ? s.docs[s.selectedId] : undefined))
  const [tab, setTab] = useState<'qd' | 'chat'>('qd')

  // Yamato button look for tabs
  const tabClass = (name: 'qd' | 'chat') =>
    `button-flex ${tab === name ? 'btn--violet' : 'btn--gray'} btn--sm`

  // Keyboard navigation for tabs (ArrowLeft/Right, Home/End)
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const order: ('qd' | 'chat')[] = ['qd', 'chat']
    const i = order.indexOf(tab)
    let next: 'qd' | 'chat' = tab

    if (e.key === 'ArrowRight') next = order[(i + 1) % order.length]
    if (e.key === 'ArrowLeft')  next = order[(i - 1 + order.length) % order.length]
    if (e.key === 'Home')       next = 'qd'
    if (e.key === 'End')        next = 'chat'

    if (next !== tab) {
      e.preventDefault()
      setTab(next)
      // move focus to the newly selected tab
      requestAnimationFrame(() => {
        const el = document.getElementById(`tab-${next}`)
        if (el) (el as HTMLButtonElement).focus()
      })
    }
  }

  return (
    <section className="viewer" aria-label="Document">
      <header className="viewer__bar">
        <div className="crumb"></div>
        <div className="tools">
          <span className="pill">
            {doc ? 1 : 0} <span className="muted">/ {doc ? (doc.pages || '…') : 0}</span>
          </span>
          {/* no action buttons here */}
        </div>
      </header>

      <div className="viewer__content">
        <section className="pdf-pane">
          <div className="pdf-toolbar">
            <strong>{doc ? doc.name : 'No document selected'}</strong>
            {/* no action buttons here */}
          </div>
          <PdfCanvas blobUrl={doc?.blobUrl} />
        </section>

        <aside className="chat-pane">
          {/* Yamato-styled BUTTON tabs */}
          <div
            className="tabs button-flex-scope"
            role="tablist"
            aria-label="Modes"
            aria-orientation="horizontal"
          >
            <button
              type="button"
              id="tab-qd"
              role="tab"
              aria-selected={tab === 'qd'}
              aria-controls="panel-qd"
              tabIndex={tab === 'qd' ? 0 : -1}
              className={tabClass('qd')}
              onClick={() => setTab('qd')}
              onKeyDown={onTabKey}
            >
              <span>QuickDashboard</span>
            </button>

            <button
              type="button"
              id="tab-chat"
              role="tab"
              aria-selected={tab === 'chat'}
              aria-controls="panel-chat"
              tabIndex={tab === 'chat' ? 0 : -1}
              className={tabClass('chat')}
              onClick={() => setTab('chat')}
              onKeyDown={onTabKey}
            >
              <span>Chat</span>
            </button>
          </div>

          {/* Panels */}
          {doc ? (
            tab === 'qd' ? (
              <div id="panel-qd" role="tabpanel" aria-labelledby="tab-qd">
                <QuickDashboard docId={doc.id} />
              </div>
            ) : (
              <div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat">
                <ChatPanel docId={doc.id} />
              </div>
            )
          ) : (
            <div className="qd"><div className="card">Drop a PDF to begin.</div></div>
          )}

          {/* Keep placeholder to preserve grid rows if your CSS expects it */}
          {tab==='chat' && <div className="composer" style={{display:'none'}}></div>}
        </aside>
      </div>
    </section>
  )
}

import React, { useMemo, useState } from 'react'
import QuickDash from '@components/QuickDash'
import { useStore } from '@/store/useStore'
import './RightSidebar.css'

export default function RightSidebar() {
  const [tab, setTab] = useState<'kpis' | 'chat'>('kpis')
  const selectedId = useStore(s => s.selectedId)
  const messages = useStore(s => (selectedId ? (s.messages[selectedId] || []) : []))
  const send = useStore(s => s.send)

  const [text, setText] = useState('')
  const canSend = useMemo(() => Boolean(selectedId && text.trim().length > 0), [selectedId, text])

  return (
    <aside className="sidebar rightdash" aria-label="Details">
      <header className="rd-head">
        <div className="rd-title">
          <strong>Details</strong>
        </div>

        {/* Tabs – Yamato buttons (falls back gracefully if you don’t load Yamato CSS elsewhere) */}
        <div className="rd-tabs button-flex-scope" role="tablist" aria-label="Details tabs">
          <button
            role="tab"
            aria-selected={tab === 'kpis'}
            aria-controls="panel-kpis"
            className={`button-flex btn--sm ${tab === 'kpis' ? 'btn--violet' : 'btn--white'}`}
            onClick={() => setTab('kpis')}
            type="button"
          >
            <span>KPIs</span>
          </button>

          <button
            role="tab"
            aria-selected={tab === 'chat'}
            aria-controls="panel-chat"
            className={`button-flex btn--sm ${tab === 'chat' ? 'btn--indigo' : 'btn--white'}`}
            onClick={() => setTab('chat')}
            type="button"
          >
            <span>Chat</span>
          </button>
        </div>
      </header>

      <div className="rd-scroll">
        {tab === 'kpis' ? (
          <div id="panel-kpis" className="rd-kpis" role="tabpanel" aria-labelledby="kpis-tab">
            <QuickDash />
          </div>
        ) : (
          <div id="panel-chat" className="rd-chat" role="tabpanel" aria-labelledby="chat-tab">
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
              className="chatform button-flex-scope"
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
                <button type="submit" className="button-flex btn--indigo btn--sm" disabled={!canSend}>
                  <span>Ask</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </aside>
  )
}

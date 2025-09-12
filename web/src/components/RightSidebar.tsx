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
    <div className="sidebar rightdash" aria-label="Details">
      <header className="rd-head">
        <strong>Details</strong>
        <div className="rd-tabs" role="tablist" aria-label="Details tabs">
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
      </header>

      <div className="rd-scroll">
        {tab === 'kpis' ? (
          <div className="rd-kpis" role="tabpanel" aria-label="KPIs">
            <QuickDash />
          </div>
        ) : (
          <div className="rd-chat" role="tabpanel" aria-label="Chat with model">
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

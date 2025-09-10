import React, { useMemo } from 'react'
import { useStore, mapOverviewToQuick } from '@/store/useStore'
import '@/components/QuickDashboard.css'

export default function QuickDash() {
  const selectedId = useStore(s => s.selectedId)
  const doc = useStore(s => (selectedId ? s.docs[selectedId] : undefined))

  const q = useMemo(() => mapOverviewToQuick(doc?.overview), [doc])

  return (
    <aside className="sidebar rightdash">
      <header className="qd-head">Quick Dashboard</header>
      {!doc ? (
        <div className="qd-empty">Select a PDF</div>
      ) : (
        <>
          <div className="qd-card">
            <div className="qd-title">{doc.name}</div>
            <div className="qd-sub">Path: <code>{doc.path || doc.name}</code></div>
          </div>

          <div className="qd-grid">
            <div className="qd-card">
              <h4>Counterparts</h4>
              {q.counterparts.length ? <ul>{q.counterparts.map((c,i)=><li key={i}>{c}</li>)}</ul> : <div className="muted">—</div>}
            </div>
            <div className="qd-card">
              <h4>Dates</h4>
              {q.dates.length ? <ul>{q.dates.map((d,i)=><li key={i}>{d}</li>)}</ul> : <div className="muted">—</div>}
            </div>
            <div className="qd-card">
              <h4>Money</h4>
              {q.money.length ? (
                <ul>{q.money.map((m,i)=><li key={i}>{m.amount.toLocaleString()} {m.currency}{m.context ? ` — ${m.context}` : ''}</li>)}</ul>
              ) : <div className="muted">—</div>}
            </div>
            <div className="qd-card">
              <h4>Places</h4>
              {q.places.length ? <ul>{q.places.map((p,i)=><li key={i}>{p}</li>)}</ul> : <div className="muted">—</div>}
            </div>
            <div className="qd-card">
              <h4>Errors</h4>
              {q.errors.length ? <ul>{q.errors.map((e,i)=><li key={i}>{e}</li>)}</ul> : <div className="muted">None</div>}
            </div>
          </div>
        </>
      )}
    </aside>
  )
}

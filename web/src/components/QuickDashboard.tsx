import React from 'react'
import { useStore } from '@/store/useStore'

export function QuickDashboard({ docId }: { docId: string }){
  const doc = useStore(s => s.docs[docId])
  const items = doc?.overview || []
  if (!items.length) {
    return <div className="qd"><div className="card">No overview yet. (The backend should return checklist answers after ingest.)</div></div>
  }
  return (
    <div className="qd">
      {items.map((it, i) => (
        <article className="card" key={i}>
          <h4 style={{ marginTop: 0 }}>{it.topic}</h4>
          <div dangerouslySetInnerHTML={{ __html: (it.answer || '').replace(/\n/g, '<br/>') }} />
          {it.citations?.length ? (
            <div className="chips" style={{ marginTop: 6 }}>
              {it.citations.slice(0,3).map((c, j) => <span className="chip" key={j}>p.{c.page_start}-{c.page_end}</span>)}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  )
}

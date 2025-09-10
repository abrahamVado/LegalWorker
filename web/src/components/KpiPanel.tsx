// src/components/KpiPanel.tsx
import React from 'react'
import { useStore, mapOverviewToQuick } from '@/store/useStore'

export default function KpiPanel({ docId }: { docId: string | null }) {
  const doc = useStore(s => (docId ? s.docs[docId] : undefined))
  if (!docId || !doc) return <div className="card card--ghost">KPIs will appear when you select a PDF.</div>

  const q = mapOverviewToQuick(doc.overview)
  const hasAny = q.counterparts.length || q.dates.length || q.money.length || q.places.length || q.errors.length
  if (!hasAny) return <div className="card card--ghost">No KPIs detected for this document.</div>

  return (
    <section className="kpi">
      <header className="kpi__head"><strong>KPIs for this PDF</strong></header>
      <ul className="kpi__list">
        {q.counterparts.map((p, i) => <li key={`cp-${i}`} className="kpi__item"><span>Counterpart</span><span>{p}</span></li>)}
        {q.dates.map((d, i) => <li key={`d-${i}`} className="kpi__item"><span>Date</span><span>{d}</span></li>)}
        {q.money.map((m, i) => <li key={`m-${i}`} className="kpi__item"><span>Amount</span><span>{m.amount} {m.currency}</span></li>)}
        {q.places.map((p, i) => <li key={`pl-${i}`} className="kpi__item"><span>Place</span><span>{p}</span></li>)}
        {q.errors.map((e, i) => <li key={`e-${i}`} className="kpi__item"><span>Error</span><span>{e}</span></li>)}
      </ul>
    </section>
  )
}

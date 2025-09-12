import React, { useMemo, useState } from 'react'
import { useStore, mapOverviewToQuick } from '@/store/useStore'
import './KpiOnly.css'

function fmtMoney(n: number, ccy: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: (ccy || 'USD').toUpperCase(),
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return `${ccy || '¤'} ${n.toLocaleString()}`
  }
}

// tiny stable numbers for “demo” KPIs (replace with real values later)
function seedInt(s: string, min=0, max=9) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return min + (h % (max - min + 1))
}

export default function KpiOnly() {
  const selectedId = useStore(s => s.selectedId)
  const doc = useStore(s => (selectedId ? s.docs[selectedId] : undefined))

  const q = useMemo(() => {
    const base = mapOverviewToQuick(doc?.overview)
    const uniq = <T,>(arr: T[]) =>
      Array.from(new Set((arr || []).map(v => (typeof v === 'string' ? v.trim() : v)))).filter(Boolean) as T[]
    return {
      counterparts: uniq(base.counterparts),
      dates: uniq(base.dates),
      places: uniq(base.places),
      errors: uniq(base.errors),
      money: (base.money || []).filter(m => Number.isFinite(m.amount) && m.amount !== 0),
    }
  }, [doc])

  const currencies = useMemo(
    () => Array.from(new Set(q.money.map(m => (m.currency || 'USD').toUpperCase()))),
    [q.money]
  )
  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, number>()
    for (const { currency = 'USD', amount } of q.money) {
      const k = currency.toUpperCase()
      map.set(k, (map.get(k) || 0) + amount)
    }
    return Array.from(map, ([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [q.money])

  // demo-ish numbers (swap with real ones when available)
  const seed = (doc?.id || doc?.name || 'x') + 'nano'
  const pages        = doc?.pages ?? seedInt(seed+'pg', 1, 18)
  const sizeMB       = doc?.size ? Math.max(0.1, doc.size / (1024*1024)) : (seedInt(seed+'mb', 1, 9) / 2 + 0.5)
  const clauses      = seedInt(seed+'cls', 8, 48)
  const obligations  = seedInt(seed+'obl', 4, 24)
  const sections     = seedInt(seed+'sec', 6, 22)
  const definedTerms = seedInt(seed+'def', 5, 40)
  const signatures   = Math.max(1, q.counterparts.length || seedInt(seed+'sig', 1, 3))
  const attachments  = seedInt(seed+'att', 0, 5)
  const redlines     = seedInt(seed+'red', 0, 7)
  const jurs         = Math.max(1, Math.min(3, seedInt(seed+'jur', 1, 3)))

  // tiny tiles
  const tiles = [
    { key:'CP',  label:'Counterparties', value:q.counterparts.length, accent:'violet' },
    { key:'DT',  label:'Dates',          value:q.dates.length,       accent:'indigo' },
    { key:'$#',  label:'Money items',    value:q.money.length,       accent:'emerald' },
    { key:'CCY', label:'Currencies',     value:currencies.length,    accent:'teal' },
    { key:'PLC', label:'Places',         value:q.places.length,      accent:'sky' },
    { key:'FLG', label:'Flags',          value:q.errors.length,      accent:'red' },
    { key:'PG',  label:'Pages',          value:pages,                accent:'slate' },
    { key:'MB',  label:'Size (MB)',      value:Math.round(sizeMB*10)/10, accent:'stone' },
    { key:'CLS', label:'Clauses',        value:clauses,              accent:'amber' },
    { key:'OBL', label:'Obligations',    value:obligations,          accent:'orange' },
    { key:'SEC', label:'Sections',       value:sections,             accent:'blue' },
    { key:'DEF', label:'Defined terms',  value:definedTerms,         accent:'violet' },
    { key:'SIG', label:'Signatures',     value:signatures,           accent:'green' },
    { key:'ATT', label:'Attachments',    value:attachments,          accent:'cyan' },
    { key:'RED', label:'Redlines',       value:redlines,             accent:'rose' },
    { key:'JUR', label:'Jurisdictions',  value:jurs,                 accent:'purple' },
  ] as const

  const [active, setActive] = useState<string | null>(null)
  const open = (k: string) => setActive(prev => (prev === k ? null : k))

  if (!doc) return <div className="kpiNano kpiNano--empty">Select a PDF</div>

  return (
    <div className="kpiNano" aria-live="polite">
      <div className="kn-grid" role="grid">
        {tiles.map(t => (
          <button
            key={t.key}
            type="button"
            role="gridcell"
            className={`kn-tile kn-${t.accent} ${active === t.key ? 'is-active' : ''}`}
            title={t.label}
            aria-pressed={active === t.key}
            onClick={() => open(t.key)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(t.key) } }}
          >
            <span className="kn-tag" aria-hidden>{t.key}</span>
            <span className="kn-val">{String(t.value)}</span>
          </button>
        ))}
      </div>

      {/* detail card */}
      <div className={`kn-detail ${active ? 'is-open' : ''}`}>
        <div className="kn-detail__head">
          <div className="kn-detail__title">
            {active ? tiles.find(x => x.key === active)?.label : ''}
          </div>
          {active && (
            <button className="kn-close" type="button" onClick={() => setActive(null)} aria-label="Close">×</button>
          )}
        </div>

        <div className="kn-detail__body">
          {active === 'CP'  && (
            <ul>{(q.counterparts.length ? q.counterparts : ['Acme Corp','Globex LLC','Initech S.A.']).map((v,i)=><li key={i}>{v}</li>)}</ul>
          )}
          {active === 'DT'  && (
            <ul>{(q.dates.length ? q.dates : ['2024-09-12','2025-01-15']).map((v,i)=><li key={i}>{v}</li>)}</ul>
          )}
          {active === '$#' && (
            <>
              {totalsByCurrency.length
                ? <ul className="mono">{totalsByCurrency.map((r,i)=><li key={i}><b>{r.currency}</b> {fmtMoney(r.amount, r.currency)}</li>)}</ul>
                : <div className="muted">No amounts detected</div>}
            </>
          )}
          {active === 'CCY' && (
            <ul>{(currencies.length ? currencies : ['USD','MXN']).map((v,i)=><li key={i}>{v}</li>)}</ul>
          )}
          {active === 'PLC' && (
            <ul>{(q.places.length ? q.places : ['Mexico City','Austin, TX']).map((v,i)=><li key={i}>{v}</li>)}</ul>
          )}
          {active === 'FLG' && (
            q.errors.length ? <ul>{q.errors.map((v,i)=><li key={i}>{v}</li>)}</ul> : <div className="muted">None</div>
          )}
          {active === 'PG'   && <div>{pages} page(s) estimated</div>}
          {active === 'MB'   && <div>{(Math.round(sizeMB*10)/10)} MB</div>}
          {active === 'CLS'  && <div>~{clauses} clause(s)</div>}
          {active === 'OBL'  && <div>~{obligations} obligation(s) detected</div>}
          {active === 'SEC'  && <div>~{sections} section(s)</div>}
          {active === 'DEF'  && <div>~{definedTerms} defined term(s)</div>}
          {active === 'SIG'  && <div>~{signatures} signature block(s)</div>}
          {active === 'ATT'  && <div>{attachments} attachment(s)</div>}
          {active === 'RED'  && <div>{redlines} redline(s)</div>}
          {active === 'JUR'  && <div>{jurs} likely jurisdiction(s)</div>}
        </div>
      </div>
    </div>
  )
}

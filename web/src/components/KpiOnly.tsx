import React, { useMemo, useState } from 'react'
import { useStore, mapOverviewToQuick } from '@/store/useStore'
import {
  FiUsers, FiCalendar, FiDollarSign, FiMapPin, FiFlag, FiFileText,
  FiHardDrive, FiBookOpen, FiCheckSquare, FiLayers, FiType,
  FiPenTool, FiPaperclip, FiGitPullRequest
} from 'react-icons/fi'
import { FaBalanceScale } from 'react-icons/fa'
import './KpiOnly.css'

function fmtMoney(n: number, ccy: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency: (ccy || 'USD').toUpperCase(),
      maximumFractionDigits: 2,
    }).format(n)
  } catch { return `${ccy || '¤'} ${n.toLocaleString()}` }
}

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

  // demo fallbacks
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

  const tiles = [
    { key:'CP',  label:'Counterparties', value:q.counterparts.length, accent:'violet',  Icon: FiUsers },
    { key:'DT',  label:'Dates',          value:q.dates.length,        accent:'indigo',  Icon: FiCalendar },
    { key:'$#',  label:'Money Items',    value:q.money.length,        accent:'emerald', Icon: FiDollarSign },
    { key:'CCY', label:'Currencies',     value:currencies.length,     accent:'teal',    Icon: FiDollarSign },
    { key:'PLC', label:'Places',         value:q.places.length,       accent:'sky',     Icon: FiMapPin },
    { key:'FLG', label:'Flags',          value:q.errors.length,       accent:'red',     Icon: FiFlag },
    { key:'PG',  label:'Pages',          value:pages,                 accent:'slate',   Icon: FiFileText },
    { key:'MB',  label:'Size (MB)',      value:Math.round(sizeMB*10)/10, accent:'stone', Icon: FiHardDrive },
    { key:'CLS', label:'Clauses',        value:clauses,               accent:'amber',   Icon: FiBookOpen },
    { key:'OBL', label:'Obligations',    value:obligations,           accent:'orange',  Icon: FiCheckSquare },
    { key:'SEC', label:'Sections',       value:sections,              accent:'blue',    Icon: FiLayers },
    { key:'DEF', label:'Defined Terms',  value:definedTerms,          accent:'violet',  Icon: FiType },
    { key:'SIG', label:'Signatures',     value:signatures,            accent:'green',   Icon: FiPenTool },
    { key:'ATT', label:'Attachments',    value:attachments,           accent:'cyan',    Icon: FiPaperclip },
    { key:'RED', label:'Redlines',       value:redlines,              accent:'rose',    Icon: FiGitPullRequest },
    { key:'JUR', label:'Jurisdictions',  value:jurs,                  accent:'purple',  Icon: FaBalanceScale },
  ] as const

  const [active, setActive] = useState<string | null>(null)
  const open = (k: string) => setActive(prev => (prev === k ? null : k))
  const activeTile = active ? tiles.find(t => t.key === active) : undefined

  if (!doc) return <div className="kpiNano kpiNano--xl kpiNano--empty">Select a PDF</div>

  return (
    <div className="kpiNano kpiNano--xl" aria-live="polite">
      {/* UNIFORM tiles: add kn-bento--uniform; no span classes */}
      <div className="button-flex-scope kn-bento kn-bento--uniform" role="grid" aria-label="Document KPIs">
        {tiles.map(t => {
          const Icon = t.Icon
          return (
            <button
              key={t.key}
              type="button"
              role="gridcell"
              data-accent={t.accent}
              className={`button-flex btn-kpi-bento ${active === t.key ? 'is-active' : ''}`}
              title={t.label}
              aria-pressed={active === t.key}
              onClick={() => open(t.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(t.key) } }}
            >
              <div className="kpb">
                <div className="kpb-top">
                  <i className="kpb-icon" aria-hidden><Icon /></i>
                  <code className="kpb-key">{t.key}</code>
                </div>
                <div className="kpb-main">
                  <div className="kpb-val">{String(t.value)}</div>
                  <div className="kpb-label" title={t.label}>{t.label}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Detail */}
      <div className={`kn-detail kn-detail--rich ${active ? 'is-open' : ''}`} data-accent={activeTile?.accent || 'indigo'}>
        <div className="kn-detail__bar" aria-hidden />
        <div className="kn-detail__head">
          <div className="kn-detail__title">
            {activeTile ? (<><i className="kpb-icon" aria-hidden><activeTile.Icon /></i> {activeTile.label}</>) : ''}
          </div>
          {active && <button className="kn-close" type="button" onClick={() => setActive(null)} aria-label="Close">×</button>}
        </div>

        <div className="kn-detail__body">
          {activeTile && (
            <div className="kn-detail__hero">
              <div className="hero-value">{tiles.find(x => x.key === active)?.value}</div>
              <div className="hero-sub">in <b>{doc?.name || 'Current document'}</b></div>
            </div>
          )}

          {active === 'CP'  && (
            <ul className="list">{(q.counterparts.length ? q.counterparts : ['Acme Corp','Globex LLC','Initech S.A.']).map((v,i)=><li key={i}>{v}</li>)}</ul>
          )}
          {active === 'DT'  && (
            <ul className="chips">{(q.dates.length ? q.dates : ['2024-09-12','2025-01-15']).map((v,i)=><li key={i} className="chip">{v}</li>)}</ul>
          )}
          {active === '$#' && (
            totalsByCurrency.length
              ? (
                <div className="money-grid">
                  {totalsByCurrency.map((r,i)=>(
                    <div key={i} className="money-item">
                      <div className="ccy">{r.currency}</div>
                      <div className="amt">{fmtMoney(r.amount, r.currency)}</div>
                    </div>
                  ))}
                </div>
              )
              : <div className="muted">No amounts detected</div>
          )}
          {active === 'CCY' && (
            <ul className="chips">{(currencies.length ? currencies : ['USD','MXN']).map((v,i)=><li key={i} className="chip">{v}</li>)}</ul>
          )}
          {active === 'PLC' && (
            <ul className="list">{(q.places.length ? q.places : ['Mexico City','Austin, TX']).map((v,i)=><li key={i}>{v}</li>)}</ul>
          )}
          {active === 'FLG' && (
            q.errors.length ? <ul className="list">{q.errors.map((v,i)=><li key={i}>{v}</li>)}</ul> : <div className="muted">None</div>
          )}
          {active === 'PG'   && <div className="kv"><b>Pages</b><span>{pages}</span></div>}
          {active === 'MB'   && <div className="kv"><b>Size</b><span>{(Math.round(sizeMB*10)/10)} MB</span></div>}
          {active === 'CLS'  && <div className="kv"><b>Clauses</b><span>~{clauses}</span></div>}
          {active === 'OBL'  && <div className="kv"><b>Obligations</b><span>~{obligations}</span></div>}
          {active === 'SEC'  && <div className="kv"><b>Sections</b><span>~{sections}</span></div>}
          {active === 'DEF'  && <div className="kv"><b>Defined terms</b><span>~{definedTerms}</span></div>}
          {active === 'SIG'  && <div className="kv"><b>Signature blocks</b><span>~{signatures}</span></div>}
          {active === 'ATT'  && <div className="kv"><b>Attachments</b><span>{attachments}</span></div>}
          {active === 'RED'  && <div className="kv"><b>Redlines</b><span>{redlines}</span></div>}
          {active === 'JUR'  && <div className="kv"><b>Likely jurisdictions</b><span>{jurs}</span></div>}
        </div>
      </div>
    </div>
  )
}

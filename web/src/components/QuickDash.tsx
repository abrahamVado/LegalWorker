import React, { useCallback, useMemo, useState } from 'react'
import { useStore, mapOverviewToQuick } from '@/store/useStore'
import {
  PiArrowsClockwiseDuotone,
  PiClipboardTextDuotone,
  PiDownloadSimpleDuotone,
} from 'react-icons/pi'
import './QuickDashboard.css'

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    // Fallback if currency code is odd/empty
    return `${currency || '¤'} ${amount.toLocaleString()}`
  }
}

type SectionProps = {
  title: string
  items: string[]
  emptyLabel?: string
  initiallyVisible?: number
  mono?: boolean
}
function Section({ title, items, emptyLabel = '—', initiallyVisible = 8, mono = false }: SectionProps) {
  const [expanded, setExpanded] = useState(false)
  const display = expanded ? items : items.slice(0, initiallyVisible)
  const canToggle = items.length > initiallyVisible

  return (
    <section className="qd-card">
      <h4>{title}</h4>
      {items.length ? (
        <>
          <ul className={mono ? 'mono' : undefined}>
            {display.map((v, i) => <li key={i} title={v}>{v}</li>)}
          </ul>
          {canToggle && (
            <button
              type="button"
              className="linklike"
              onClick={() => setExpanded(v => !v)}
              aria-expanded={expanded}
            >
              {expanded ? 'Show less' : `Show ${items.length - display.length} more`}
            </button>
          )}
        </>
      ) : (
        <div className="muted">{emptyLabel}</div>
      )}
    </section>
  )
}

export default function QuickDash() {
  const selectedId = useStore(s => s.selectedId)
  const doc = useStore(s => (selectedId ? s.docs[selectedId] : undefined))

  // Normalize & de-dupe safely
  const q = useMemo(() => {
    const base = mapOverviewToQuick(doc?.overview)
    const uniq = <T,>(arr: T[]) => Array.from(new Set(arr.map(v => (typeof v === 'string' ? v.trim() : v)))).filter(Boolean) as T[]
    return {
      counterparts: uniq(base.counterparts || []),
      dates: uniq(base.dates || []),
      places: uniq(base.places || []),
      errors: uniq(base.errors || []),
      money: (base.money || []).filter(m => Number.isFinite(m.amount) && m.amount !== 0),
    }
  }, [doc])

  const hasData =
    (q.counterparts?.length ?? 0) +
    (q.dates?.length ?? 0) +
    (q.money?.length ?? 0) +
    (q.places?.length ?? 0) +
    (q.errors?.length ?? 0) > 0

  // Shareable text & CSV
  const kpiText = useMemo(() => {
    if (!doc) return ''
    const parts: string[] = []
    if (q.counterparts.length) parts.push(`Counterparties: ${q.counterparts.join(', ')}`)
    if (q.dates.length)       parts.push(`Dates: ${q.dates.join(', ')}`)
    if (q.places.length)      parts.push(`Places: ${q.places.join(', ')}`)
    if (q.money.length) {
      parts.push('Money: ' + q.money.map(m => `${m.currency} ${m.amount.toLocaleString()}`).join(' · '))
    }
    if (q.errors.length)      parts.push(`Flags: ${q.errors.join(' | ')}`)
    return parts.join('\n')
  }, [doc, q])

  const csv = useMemo(() => {
    if (!doc) return ''
    const rows = [
      ['field', 'value'],
      ['counterparties', q.counterparts.join('; ')],
      ['dates',        q.dates.join('; ')],
      ['places',       q.places.join('; ')],
      ['money',        q.money.map(m => `${m.currency} ${m.amount}`).join('; ')],
      ['flags',        q.errors.join('; ')],
    ]
    return rows.map(r => r.map(cell => `"${String(cell).replaceAll('"','""')}"`).join(',')).join('\n')
  }, [doc, q])

  const onCopy = useCallback(() => {
    if (!kpiText) return
    navigator.clipboard.writeText(kpiText).catch(() =>
      downloadText((doc?.name || 'kpis') + '.txt', kpiText)
    )
  }, [kpiText, doc?.name])

  const onExport = useCallback(() => {
    if (!csv) return
    downloadText((doc?.name || 'kpis') + '.csv', csv)
  }, [csv, doc?.name])

  const onRefresh = useCallback(() => {
    // hook a real refresh if your store exposes one
    // e.g., useStore.getState().refreshKPIs(selectedId)
    console.log('Refresh KPIs for', doc?.id)
  }, [doc?.id])

  return (
    <div className="qd" aria-live="polite">
      {!doc ? (
        <div className="qd-empty">Select a PDF</div>
      ) : (
        <>
          {/* Header card */}
          <div className="qd-card qd-card--head">
            <div className="qd-title" title={doc.name}>{doc.name}</div>
            <div className="qd-sub">Path: <span className="mono">{doc.path || doc.name}</span></div>

            {/* chips */}
            <div className="qd-chips">
              <span className="chip">CP: <b>{q.counterparts.length}</b></span>
              <span className="chip">Dates: <b>{q.dates.length}</b></span>
              <span className="chip">Money: <b>{q.money.length}</b></span>
              <span className="chip">Places: <b>{q.places.length}</b></span>
              <span className={`chip ${q.errors.length ? 'chip--warn' : ''}`}>
                Flags: <b>{q.errors.length}</b>
              </span>
            </div>

            {/* Actions (Yamato buttons) */}
            <div className="qd-actions button-flex-scope" role="group" aria-label="KPI actions">
              <button
                className="button-flex btn--violet btn--sm has-left-icon"
                onClick={onRefresh}
                type="button"
                title="Refresh KPIs"
              >
                <span className="button-flex__icon button-flex__icon--left" aria-hidden>
                  <PiArrowsClockwiseDuotone />
                </span>
                <span>Refresh</span>
              </button>

              <button
                className="button-flex btn--indigo btn--sm has-left-icon"
                onClick={onCopy}
                type="button"
                disabled={!hasData}
                title="Copy KPIs"
              >
                <span className="button-flex__icon button-flex__icon--left" aria-hidden>
                  <PiClipboardTextDuotone />
                </span>
                <span>Copy</span>
              </button>

              <button
                className="button-flex btn--emerald btn--sm has-left-icon"
                onClick={onExport}
                type="button"
                disabled={!hasData}
                title="Export CSV"
              >
                <span className="button-flex__icon button-flex__icon--left" aria-hidden>
                  <PiDownloadSimpleDuotone />
                </span>
                <span>Export</span>
              </button>
            </div>
          </div>

          {/* Content */}
          {!hasData ? (
            <div className="qd-card">
              <div className="muted">No KPIs extracted yet.</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Run analysis or ask the model to summarize key fields.
              </div>
            </div>
          ) : (
            <div className="qd-grid">
              <Section title="Counterparties" items={q.counterparts} />
              <Section title="Dates"         items={q.dates} />
              <Section
                title="Money"
                items={q.money.map(m => `${formatMoney(m.amount, m.currency)}${m.context ? ` — ${m.context}` : ''}`)}
                mono
              />
              <Section title="Places" items={q.places} />
              <Section title="Flags"  items={q.errors} emptyLabel="None" />
            </div>
          )}
        </>
      )}
    </div>
  )
}


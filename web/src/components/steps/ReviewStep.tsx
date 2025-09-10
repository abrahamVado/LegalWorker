import React, { useEffect, useMemo, useState } from 'react'
import { PiMagnifyingGlassDuotone } from 'react-icons/pi'
import './ReviewStep.css'

export default function ReviewStep({ files, onContinue }: { files: File[]; onContinue: () => void }) {
  const total = files.length
  const [index, setIndex] = useState(0)
  const progressPct = useMemo(
    () => (total === 0 ? 100 : Math.min(100, Math.round((index / total) * 100))),
    [index, total]
  )

  useEffect(() => {
    if (total === 0) { onContinue(); return }
    const timer = window.setInterval(() => {
      setIndex(prev => {
        const next = prev + 1
        if (next >= total) {
          window.setTimeout(onContinue, 250)
        }
        return next
      })
    }, 280)
    return () => window.clearInterval(timer)
  }, [total, onContinue])

  return (
    <main className="canvas intro">
      <section className="window window--onecol">
        <div className="viewer" style={{ background: 'transparent' }}>
          <div className="viewer__bar">
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <strong>Legal Document Analyzer</strong>
              <div className="crumb" />
            </div>
            <div className="tools">
              <span className="pill">Step 2</span>
              <span className="muted">Analyzing…</span>
            </div>
          </div>

          <div className="viewer__content" style={{ gridTemplateColumns: '1fr' }}>
            <div className="pdf-pane review-pane">
              <div className="card processing">
                <div className="processing__label">
                  <PiMagnifyingGlassDuotone size={20} />
                  {total > 0
                    ? <>Analyzing <strong>{Math.min(index + 1, total)}</strong> / <strong>{total}</strong> PDFs</>
                    : <>Preparing…</>}
                </div>
                <div className="progress">
                  <span style={{ width: `\${progressPct}%` }} />
                </div>
              </div>

              <div className="chips">
                <span className="chip">Total: <strong>{total}</strong></span>
                <span className="chip">Current: <strong>{Math.min(index + 1, total)}</strong></span>
                <span className="chip">Progress: <strong>{progressPct}%</strong></span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

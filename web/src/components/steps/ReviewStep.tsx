// web/src/components/steps/ReviewStep.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PiMagnifyingGlassDuotone,
  PiPauseCircleDuotone,
  PiPlayCircleDuotone,
  PiXCircleDuotone,
} from "react-icons/pi";
import "./ReviewStep.css";

/** ===================== Types ===================== */
export type AnalyzedDoc = {
  id: string;
  name: string;
  sizeKB: number;
  durationMs: number;
  type: "Contrato" | "NDA" | "Factura" | "Poder" | "Aviso de privacidad";
  counterparties: string[];
  riskFlags: string[];
  spellingMistakes: number;
  classification: string;
  lastModifiedISO: string;
};

/** ===================== Utilities ===================== */
const fmtNum = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "—");
const median = (arr: number[]) => {
  if (arr.length === 0) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** ===================== Backend integration ===================== */
/**
 * Calls FastAPI:
 *   1) POST /api/ingest  (multipart) -> { ok, doc_id, chunks }
 *   2) POST /api/digest  (json)      -> AnalyzedDoc-like payload
 *
 * NOTE: Do NOT pass AbortSignal to /api/ingest (StrictMode would cancel it).
 */
async function analyzeViaApi(file: File, signal?: AbortSignal): Promise<AnalyzedDoc> {
  const t0 = performance.now();

  // 1) Ingest (no signal on purpose)
  const fd = new FormData();
  fd.append("file", file, file.name);

  const ingestRes = await fetch("/api/ingest", { method: "POST", body: fd });
  if (!ingestRes.ok) {
    throw new Error(`ingest failed: ${ingestRes.status} ${await ingestRes.text()}`);
  }
  const ingestJson = (await ingestRes.json()) as { ok: boolean; doc_id: string; chunks: number };
  const doc_id = ingestJson.doc_id;

  // 2) Digest (safe to abort)
  const digestRes = await fetch("/api/digest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc_id, strategy: "llm", max_chars: 16000 }),
    signal,
  });
  if (!digestRes.ok) {
    throw new Error(`digest failed: ${digestRes.status} ${await digestRes.text()}`);
  }
  const d = await digestRes.json();

  const t1 = performance.now();

  // Normalize to AnalyzedDoc
  const ALLOWED_TYPES = new Set<AnalyzedDoc["type"]>([
    "Contrato",
    "NDA",
    "Factura",
    "Poder",
    "Aviso de privacidad",
  ]);
  const safeType = (ALLOWED_TYPES.has(d?.type) ? d.type : "Contrato") as AnalyzedDoc["type"];

  return {
    id: String(d?.id ?? doc_id),
    name: String(d?.name ?? file.name),
    sizeKB: Number.isFinite(d?.sizeKB) ? Number(d.sizeKB) : Math.max(1, Math.round(file.size / 1024)),
    durationMs: Math.round(t1 - t0),
    type: safeType,
    counterparties: Array.isArray(d?.counterparties) ? d.counterparties.slice(0, 4) : [],
    riskFlags: Array.isArray(d?.riskFlags) ? d.riskFlags.slice(0, 4) : [],
    spellingMistakes: Number.isFinite(d?.spellingMistakes) ? Number(d.spellingMistakes) : 0,
    classification: typeof d?.classification === "string" ? d.classification : "unknown",
    lastModifiedISO:
      typeof d?.lastModifiedISO === "string"
        ? d.lastModifiedISO
        : file.lastModified
        ? new Date(file.lastModified).toISOString()
        : new Date().toISOString(),
  };
}

/** ===================== Component ===================== */
export default function ReviewStep({
  files,
  onContinue,
}: {
  files: File[];
  onContinue: () => void;
}) {
  // #1 Core state
  const total = files.length;
  const [index, setIndex] = useState(0); // number processed
  const [running, setRunning] = useState(true); // play/pause
  const [cancelled, setCancelled] = useState(false); // hard stop
  const [results, setResults] = useState<AnalyzedDoc[]>([]);
  const [nowTick, setNowTick] = useState(0); // smoother elapsed/ETA
  const [errors, setErrors] = useState<Array<{ id: string; name: string; reason: string; file: File }>>([]);

  // StrictMode-safe gate (state instead of ref)
  const [inFlight, setInFlight] = useState(false);

  // Refs
  const startRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const attemptsRef = useRef<Map<number, number>>(new Map()); // retry once on AbortError

  // #2 Keyboard shortcuts (Space = play/pause, Esc = cancel)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        if (!cancelled && index < total) {
          setRunning((r) => {
            const next = !r;
            if (!next) {
              // pausing -> abort current
              abortRef.current?.abort();
              setInFlight(false);
            }
            return next;
          });
        }
      }
      if (e.key === "Escape") {
        if (!cancelled && index < total) handleCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelled, index, total]);

  // #3 Soft ticker to refresh time-based metrics even when index is steady
  useEffect(() => {
    if (!running || cancelled || total === 0) return;
    const t = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(t);
  }, [running, cancelled, total]);

  // #4 Derived metrics
  const progressPct = useMemo(
    () => (total === 0 ? 100 : Math.min(100, Math.round((index / total) * 100))),
    [index, total]
  );
  const elapsedMs = useMemo(
    () => (startRef.current ? Date.now() - (startRef.current ?? Date.now()) : 0),
    [nowTick, index]
  );
  const elapsedMin = Math.max(0.0001, elapsedMs / 60000);
  const docsPerMin = index > 0 ? index / elapsedMin : 0;
  const docsPerSec = index > 0 ? index / (elapsedMs / 1000) : 0;
  const remaining = Math.max(0, total - index);
  const etaMin = docsPerMin > 0 ? remaining / docsPerMin : Infinity;

  const durations = results.map((r) => r.durationMs);
  const avgMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const medMs = median(durations);

  const sizesKB = results.map((r) => r.sizeKB);
  const avgKB = sizesKB.length ? sizesKB.reduce((a, b) => a + b, 0) / sizesKB.length : 0;
  const medKB = median(sizesKB);
  const totalKB = sizesKB.reduce((sum, v) => sum + v, 0);
  const totalMB = totalKB / 1024;

  const uniqueCounterparties = useMemo(() => {
    const set = new Set<string>();
    results.forEach((r) => r.counterparties.forEach((c) => set.add(c)));
    return set.size;
  }, [results]);

  const riskTotal = results.reduce((n, r) => n + r.riskFlags.length, 0);
  const spellingTotal = results.reduce((n, r) => n + r.spellingMistakes, 0);

  const oldestLM = results.length ? new Date(Math.min(...results.map((r) => +new Date(r.lastModifiedISO)))) : null;
  const newestLM = results.length ? new Date(Math.max(...results.map((r) => +new Date(r.lastModifiedISO)))) : null;

  // #5 Classification counts (ensure seeds exist for stable rows)
  const classificationSeeds = useMemo(() => new Set<string>(["company_creation", "association_creation"]), []);
  const classificationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    classificationSeeds.forEach((k) => counts.set(k, 0));
    results.forEach((r) => counts.set(r.classification, (counts.get(r.classification) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [results, classificationSeeds]);

  // #6 Current file info (pre-analysis)
  const currentFile = files[Math.min(index, Math.max(total - 1, 0))];
  const currentLastModified = currentFile?.lastModified ? new Date(currentFile.lastModified).toLocaleString() : "—";

  // #7 Cancel logic
  const handleCancel = useCallback(() => {
    setCancelled(true);
    setRunning(false);
    abortRef.current?.abort();
    setInFlight(false);
  }, []);

  const retryRow = useCallback(async (rowId: string) => {
    setErrors((prev) => {
      const row = prev.find((e) => e.id === rowId);
      if (!row) return prev;
      (async () => {
        try {
          const analyzed = await analyzeViaApi(row.file);
          setResults((r) => [...r, analyzed]);
          setErrors((p) => p.filter((e) => e.id !== rowId));
        } catch (err: any) {
          setErrors((p) =>
            p.map((e) => (e.id === rowId ? { ...e, reason: err?.message || "Unknown error" } : e))
          );
        }
      })();
      return prev;
    });
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setErrors((prev) => prev.filter((e) => e.id !== rowId));
  }, []);

  // #8 Core loop — StrictMode-safe (uses inFlight state)
  useEffect(() => {
    if (total === 0) return; // wait for files instead of auto-continue
    if (!startRef.current) startRef.current = Date.now();
    if (!running || cancelled || inFlight) return;
    if (index >= total) return;

    let stopped = false;
    setInFlight(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const doWork = async () => {
      const file = files[index];
      try {
        const analyzed = await analyzeViaApi(file, controller.signal);
        if (stopped) return;
        setResults((prev) => [...prev, analyzed]);
        setIndex((prev) => prev + 1);
      } catch (err: any) {
        if (err?.name === "AbortError") {
          const prev = attemptsRef.current.get(index) ?? 0;
          attemptsRef.current.set(index, prev + 1);
          if (prev >= 1) {
            setErrors((p) => [
              ...p,
              {
                id: crypto.randomUUID(),
                name: file?.name ?? `#${index}`,
                reason: "Aborted twice (dev). Skipping.",
                file,
              },
            ]);
            setIndex((prevIdx) => prevIdx + 1);
          }
          // else: allow effect to rerun and retry once
        } else {
          console.error("Analyze error:", err);
          setErrors((p) => [
            ...p,
            {
              id: crypto.randomUUID(),
              name: file?.name ?? `#${index}`,
              reason: err?.message || "Unknown error",
              file,
            },
          ]);
          setIndex((prev) => prev + 1);
        }
      } finally {
        setInFlight(false);
      }
    };

    void doWork();
    return () => {
      stopped = true;
      controller.abort();
    };
    // depend on files.length to avoid re-running when parent recreates array
  }, [running, cancelled, inFlight, index, total, files.length]);

  // #9 Auto-advance (unless cancelled)
  useEffect(() => {
    if (!cancelled && total > 0 && index >= total) {
      const t = setTimeout(onContinue, 400);
      return () => clearTimeout(t);
    }
  }, [index, total, cancelled, onContinue]);

  const status = cancelled ? "Cancelled" : index < total ? "Analyzing…" : "Done";

  // #10 Render
  return (
    <main className="canvas intro">
      <section className="window window--onecol">
        <div className="viewer" style={{ background: "transparent" }}>
          {/* === Top Bar === */}
          <div className="viewer__bar">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <strong>Legal Document Analyzer</strong>
              <div className="crumb" />
            </div>
            <div className="tools">
              <span className="pill">Step 2</span>
              <span className="muted">{status}</span>
            </div>
          </div>

          {/* === Content === */}
          <div className="viewer__content_preview">
            <div className="pdf-pane review-pane">
              {/* Centered processing card */}
              <div className="card processing centered-card">
                <div className="processing__label">
                  <PiMagnifyingGlassDuotone size={20} />
                  {total > 0 ? (
                    <>
                      Analyzing <strong>{Math.min(index, total)}</strong> / <strong>{total}</strong> PDFs
                    </>
                  ) : (
                    <>Preparing…</>
                  )}
                </div>

                {/* Progress bar (ARIA) */}
                <div
                  className="progressalt"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPct}
                  aria-label="Overall progress"
                >
                  <span style={{ width: `${progressPct}%` }} />
                </div>

                {/* Controls */}
                <div
                  className="button-flex-scope controls-row centered-buttons"
                  style={{ marginTop: 12, paddingTop: 12, paddingBottom: 12 }}
                >
                  <button
                    className={`button-flex btn--sm has-left-icon ${running ? "btn--indigo" : "btn--emerald"}`}
                    onClick={() => {
                      if (cancelled || index >= total) return;
                      setRunning((v) => {
                        const next = !v;
                        if (!next) {
                          abortRef.current?.abort();
                          setInFlight(false);
                        }
                        return next;
                      });
                    }}
                    disabled={cancelled || index >= total}
                    aria-pressed={running}
                    title={running ? "Pause" : "Play"}
                  >
                    <span className="button-flex__icon button-flex__icon--left" aria-hidden>
                      {running ? (
                        <PiPauseCircleDuotone style={{ width: "1em", height: "1em" }} />
                      ) : (
                        <PiPlayCircleDuotone style={{ width: "1em", height: "1em" }} />
                      )}
                    </span>
                    <span>{running ? "Pause" : "Play"}</span>
                  </button>
                  <button
                    className="button-flex btn--violet btn--sm has-left-icon"
                    onClick={handleCancel}
                    disabled={cancelled || index >= total}
                    title="Cancel processing"
                  >
                    <span className="button-flex__icon button-flex__icon--left" aria-hidden>
                      <PiXCircleDuotone style={{ width: "1em", height: "1em" }} />
                    </span>
                    <span>Cancel</span>
                  </button>
                </div>

                {/* Quick chips */}
                <div className="chips" style={{ marginTop: 10 }}>
                  <span className="chip">
                    Progress: <strong>{progressPct}%</strong>
                  </span>
                  <span className="chip">
                    Velocity: <strong>{fmtNum(docsPerMin, 1)}</strong> docs/min
                  </span>
                  <span className="chip">
                    Throughput: <strong>{fmtNum(docsPerSec, 2)}</strong> docs/s
                  </span>
                  <span className="chip">
                    ETA: <strong>{Number.isFinite(etaMin) ? fmtNum(etaMin, 1) + " min" : "—"}</strong>
                  </span>
                  <span className="chip">
                    Elapsed: <strong>{fmtNum(elapsedMs / 1000, 1)}s</strong>
                  </span>
                  <span className="chip">
                    Last modified (current): <strong>{currentLastModified}</strong>
                  </span>
                </div>
              </div>

              {/* Dashboard */}
              <div className="dashboard" aria-live="polite" aria-atomic>
                <header className="dash-head">
                  <h3>Processing Dashboard</h3>
                  <small className="muted">Live metrics & classification</small>
                </header>

                {/* KPI grid */}
                <div className="kpis">
                  {/* Successful results */}
                  <div className="kpi success">
                    <div className="kpi__label">Succeeded</div>
                    <div className="kpi__value">{results.length}</div>
                  </div>
                  {/* Still pending */}
                  <div className="kpi">
                    <div className="kpi__label">Queue</div>
                    <div className="kpi__value">{remaining}</div>
                  </div>

                  <div className="kpi">
                    <div className="kpi__label">Velocity</div>
                    <div className="kpi__value">
                      {fmtNum(docsPerMin)} <span className="kpi__unit">docs/min</span>
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="kpi__label">ETA</div>
                    <div className="kpi__value">{Number.isFinite(etaMin) ? fmtNum(etaMin) + "m" : "—"}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi__label">Elapsed</div>
                    <div className="kpi__value">{fmtNum(elapsedMs / 1000)}s</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi__label">Output Size</div>
                    <div className="kpi__value">
                      {fmtNum(totalMB, 2)} <span className="kpi__unit">MB</span>
                    </div>
                  </div>

                  <div className="kpi">
                    <div className="kpi__label">Unique Counterparties</div>
                    <div className="kpi__value">{uniqueCounterparties}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi__label">Risk Flags</div>
                    <div className="kpi__value">{riskTotal}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi__label">Ortografía</div>
                    <div className="kpi__value">{spellingTotal}</div>
                  </div>

                  {/* Real error count */}
                  <div className="kpi error">
                    <div className="kpi__label">Errors</div>
                    <div className="kpi__value">{errors.length}</div>
                  </div>
                </div>

                {/* Classification Table */}
                <section className="dash-card">
                  <h4>Clasificación de documentos</h4>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Clave</th>
                        <th>Count</th>
                        <th>Visual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classificationCounts.map(([key, count]) => (
                        <tr key={key}>
                          <td>
                            <code>{key}</code>
                          </td>
                          <td>
                            <strong>{count}</strong>
                          </td>
                          <td className="dots" aria-hidden>
                            {Array.from({ length: count }).map((_, i) => (
                              <span key={i} className="dot">
                                •
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {results.length > 0 && (
                    <p className="muted" style={{ marginTop: 8 }}>
                      Último: <code>{results.at(-1)!.classification}</code>
                    </p>
                  )}
                </section>

                {results.length > 0 && (
                  <section className="dash-card">
                    <h4>Rango de últimas modificaciones</h4>
                    <p className="muted">
                      {oldestLM && newestLM ? (
                        <>
                          De <strong>{oldestLM.toLocaleString()}</strong> a{" "}
                          <strong>{newestLM.toLocaleString()}</strong>
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                  </section>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

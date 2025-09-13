import React, { useCallback, useMemo, useState } from "react";
import { useStore } from "@/store/useStore";
import IntroStep from "@/components/steps/IntroStep";
import ReviewStep from "@/components/steps/ReviewStep";
import WorkspaceStep from "@/components/steps/WorkspaceStep";

import { ErrorBoundary } from '@/components/steps/ErrorBoundary'

/*─────────────────────────────────────────────────────────────────────────────
  #1 — Declare step IDs in one place.
  - Add new step IDs here (e.g., "permissions", "export", etc.)
─────────────────────────────────────────────────────────────────────────────*/
type StepId = "intro" | "review" | "workspace";

/*─────────────────────────────────────────────────────────────────────────────
  #2 — Define the canonical step order.
  - This is the single source of truth for navigation.
  - To insert a new step, just add its ID to this array where it belongs.
─────────────────────────────────────────────────────────────────────────────*/
const STEP_ORDER: StepId[] = ["intro", "review", "workspace"];

/*─────────────────────────────────────────────────────────────────────────────
  #3 — Optional helper: type guards / tiny utils
─────────────────────────────────────────────────────────────────────────────*/
const isStepId = (x: string): x is StepId => (STEP_ORDER as string[]).includes(x);

/*─────────────────────────────────────────────────────────────────────────────
  #4 — Small, reusable step engine.
  - Holds the current index, exposes goTo/next/prev and guards.
  - If you ever want to persist the current step, just lift the state up
    or mirror `index` into a store / URL param.
─────────────────────────────────────────────────────────────────────────────*/
function useStepper(initial: StepId = STEP_ORDER[0]) {
  const initialIndex = Math.max(0, STEP_ORDER.indexOf(initial));
  const [index, setIndex] = useState<number>(initialIndex);

  const step = STEP_ORDER[index];
  const isFirst = index === 0;
  const isLast = index === STEP_ORDER.length - 1;

  const goTo = useCallback((id: StepId) => {
    const i = STEP_ORDER.indexOf(id);
    if (i !== -1) setIndex(i); // ignore unknown ids
  }, []);

  const next = useCallback(() => {
    setIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  }, []);

  const prev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  return { step, index, isFirst, isLast, goTo, next, prev };
}

/*─────────────────────────────────────────────────────────────────────────────
  #5 — App: orchestrates steps and shared state across them.
  - `picked` stays here; children receive minimal, explicit props.
  - `addFiles` still writes into your global store if needed by Workspace.
─────────────────────────────────────────────────────────────────────────────*/
export default function App() {
  const addFiles = useStore((s) => s.addFiles);
  const [picked, setPicked] = useState<File[]>([]);
  const { step, goTo, next, prev, isFirst, isLast } = useStepper("intro");

  /*───────────────────────────────────────────────────────────────────────────
    #6 — Input normalization for Intro.
    - Only allow PDFs; push to both local state and global store once.
    - When successful, advance to the next step (decoupled from specific ID).
  ───────────────────────────────────────────────────────────────────────────*/
  const handleIntroDone = useCallback(
    (files: File[]) => {
      const pdfs = files.filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
      );
      if (pdfs.length) {
        setPicked(pdfs);
        addFiles(pdfs);
        next(); // ← future-proof: moves to whatever comes after "intro"
      }
    },
    [addFiles, next],
  );

  /*───────────────────────────────────────────────────────────────────────────
    #7 — Step registry (render logic in one location).
    - Each step can call `prev/next/goTo` without knowing what’s before/after.
    - To add a new step:
      1) Add ID to `StepId`
      2) Insert ID in `STEP_ORDER`
      3) Add a render branch here (or map it in a Record)
  ───────────────────────────────────────────────────────────────────────────*/
  const view = useMemo(() => {
    switch (step) {
      case "intro":
        return <IntroStep onReady={handleIntroDone} />;

      case "review":
        return (
          <ErrorBoundary>
            <ReviewStep
              files={picked}
              onBack={!isFirst ? prev : undefined}
              onContinue={next}
            />
          </ErrorBoundary>
        );

      case "workspace":
        return <WorkspaceStep onBack={!isFirst ? prev : undefined} />;

      default:
        // Defensive fallback: if step is somehow unknown, reset to first step.
        return <IntroStep onReady={handleIntroDone} />;
    }
  }, [handleIntroDone, isFirst, next, picked, prev, step]);

  /*───────────────────────────────────────────────────────────────────────────
    #8 — Optional: tiny debug / dev UX (remove if not needed).
    - Shows where you are and enables direct jumps (great while iterating).
  ───────────────────────────────────────────────────────────────────────────*/
  const DevStepperHUD = (
    <div
      style={{
        position: "fixed",
        insetInline: 16,
        bottom: 16,
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "8px 10px",
        borderRadius: 10,
        background: "rgba(0,0,0,0.06)",
        backdropFilter: "saturate(1.2) blur(4px)",
        fontSize: 12,
        zIndex: 50,
      }}
    >
      <strong>Step:</strong>
      {STEP_ORDER.map((id) => (
        <button
          key={id}
          onClick={() => goTo(id)}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: id === step ? "2px solid #7b61ff" : "1px solid #C9CDD6",
            background: id === step ? "#F1EFFF" : "#fff",
            cursor: "pointer",
          }}
        >
          {id}
        </button>
      ))}
      <span style={{ marginInlineStart: "auto", opacity: 0.75 }}>
        {isFirst ? "⏹ first" : "← prev"} · {isLast ? "⏹ last" : "next →"}
      </span>
    </div>
  );

  return (
    <>
      {view}
      {DevStepperHUD}
    </>
  );
}

/*─────────────────────────────────────────────────────────────────────────────
  #9 — How to add a new step (example):
  - Suppose you create `PermissionsStep` at "@/components/steps/PermissionsStep".
  - Do this:
      1) type StepId = "intro" | "review" | "permissions" | "workspace";
      2) const STEP_ORDER = ["intro", "review", "permissions", "workspace"] as const;
      3) In the switch() inside `view`, add:
         case "permissions":
           return <PermissionsStep onBack={prev} onContinue={next} />;
  - Done. No other wiring needed.
─────────────────────────────────────────────────────────────────────────────*/

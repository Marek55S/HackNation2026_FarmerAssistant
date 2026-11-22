"use client";

// Shown while the server computes a report opened from a link or from "Twoje gospodarstwo" (it can take tens of seconds).
// The same step-by-step story as on the start screen, on simulated timings (lib/progress.ts), plus the report's outline.

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { justAnalysed } from "@/lib/farm";
import { AppHeader } from "@/components/app-header";
import { Backdrop } from "@/components/backdrop";
import { ProgressPanel, type ProgressState } from "@/components/start/side-panels";
import { isValidIso, todayIso } from "@/lib/dates";
import { stepDefs, stepsAt } from "@/lib/progress";

export default function RaportLoading() {
  const q = useSearchParams();
  const raw = q.get("data");
  const today = todayIso();
  const date = isValidIso(raw) ? raw : today;
  const [status, setStatus] = useState<ProgressState>(() => {
    const s = stepsAt(stepDefs(date, date === today), 0);
    return { elapsed: 0, progress: s.progress, steps: s.steps, done: false };
  });

  // Coming straight from the analysis on the start screen: no second round of steps, just "opening".
  const opening = useSyncExternalStore(
    () => () => {},
    justAnalysed,
    () => false,
  );

  useEffect(() => {
    if (opening) return;
    const defs = stepDefs(date, date === today);
    const t0 = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - t0) / 1000;
      const s = stepsAt(defs, elapsed);
      setStatus({ elapsed, progress: s.progress, steps: s.steps, done: false });
    }, 250);
    return () => clearInterval(id);
  }, [date, today, opening]);

  const shown: ProgressState = opening
    ? (() => {
        const s = stepsAt(stepDefs(date, date === today), 0, true);
        return { elapsed: status.elapsed, progress: 100, steps: s.steps, done: true };
      })()
    : status;

  return (
    <div className="relative isolate min-h-screen text-ink">
      <Backdrop />
      <AppHeader active="raport" reportHref={null} />
      <main className="mx-auto flex max-w-[1376px] flex-col gap-5 px-8 pb-14 pt-6 max-sm:gap-4 max-sm:px-4 max-sm:pt-4" aria-busy="true">
        <div className="flex flex-col gap-2 pt-2">
          <div className="skeleton h-9 w-72 max-w-full rounded-xl" />
          <div className="skeleton h-4 w-96 max-w-full rounded-lg" />
        </div>
        <div className="grid gap-5 max-sm:gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="skeleton min-h-[260px] rounded-[var(--r-card)] max-lg:hidden" />
          <ProgressPanel status={shown} error={null} />
        </div>
        <div className="skeleton h-40 rounded-[var(--r-card)]" />
        <div className="skeleton h-64 rounded-[var(--r-card)]" />
      </main>
    </div>
  );
}

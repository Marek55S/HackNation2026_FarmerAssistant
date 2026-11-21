import { NextRequest, NextResponse } from "next/server";
import { BackendError, fetchReport, reportUrl } from "@/lib/backend";
import { todayIso, validatePeriod } from "@/lib/dates";
import { stepDefs, stepsAt } from "@/lib/progress";
import type { AnalyzeEvent, Report } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/analyze {dzialka, data, od?, uprawa?} → report JSON computed by the backend.
 * With `Accept: application/x-ndjson` the response is a stream of progress events ending with the report.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { dzialka?: unknown; data?: unknown; od?: unknown; uprawa?: unknown } | null;
  const dzialka = typeof body?.dzialka === "string" ? body.dzialka.trim() : "";
  const data = typeof body?.data === "string" ? body.data : "";
  const od = typeof body?.od === "string" ? body.od : null;
  const uprawa = typeof body?.uprawa === "string" ? body.uprawa : null;
  const today = todayIso();

  if (!dzialka || dzialka.length > 64) return NextResponse.json({ error: "Podaj identyfikator działki." }, { status: 400 });
  const dateError = validatePeriod(od, data, today);
  if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });

  const job = fetchReport({ dzialka, data, od, uprawa });
  const errorOf = (e: unknown) => (e instanceof BackendError ? e : new BackendError("Analiza nie powiodła się.", 500));

  if (!req.headers.get("accept")?.includes("application/x-ndjson")) {
    try {
      return NextResponse.json(await job);
    } catch (e) {
      const err = errorOf(e);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
  }

  const defs = stepDefs(data, data === today);
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AnalyzeEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      const t0 = Date.now();
      const box: { done: { report: Report } | { error: BackendError } | null } = { done: null };
      job.then(
        (report) => (box.done = { report }),
        (e) => (box.done = { error: errorOf(e) }),
      );
      while (!box.done) {
        if (req.signal.aborted) return controller.close();
        const s = stepsAt(defs, (Date.now() - t0) / 1000);
        send({ type: "progress", elapsed: (Date.now() - t0) / 1000, progress: s.progress, steps: s.steps });
        await new Promise((r) => setTimeout(r, 250));
      }
      const done = box.done;
      if ("error" in done) {
        send({ type: "error", error: done.error.message });
      } else {
        const s = stepsAt(defs, (Date.now() - t0) / 1000, true);
        send({ type: "progress", elapsed: (Date.now() - t0) / 1000, progress: 100, steps: s.steps });
        send({ type: "report", report: done.report, url: reportUrl({ dzialka: done.report.parcel.id, data, od, uprawa }) });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

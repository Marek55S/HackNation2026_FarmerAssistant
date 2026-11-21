import { NextRequest, NextResponse } from "next/server";
import { todayIso, validatePeriod } from "@/lib/dates";
import { stepDefs, stepsAt } from "@/lib/mock/analysis";
import { buildReport, reportUrl } from "@/lib/mock/report";
import type { AnalyzeEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/analyze {dzialka, data, od?, uprawa?} → report JSON (TODO T1.1). `od` = start of a period to summarise; `data` = its end (D).
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
  const result = buildReport({ parcelId: dzialka, date: data, from: od, crop: uprawa, today });
  if ("error" in result) {
    return result.error === "not-found"
      ? NextResponse.json({ error: "Nie ma takiej działki w ewidencji." }, { status: 404 })
      : NextResponse.json({ error: "Brak danych o uprawie dla tego roku — wybierz uprawę." }, { status: 422 });
  }
  const url = reportUrl({ dzialka: result.report.parcel.id, data, od, uprawa });

  if (!req.headers.get("accept")?.includes("application/x-ndjson")) {
    return NextResponse.json(result.report);
  }

  const defs = stepDefs(data, data === today);
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AnalyzeEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      const t0 = Date.now();
      for (;;) {
        if (req.signal.aborted) return controller.close();
        const elapsed = (Date.now() - t0) / 1000;
        const s = stepsAt(defs, elapsed);
        send({ type: "progress", elapsed, progress: s.progress, steps: s.steps });
        if (s.done) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      send({ type: "report", report: result.report, url });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

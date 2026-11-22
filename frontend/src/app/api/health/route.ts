import { NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend";

export const dynamic = "force-dynamic";

/** Status frontu + ping backendu analizy (nie mylić z mockiem UI). */
export async function GET() {
  try {
    const r = await fetch(`${BACKEND_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({
      status: r.ok ? "ok" : "degraded",
      mock: false,
      backend: r.ok ? data : { status: "error", http: r.status },
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", mock: false, backend: "down" },
      { status: 503 },
    );
  }
}

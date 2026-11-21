import { NextResponse } from "next/server";
import { decodeJobId, jobStatus } from "@/lib/mock/analysis";

export async function GET(_req: Request, ctx: RouteContext<"/api/analysis/[id]">) {
  const { id } = await ctx.params;
  const job = decodeJobId(id);
  if (!job) return NextResponse.json({ error: "Nie ma takiej analizy." }, { status: 404 });
  return NextResponse.json(jobStatus(id, job), { headers: { "Cache-Control": "no-store" } });
}

import { NextRequest, NextResponse } from "next/server";
import { isValidIso, MIN_DATE, todayIso } from "@/lib/dates";
import { createJobId } from "@/lib/mock/analysis";
import { findParcelById } from "@/lib/mock/parcels";

// Starts an analysis; the client then polls GET /api/analysis/{id}.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { parcelId?: string; date?: string; crop?: string } | null;
  if (!body?.parcelId || !findParcelById(body.parcelId)) {
    return NextResponse.json({ error: "Nieprawidłowa działka." }, { status: 400 });
  }
  if (!isValidIso(body.date) || body.date < MIN_DATE || body.date > todayIso()) {
    return NextResponse.json({ error: `Data musi być między ${MIN_DATE} a dziś.` }, { status: 400 });
  }
  const id = createJobId({ parcelId: body.parcelId, date: body.date, crop: body.crop });
  return NextResponse.json({ id }, { status: 202 });
}

import { NextRequest, NextResponse } from "next/server";
import { isValidIso, todayIso } from "@/lib/dates";
import { buildReport } from "@/lib/mock/report";

// Full report JSON: ?dzialka=…&data=yyyy-mm-dd&uprawa=…
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const date = q.get("data");
  const report = buildReport({ parcelId: q.get("dzialka"), date: isValidIso(date) ? date : todayIso(), crop: q.get("uprawa") });
  if (!report) return NextResponse.json({ error: "Nie znaleźliśmy takiej działki." }, { status: 404 });
  return NextResponse.json(report);
}

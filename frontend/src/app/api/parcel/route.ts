import { NextRequest, NextResponse } from "next/server";
import { isValidIso, todayIso } from "@/lib/dates";
import { findParcelById, findParcelByName, findParcelByNumber } from "@/lib/mock/parcels";

// Mock of the ULDK lookups (+ ARiMR crop hint for the analysis date):
// ?id=…  |  ?gmina=…&obreb=…&nr=…  |  ?mapa=<numer> (click on the demo map); all with &data=yyyy-mm-dd
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const raw = q.get("data");
  const date = isValidIso(raw) ? raw : todayIso();
  const id = q.get("id");
  const map = q.get("mapa");
  const found = id
    ? findParcelById(id, date)
    : map
      ? findParcelByNumber(map, date)
      : findParcelByName(q.get("gmina") ?? "", q.get("obreb") ?? "", q.get("nr") ?? "", date);
  if (!found) {
    return NextResponse.json(
      { error: "Nie ma takiej działki w ewidencji. Sprawdź identyfikator albo wskaż ją na mapie." },
      { status: 404 },
    );
  }
  return NextResponse.json(found);
}

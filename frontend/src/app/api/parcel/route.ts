import { NextRequest, NextResponse } from "next/server";
import { findParcelById, findParcelByName, findParcelByPoint } from "@/lib/mock/parcels";

// Mock of the ULDK lookups: ?id=… | ?gmina=…&obreb=…&nr=… | ?x=0..1
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = q.get("id");
  const x = q.get("x");
  const parcel = id
    ? findParcelById(id)
    : x !== null
      ? findParcelByPoint(Number(x))
      : findParcelByName(q.get("gmina") ?? "", q.get("obreb") ?? "", q.get("nr") ?? "");
  if (!parcel) {
    return NextResponse.json(
      { error: "Nie znaleźliśmy takiej działki. Sprawdź format identyfikatora albo wskaż ją na mapie." },
      { status: 404 },
    );
  }
  return NextResponse.json({ parcel });
}

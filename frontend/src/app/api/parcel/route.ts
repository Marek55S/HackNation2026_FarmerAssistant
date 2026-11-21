import { NextRequest, NextResponse } from "next/server";
import { isValidIso, todayIso } from "@/lib/dates";
import { findParcelById, findParcelByName, findParcelByNumber } from "@/lib/mock/parcels";
import { parcelAtPoint } from "@/lib/uldk";

// Mock of the ULDK lookups (+ ARiMR crop hint for the analysis date):
// ?id=…  |  ?gmina=…&obreb=…&nr=…  |  ?mapa=<numer> (click on the demo map); all with &data=yyyy-mm-dd
// Real lookup: ?mapa=xy:<lon>,<lat>&roslina=<ARiMR crop> – click on a crop field (ULDK GetParcelByXY).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const raw = q.get("data");
  const date = isValidIso(raw) ? raw : todayIso();
  const id = q.get("id");
  const map = q.get("mapa");

  if (map?.startsWith("xy:")) {
    const [lon, lat] = map.slice(3).split(",").map(Number);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 13.5 || lon > 24.5 || lat < 48.8 || lat > 55.2) {
      return NextResponse.json({ error: "Punkt poza Polską." }, { status: 400 });
    }
    try {
      const found = await parcelAtPoint(lon, lat, (q.get("roslina") ?? "").slice(0, 80), Number(q.get("rok")) || Number(date.slice(0, 4)));
      if (!found) return NextResponse.json({ error: "W tym miejscu nie ma działki w ewidencji." }, { status: 404 });
      return NextResponse.json(found);
    } catch {
      return NextResponse.json({ error: "Ewidencja (ULDK) nie odpowiada — spróbuj ponownie." }, { status: 502 });
    }
  }

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

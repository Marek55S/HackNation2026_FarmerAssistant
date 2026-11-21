import { NextRequest, NextResponse } from "next/server";
import { backend, BackendError, toLookup, type BackendParcel } from "@/lib/backend";
import { isValidIso, todayIso } from "@/lib/dates";

// Parcel lookup via the backend (ULDK + crop hint for the year of the analysis date + IUNG land cover):
// ?id=…  |  ?gmina=…&obreb=…&nr=…  |  ?mapa=xy:<lon>,<lat> (click on a crop field – crop of the field under the point); all with &data=yyyy-mm-dd
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const raw = q.get("data");
  const date = isValidIso(raw) ? raw : todayIso();
  const id = q.get("id")?.trim();
  const map = q.get("mapa");

  try {
    let body: Record<string, unknown>;
    if (map?.startsWith("xy:")) {
      const [lon, lat] = map.slice(3).split(",").map(Number);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return NextResponse.json({ error: "Nieprawidłowy punkt." }, { status: 400 });
      body = { lon, lat, data: date };
    } else if (id) {
      body = { id, data: date };
    } else {
      const obreb = (q.get("obreb") ?? "").trim();
      const nr = (q.get("nr") ?? "").trim();
      if (!obreb || !nr) return NextResponse.json({ error: "Podaj obręb i numer działki." }, { status: 400 });
      const s = await backend<{ ok: boolean; wyniki: { id: string }[]; powod?: string }>(
        `/api/szukaj?${new URLSearchParams({ obreb, numer: nr, ...(q.get("gmina") ? { gmina: q.get("gmina")! } : {}) })}`,
        { timeoutMs: 15000 },
      );
      if (!s.ok || !s.wyniki.length) return NextResponse.json({ error: s.powod ?? "Nie znaleziono działki." }, { status: 404 });
      body = { id: s.wyniki[0].id, data: date };
    }
    const b = await backend<BackendParcel>("/api/dzialka", { method: "POST", body: JSON.stringify(body), timeoutMs: 20000 });
    const found = toLookup(b);
    if (!found) {
      return NextResponse.json({ error: b.powod ?? "Nie ma takiej działki w ewidencji. Sprawdź identyfikator albo wskaż ją na mapie." }, { status: 404 });
    }
    return NextResponse.json(found);
  } catch (e) {
    const err = e instanceof BackendError ? e : new BackendError("Błąd wyszukiwania działki.", 500);
    return NextResponse.json({ error: err.message }, { status: err.status === 422 ? 400 : err.status });
  }
}

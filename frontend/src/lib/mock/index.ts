// TYLKO DO TESTÓW FRONTENDU — usunąć przed pushem (cały katalog src/lib/mock + linie oznaczone „MOCK_API”).
// Włączane zmienną środowiskową MOCK_API=1: działki i raporty z danych przykładowych, bez backendu.

import { BackendError } from "../backend";
import { isValidIso, todayIso } from "../dates";
import type { ParcelLookup, Report } from "../types";
import { findParcelById, findParcelByName, findParcelByNumber } from "./parcels";
import { buildReport } from "./report";
import { parcelAtPoint } from "./uldk";

export const MOCK_API = process.env.MOCK_API === "1";

/** Long enough to see the progress panel, short enough not to annoy. */
const DELAY_MS = 2500;

export async function mockReport(p: { dzialka: string; data: string; od: string | null; uprawa: string | null }): Promise<Report> {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  const result = buildReport({ parcelId: p.dzialka, date: p.data, from: p.od, crop: p.uprawa, today: todayIso() });
  if ("error" in result) {
    throw result.error === "not-found"
      ? new BackendError(
          "Dane przykładowe są tylko dla działek 041005_5.0011.22/15, 041005_5.0021.662/11 i 041005_5.0029.3225/6.",
          404,
        )
      : new BackendError("Brak danych o uprawie dla tego roku — wybierz uprawę.", 422);
  }
  return result.report;
}

/** Same query as /api/parcel: ?id= | ?gmina=&obreb=&nr= | ?mapa=xy:lon,lat (real ULDK lookup, free) */
export async function mockParcel(q: URLSearchParams): Promise<{ status: number; body: ParcelLookup | { error: string } }> {
  const raw = q.get("data");
  const date = isValidIso(raw) ? raw : todayIso();
  const map = q.get("mapa");
  if (map?.startsWith("xy:")) {
    const [lon, lat] = map.slice(3).split(",").map(Number);
    try {
      const found = await parcelAtPoint(lon, lat, "", Number(date.slice(0, 4)));
      return found ? { status: 200, body: found } : { status: 404, body: { error: "W tym miejscu nie ma działki w ewidencji." } };
    } catch {
      return { status: 502, body: { error: "Ewidencja (ULDK) nie odpowiada — spróbuj ponownie." } };
    }
  }
  const id = q.get("id");
  const found = id
    ? findParcelById(id.trim(), date)
    : map
      ? findParcelByNumber(map, date)
      : findParcelByName(q.get("gmina") ?? "", q.get("obreb") ?? "", q.get("nr") ?? "", date);
  return found
    ? { status: 200, body: found }
    : { status: 404, body: { error: "Nie ma takiej działki w danych przykładowych. Spróbuj 041005_5.0011.22/15." } };
}

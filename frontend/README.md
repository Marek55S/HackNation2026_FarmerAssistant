# Hydrowise — frontend (PWA)

Next.js 16 + TypeScript + Tailwind 4, the same setup as [quickReport](https://github.com/Marek55S/quickReport).
The UI follows the mockups in [`../makieta-ui`](../makieta-ui). Data comes from the Python backend in [`../backend`](../backend) (`BACKEND_URL`, default `http://127.0.0.1:8000`).

### In Docker (nothing to install on the host except Docker)

```bash
docker compose up dev            # http://localhost:3000 — hot reload, edits in src/ apply immediately
docker compose up --build prod   # http://localhost:8080 — the same image as Cloud Run (PWA + offline work)
docker compose down              # stop
```

Dependencies, the pnpm store and the Next.js cache stay in Docker volumes, not in the project folder.
After changing `package.json` run `docker compose down -v && docker compose up dev` to reinstall.

### Without Docker (Node 24 + pnpm)

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build && pnpm start   # production build (the service worker only runs here)
```

## Screens

| Path | Screen |
|---|---|
| `/` | Start: choose the parcel (id / gmina+obręb+numer / map), today / a day / a period (od–do), "Twoje gospodarstwo", analysis progress |
| `/raport?dzialka=…&data=yyyy-mm-dd&od=…&uprawa=…` | Report: status, map with layers (plan / gdzie sucho / teren / gleba), what to do and where, causes, risk, sources |

The report mode follows the date (pipeline_plan.md F13): **in season 21.III–30.IX** ("water now", label *Susza trwa / nadchodzi*, *Zagrożenie* or *Spokojnie*)
and **off season** ("Plan na sezon {rok}" — retain water for next year). Non-agricultural parcels get **Poza zakresem**.
The crop is a hint from ARiMR declarations (2020–2026) or the JRC crop map (2018, 2022); for years without data (e.g. 2016, 2017, 2019) the farmer picks it from tiles.
On phones (< 768 px) the layout is a single column with a bottom navigation bar. "Drukuj / zapisz PDF" uses the browser's print dialog with an A4 print stylesheet (collapsed sections are expanded for print).

The map uses MapLibre GL on the Geoportal orthophoto (GUGiK WMTS, free, no API key) with an OpenStreetMap switch; if the orthophoto delivers no tile within 6 s the map falls back to OSM. Parcel boundary, recommendation features and 10 m rasters come from the report JSON (`Report.map`, `Parcel.geometry`, `Zalecenie.punkt`, all in EPSG:4326).

## API (proxies to the backend)

| Endpoint | Purpose |
|---|---|
| `POST /api/analyze` `{dzialka, data, od?, uprawa?}` | report JSON (TODO T1.1). `od` = start of a period (max 12 months) summarised in `period`; recommendations are for `data`. With `Accept: application/x-ndjson`: stream of `progress` events, then `report` |
| `GET /api/health` | health check |
| `GET /api/parcel?id=…&data=…` / `?gmina=…&obreb=…&nr=…&data=…` / `?mapa=<numer>&data=…` | parcel lookup (ULDK mock) + crop hint for the year of `data` |

Errors: `400` invalid input, `404` parcel not in the register, `422` no crop data for that year and no `uprawa` given.

The JSON shape is in `src/lib/types.ts` (`Report`, `Zalecenie {regula, co, gdzie, kiedy, ile, bo[], co_zyskasz, fakty[]}` as in TODO T1.2, `AnalyzeEvent` for the stream).
The mock lives in `src/lib/mock/`; to plug in the backend, replace `buildReport()` and the stream in `src/app/api/analyze/route.ts` with calls to it and keep the JSON shape.

## PWA

- `src/app/manifest.ts` — web app manifest; icons generated at build time (`src/app/icons/[size]`, `apple-icon.tsx`)
- `public/sw.js` — service worker: pages network-first with cached fallback (the last opened report works offline), static assets cache-first. Bump `VERSION` in `sw.js` when caching rules change.
- Installing on a phone needs HTTPS (Cloud Run URL or a tunnel).

## Deploying to Cloud Run

```bash
gcloud run deploy asystent-wodny --source . --region=europe-central2 --allow-unauthenticated --memory=512Mi --max-instances=2
```

Run it from this `frontend/` directory; the `Dockerfile` builds the Next.js standalone server.

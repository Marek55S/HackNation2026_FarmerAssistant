# Asystent Wodny — frontend (PWA)

Next.js 16 + TypeScript + Tailwind 4, the same setup as [quickReport](https://github.com/Marek55S/quickReport).
The UI follows the mockups in [`../makieta-ui`](../makieta-ui). All data is **example data** from a mock API.

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build && pnpm start   # production build (the service worker only runs here)
```

## Screens

| Path | Screen |
|---|---|
| `/` | Start: choose the parcel (id / gmina+obręb+numer / map), date, "Twoje gospodarstwo", analysis progress |
| `/raport?dzialka=…&data=yyyy-mm-dd&uprawa=…` | Report: status, map with layers (plan / gdzie sucho / teren / gleba), what to do and where, causes, risk, sources |

The report has two variants chosen by date: in season (April–September, "water now") and off season ("retain water for next year").
On phones (< 768 px) the layout is a single column with a bottom navigation bar. "Drukuj" / "PDF" use the browser's print dialog with an A4 print stylesheet.

## Mock API (to be replaced by the real pipeline)

| Endpoint | Purpose |
|---|---|
| `GET /api/parcel?id=…` / `?gmina=…&obreb=…&nr=…` / `?x=0..1` | parcel lookup (ULDK mock) |
| `POST /api/analysis` `{parcelId, date, crop?}` → `{id}` | start the analysis |
| `GET /api/analysis/{id}` | progress (steps, %, `reportUrl` when done) |
| `GET /api/report?dzialka=…&data=…&uprawa=…` | full report JSON (`src/lib/types.ts` → `Report`) |

The mock lives in `src/lib/mock/`. To plug in the real pipeline, replace `buildReport()` and `jobStatus()` with calls to the backend and keep the JSON shape from `src/lib/types.ts`.

## PWA

- `src/app/manifest.ts` — web app manifest; icons generated at build time (`src/app/icons/[size]`, `apple-icon.tsx`)
- `public/sw.js` — service worker: pages network-first with cached fallback (the last opened report works offline), static assets cache-first. Bump `VERSION` in `sw.js` when caching rules change.
- Installing on a phone needs HTTPS (Cloud Run URL or a tunnel).

## Deploying to Cloud Run

```bash
gcloud run deploy asystent-wodny --source . --region=europe-central2 --allow-unauthenticated --memory=512Mi --max-instances=2
```

Run it from this `frontend/` directory; the `Dockerfile` builds the Next.js standalone server.

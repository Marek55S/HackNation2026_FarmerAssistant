// Shared shapes between the API and the UI. The real pipeline (pipeline_plan.md, TODO T1.1–T1.2) should return the same JSON.

export type CropId =
  | "kukurydza"
  | "pszenica"
  | "jare"
  | "rzepak"
  | "ziemniak"
  | "burak"
  | "laka"
  | "inna";

export interface Crop {
  id: CropId;
  name: string;
  hint: string;
  /** Has a row in dane/kbw_progi_iung.csv; otherwise the report says "brak urzędowego progu" (T7.2). */
  hasOfficialThreshold: boolean;
}

/** Land cover from the IUNG layer (P4): agricultural soil categories, organic soils or non-agricultural codes 11–14. */
export type LandCover = "rolny" | "organiczna" | "las" | "woda" | "zabudowa" | "drogi";

export interface Parcel {
  /** Full EGiB identifier, e.g. 040410_2.0012.245/3 */
  id: string;
  /** Parcel number alone, e.g. 245/3 */
  number: string;
  gmina: string;
  obreb: string;
  wojewodztwo: string;
  areaHa: number;
  landUse: string;
  landCover: LandCover;
  /** Outer ring of the parcel boundary, [lon, lat] in EPSG:4326 (ULDK geom_wkt) */
  geometry: LngLat[];
}

export type LngLat = [number, number];

/** F0: crop hint for the year of the analysis date. null = no data for that year → the farmer picks from tiles. */
export interface CropHint {
  crop: CropId;
  /** e.g. "deklaracja ARiMR 2026" or "mapa upraw JRC 2018" */
  source: string;
}

export interface ParcelLookup {
  parcel: Parcel;
  cropHint: CropHint | null;
  /** Non-agricultural parcel (IUNG codes 11–14) → "Poza zakresem" (T2.6) */
  outOfScope: boolean;
}

/** F13: 21.III–30.IX = season; otherwise the report plans the next season. */
export type Season = "sezon" | "poza-sezonem";

/** Report label (pipeline_plan.md, etap 5 / T7.1). */
export type StatusTone = "susza" | "zagrozenie" | "spokojnie" | "plan" | "poza-zakresem";

export type MapLayer = "plan" | "sucho" | "teren" | "gleba";
export type ActionCategory = "ret" | "agro" | "irr";
export type RuleId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R7-" | "R8" | "R9";

/**
 * Recommendation (T1.2 `Zalecenie {reguła, co, gdzie, kiedy, ile, bo[], co_zyskasz, fakty[]}`)
 * plus the fields the UI needs to place it on the map.
 */
export interface Zalecenie {
  regula: RuleId;
  co: string;
  gdzie: string;
  kiedy: string;
  ile: string | null;
  bo: string[];
  co_zyskasz: string;
  /** Fact ids used by the rule, e.g. ["F7", "F8"] */
  fakty: string[];
  /** Number on the map and in the list (1…6) */
  n: number;
  kategoria: ActionCategory;
  /** Where the pin goes on the map, [lon, lat] */
  punkt: LngLat;
  /** Map view that shows why the action is placed here */
  warstwa: MapLayer;
  /** Longer explanation shown when the card is opened */
  dlaczego: string;
  tagi: string[];
}

export type CauseLevel = "główna" | "duża" | "mała";

export interface Cause {
  /** C1–C6 */
  id: string;
  name: string;
  evidence: string;
  level: CauseLevel;
  icon: "rain" | "sun" | "sand" | "slope" | "ditch";
  color: string;
  /** Layer that shows the cause; null for weather causes */
  layer: MapLayer | null;
}

export type DroughtTag = "skrajna" | "silna" | "umiark." | "lekka" | "brak";

export interface SeasonHistory {
  year: number;
  crop: string;
  tag: DroughtTag;
}

export interface SourceStatus {
  /** P1–P13 */
  id: string;
  /** What the data is, e.g. "Pogoda 1997–2026" */
  what: string;
  /** Where it comes from, e.g. "ERA5-Land (Open-Meteo)"; null when missing */
  source: string | null;
  /** ok · current = present-day state, not as of the analysis date · missing = no data */
  state: "ok" | "current" | "missing";
  /** Short caveat shown next to the row (only when something is off) */
  note?: string;
  /** ISO date the data was fetched */
  fetchedAt: string | null;
}

/** Something the report could not check, and why (T8.5). */
export interface NotChecked {
  what: string;
  why: string;
}

/** Summary of a chosen period (from–to); recommendations are still computed for D = `to`. */
export interface PeriodSummary {
  from: string;
  to: string;
  days: number;
  /** Days of the period inside the growing season 21.III–30.IX */
  seasonDays: number;
  rainMm: number;
  rainNormMm: number;
  et0Mm: number;
  et0NormMm: number;
  /** Climatic water balance (rain − ET0) over the period */
  kbwMm: number;
  /** Days with root-zone water below the crop stress threshold (F4 < F4p) */
  stressDays: number;
  minSoilPct: number;
  /** IUNG drought criterion met at some point in the period; null when the period is outside the season */
  iungDrought: boolean | null;
  /** In how many of the previous 10 years the same period was wetter */
  wetterYears: number;
  say: string;
}

/** Grid raster over a bounding box; values are class indexes (see the map legend), -1 = outside the parcel. */
export interface RasterGrid {
  bbox: [number, number, number, number]; // west, south, east, north
  cols: number;
  rows: number;
  /** Row-major from the north-west corner */
  values: number[];
  /** Cell size in metres (Sentinel-2 = 10 m) */
  cellM: number;
}

export type MapFeatureKind = "row" | "zaglebienie" | "strefa-podlewania" | "pas-zadrzewien" | "splyw";

export interface MapFeature {
  kind: MapFeatureKind;
  /** Rule that this feature belongs to (highlighted when its recommendation is selected) */
  regula: RuleId | null;
  geometry: { type: "LineString"; coordinates: LngLat[] } | { type: "Polygon"; coordinates: LngLat[][] };
  /** Map views where the feature is drawn */
  layers: MapLayer[];
}

export interface MapLabel {
  punkt: LngLat;
  text: string;
  layers: MapLayer[];
  tone: "ink" | "red" | "blue" | "muted";
  /** Hidden on narrow maps */
  minor?: boolean;
}

/** Map layers for the report (T5.6: geometries as GeoJSON). */
export interface ReportMap {
  features: MapFeature[];
  rasters: Partial<Record<Exclude<MapLayer, "plan">, RasterGrid>>;
  labels: MapLabel[];
}

export interface Report {
  parcel: Parcel;
  map: ReportMap;
  period: PeriodSummary | null;
  crop: Crop | null;
  cropSource: string;
  date: string; // ISO yyyy-mm-dd
  dateLong: string;
  isToday: boolean;
  season: Season;
  yearsLabel: string;
  /** Number of weather scenarios (N = 10 or 30, pipeline_plan.md §4b) */
  scenarios: number;
  soilWaterPct: number | null;
  stressThresholdPct: number | null;
  status: { label: string; tone: StatusTone };
  headline: string;
  summary: string;
  confidence: { level: "wysoka" | "średnia" | "niska"; agreeing: number; total: number; note: string | null };
  /** "Pilne teraz" / "Najlepiej teraz" — one recommendation (n), or null */
  urgent: { n: number; label: string; title: string; sub: string } | null;
  actions: Zalecenie[];
  mapInfo: Record<MapLayer, { say: string; src: string }>;
  causes: Cause[];
  risk: { head: string; say: string; note: string; cols: string[]; noAction: number[]; withPlan: number[] } | null;
  /** Collapsed justification (§8 pt 7): IUNG criterion now (F3) + 10-year history (F5, F0h) */
  justification: { iungNow: string; history: SeasonHistory[]; historyNote: string } | null;
  sources: SourceStatus[];
  notChecked: NotChecked[];
  advisorDetails: string[];
}

export type StepState = "done" | "running" | "wait" | "failed";

export interface AnalysisStep {
  label: string;
  src: string;
  state: StepState;
  seconds: number | null;
  /** When failed: what the report will say is missing */
  error?: string;
}

/** One line of the NDJSON stream from POST /api/analyze (Accept: application/x-ndjson). */
export type AnalyzeEvent =
  | { type: "progress"; elapsed: number; progress: number; steps: AnalysisStep[] }
  | { type: "report"; report: Report; url: string }
  | { type: "error"; error: string };

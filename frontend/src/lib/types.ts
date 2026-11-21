// Shared shapes between the mock API and the UI. The real pipeline (pipeline_plan.md) should return the same JSON.

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
}

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
  detectedCrop: CropId;
  cropSource: string;
}

/** In-season reports (April–September) focus on watering now; off-season ones on retaining water for next year. */
export type Season = "sezon" | "poza-sezonem";

export type MapLayer = "plan" | "sucho" | "teren" | "gleba";
export type ActionCategory = "ret" | "agro" | "irr";
export type ActionId = "zastawka" | "niecka" | "drzewa" | "miedzyplon" | "woda";

export interface Action {
  id: ActionId;
  n: number;
  cat: ActionCategory;
  /** Pin position on the map, percent of width/height */
  x: number;
  y: number;
  /** Map layer that shows why this action is placed here */
  layer: MapLayer;
  title: string;
  short: string;
  where: string;
  when: string;
  cause: string;
  gain: string;
  why: string;
  chips: string[];
}

export type CauseLevel = "główna" | "duża" | "mała";

export interface Cause {
  name: string;
  evidence: string;
  level: CauseLevel;
  icon: "rain" | "sun" | "sand" | "slope" | "ditch";
  color: string;
  /** Layer that shows the cause; null for weather-only causes */
  layer: MapLayer | null;
}

export type DroughtTag = "skrajna" | "silna" | "umiark." | "lekka" | "brak";

export interface SeasonHistory {
  year: number;
  crop: string;
  tag: DroughtTag;
}

export interface SourceStatus {
  label: string;
  state: "ok" | "current" | "missing";
}

export interface Report {
  parcel: Parcel;
  crop: Crop;
  cropDetected: boolean;
  date: string; // ISO yyyy-mm-dd
  dateLong: string;
  season: Season;
  yearsLabel: string;
  soilWaterPct: number;
  stressThresholdPct: number;
  status: { label: string; tone: "danger" | "plan" | "ok" };
  headline: string;
  summary: string;
  confidence: { level: string; agreeing: number; total: number };
  urgent: { actionId: ActionId; label: string; title: string; sub: string };
  mobileHeadline: string;
  mobileSub: string;
  actions: Action[];
  mapInfo: Record<MapLayer, { say: string; src: string }>;
  causes: Cause[];
  risk: { head: string; say: string; note: string; cols: string[]; noAction: number[]; withPlan: number[] };
  history: SeasonHistory[];
  historyNote: string;
  sources: SourceStatus[];
  advisorDetails: string[];
}

export type StepState = "done" | "running" | "wait";

export interface AnalysisStep {
  label: string;
  src: string;
  state: StepState;
  seconds: number | null;
}

export interface AnalysisStatus {
  id: string;
  elapsed: number;
  progress: number;
  done: boolean;
  steps: AnalysisStep[];
  reportUrl: string;
}

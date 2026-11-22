import type { ReactNode } from "react";
import type { StatusTone } from "@/lib/types";

/** Stroke icon paths (24×24) used across the app. */
export const ICON = {
  check: "M5 12l5 5 9-10",
  lock: "M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  chevronRight: "M9 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  sprout: "M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-4 3-6 7-6 0 4-3 6-7 6z",
  warn: "M12 3 2 20h20zM12 10v4M12 17v.5",
  chat: "M4 5h16v11H9l-5 4z",
  print: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  trend: "M4 16l6-6 4 4 6-7M15 7h5v5",
  x: "M6 6l12 12M18 6 6 18",
  drop: "M12 3c4 5 6.5 8.4 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 11.4 8 8 12 3z",
  sluice: "M4 20V8M20 20V8M4 8h16M8 8v12M12 8v12M16 8v12",
  tree: "M12 21v-5M7 16h10L12 4z",
  fields: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  doc: "M6 3h9l4 4v14H6zM9 12h7M9 16h7",
  pin: "M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zM12 8v4",
  // Cause icons: one line style, 24 × 24, drawn to read at 18–20 px
  rain: "M7 14.5a4 4 0 1 1 .8-7.9A5 5 0 0 1 17.5 7.6 3.4 3.4 0 0 1 17 14.5H7zM8.5 18v2M12 17.5v3M15.5 18v2",
  sun: "M10 13.6V5.5a2 2 0 1 1 4 0v8.1a3.8 3.8 0 1 1-4 0zM12 9v7.5M17.5 6h2.5M17.5 9.5h2",
  sand: "M3 7.5c3-1.4 6-1.4 9 0s6 1.4 9 0M3 12.5h18M3 17.5h18M7 15h.01M12 10h.01M16.5 15h.01M9.5 20h.01M15 20h.01",
  slope: "M3 19h18L3 8.5V19zM16 5c0 1.2-1.3 2.3-1.3 3.3a1.3 1.3 0 0 0 2.6 0c0-1-1.3-2.1-1.3-3.3",
  ditch: "M3 6.5 7 17h10l4-10.5M8.3 13.2c1.2.8 2.5.8 3.7 0s2.5-.8 3.7 0",
  map: "M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4zM9 4v14M15 6v14",
  // Recommendation icons (same line style as the cause icons)
  gate: "M4 6.5 7.5 17h9L20 6.5M9.5 4v13M14.5 4v13M9.5 9.5h5",
  pond: "M3 15.5c0-2.4 4-4.3 9-4.3s9 1.9 9 4.3-4 4.3-9 4.3-9-1.9-9-4.3zM8 15.8c1.3.7 2.7.7 4 0s2.7-.7 4 0M12 3.5c0 1.3-1.5 2.4-1.5 3.5a1.5 1.5 0 0 0 3 0c0-1.1-1.5-2.2-1.5-3.5",
  trees: "M3 20.5h18M7 20.5v-4M17 20.5v-4M7 16.5a3 3 0 0 1-3-3c0-2.5 3-6.5 3-6.5s3 4 3 6.5a3 3 0 0 1-3 3zM17 16.5a3 3 0 0 1-3-3c0-2.5 3-6.5 3-6.5s3 4 3 6.5a3 3 0 0 1-3 3z",
  satellite: "M13.5 6.5l4 4-3.5 3.5-4-4zM10 10l-1.5 1.5M4 7l3-3 3 3-3 3zM14 17l3-3 3 3-3 3zM5.5 15.5a3 3 0 0 0 3 3",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  watering: "M4 11h9v7.5A1.5 1.5 0 0 1 11.5 20h-6A1.5 1.5 0 0 1 4 18.5zM6 11V9a2.5 2.5 0 0 1 5 0v2M13 14l5.5-4.5M17.5 8l2 2.5M20 13.5v1M21.5 15.5v1M19 16.5v1",
  chevronDown: "M6 9l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  calendar: "M4 6h16v15H4zM4 10h16M9 3v4M15 3v4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  info: "M12 8v.5M12 11v6M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
} as const;

export function Icon({
  d,
  size = 16,
  stroke = 2,
  className,
}: {
  d: string;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ flex: "none" }}
    >
      <path d={d} />
    </svg>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true" style={{ flex: "none" }}>
      <rect width="34" height="34" rx="9" fill="#2F4D3C" />
      <path d="M17 7c4 5 7 8.6 7 12.2A7 7 0 0 1 10 19.2C10 15.6 13 12 17 7z" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13.5 20.5c.6 1.8 2 2.8 3.8 3" fill="none" stroke="#8ec9c4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-[var(--r-card)] border border-rule bg-paper ${className}`}>
      {children}
    </section>
  );
}

export function StepNumber({ n }: { n: number }) {
  return (
    <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
      {n}
    </span>
  );
}

/** Water-in-soil "tank" with the crop stress threshold as a dashed line. */
export function Tank({ pct, threshold, width = 56, height = 92, label }: { pct: number; threshold: number; width?: number; height?: number; label: string }) {
  const inner = height - 6;
  const fillH = (inner * pct) / 100;
  const lineY = 3 + inner * (1 - threshold / 100);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} style={{ flex: "none" }}>
      <rect x="2" y="2" width={width - 4} height={height - 4} rx="10" fill="#EFE6D6" stroke="#C9B48E" strokeWidth="2" />
      <rect x="4" y={height - 3 - fillH} width={width - 8} height={fillH} fill="#2b7a8c" rx="2" />
      <line x1="0" y1={lineY} x2={width} y2={lineY} stroke="#1A1C19" strokeWidth="2" strokeDasharray="4 3" />
    </svg>
  );
}

/** Status dot colour (pipeline_plan.md etap 5). */
export const STATUS_DOT: Record<StatusTone, string> = {
  susza: "bg-status-susza",
  zagrozenie: "bg-status-zagrozenie",
  spokojnie: "bg-status-spokojnie",
  plan: "bg-status-plan",
  "poza-zakresem": "bg-status-poza",
};

/**
 * Report status as a quiet pill: a coloured dot + label, no saturated fill.
 * `onDark` for the dark feature card.
 */
export function StatusPill({ tone, label, small = false, onDark = false }: { tone: StatusTone; label: string; small?: boolean; onDark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full font-semibold ${small ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]"} ${
        onDark ? "bg-white/12 text-feature-ink" : "border border-rule-strong bg-paper text-ink"
      }`}
    >
      <span className={`h-2 w-2 flex-none rounded-full ${STATUS_DOT[tone]} ${onDark ? "ring-2 ring-white/25" : ""}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Severity scale 0–4 (risk cells, drought tags, cause weight). */
export const SCALE = [
  "bg-scale-0 text-scale-0-ink",
  "bg-scale-1 text-scale-1-ink",
  "bg-scale-2 text-scale-2-ink",
  "bg-scale-3 text-scale-3-ink",
  "bg-scale-4 text-scale-4-ink",
] as const;

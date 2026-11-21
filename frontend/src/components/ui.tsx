import type { ReactNode } from "react";

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
  rain: "M7 16a5 5 0 1 1 1-9.9A6 6 0 0 1 19 9a4 4 0 0 1-1 7.9M9 19l-1 2M13 19l-1 2M17 19l-1 2",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  sand: "M3 20h18M5 16h2M10 16h2M15 16h2M7 12h2M12 12h2M9 8h2",
  slope: "M3 20 21 6M15 6h6v6",
  ditch: "M3 8c3 2 6 2 9 0s6-2 9 0M3 14c3 2 6 2 9 0s6-2 9 0",
  plus: "M12 5v14M5 12h14",
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
      <rect width="34" height="34" rx="9" fill="#1E5B3A" />
      <path d="M17 7c4 5 7 8.6 7 12.2A7 7 0 0 1 10 19.2C10 15.6 13 12 17 7z" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13.5 20.5c.6 1.8 2 2.8 3.8 3" fill="none" stroke="#9ec5f4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[18px] border border-rule bg-paper ${className}`}>{children}</section>;
}

export function StepNumber({ n }: { n: number }) {
  return (
    <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
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
      <rect x="4" y={height - 3 - fillH} width={width - 8} height={fillH} fill="#2a78d6" rx="2" />
      <line x1="0" y1={lineY} x2={width} y2={lineY} stroke="#1A1C19" strokeWidth="2" strokeDasharray="4 3" />
    </svg>
  );
}

export const TONE_PILL: Record<"danger" | "plan" | "ok", string> = {
  danger: "bg-[#c2362f] text-white",
  plan: "bg-[#a35412] text-white",
  ok: "bg-primary text-white",
};

export function StatusPill({ tone, label, small = false }: { tone: "danger" | "plan" | "ok"; label: string; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold ${small ? "px-3 py-1.5 text-[13px]" : "px-3 py-1.5 text-sm"} ${TONE_PILL[tone]}`}
    >
      <Icon d={ICON.warn} size={small ? 14 : 16} stroke={2.4} />
      {label}
    </span>
  );
}

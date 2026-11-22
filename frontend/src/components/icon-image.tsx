import { ImageResponse } from "next/og";

/** PNG app icon (drop on green), used for the PWA manifest and the Apple touch icon. */
export function iconImage(size: number, maskable = false) {
  // Maskable icons must keep the motif inside the central 80% safe zone and fill the square.
  const inner = maskable ? size * 0.62 : size * 0.78;
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: maskable ? "#2F4D3C" : "transparent",
        }}
      >
        <svg width={maskable ? inner : size} height={maskable ? inner : size} viewBox="0 0 34 34">
          {!maskable && <rect width="34" height="34" rx="9" fill="#2F4D3C" />}
          <path d="M17 7c4 5 7 8.6 7 12.2A7 7 0 0 1 10 19.2C10 15.6 13 12 17 7z" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="round" />
          <path d="M13.5 20.5c.6 1.8 2 2.8 3.8 3" fill="none" stroke="#8ec9c4" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}

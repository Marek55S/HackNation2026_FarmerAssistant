"use client";

import { useEffect } from "react";

/** Registers /sw.js in production builds (in dev it would cache stale bundles). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

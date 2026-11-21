"use client";

import { useSyncExternalStore } from "react";
import { ICON, Icon } from "./ui";

// Experimental second look (Climate TRACE-like). The choice is kept only in this browser.
const KEY = "asystent-wodny:wyglad";
type Look = "light" | "trace";

const listeners = new Set<() => void>();
const read = (): Look => (document.documentElement.dataset.theme === "trace" ? "trace" : "light");

function setLook(look: Look) {
  if (look === "trace") document.documentElement.dataset.theme = "trace";
  else delete document.documentElement.dataset.theme;
  // Status bar colour follows the look (mobile-native §10)
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", look === "trace" ? "#0c1113" : "#FBFBF7");
  try {
    localStorage.setItem(KEY, look);
  } catch {
    // storage blocked — the look still applies until reload
  }
  listeners.forEach((l) => l());
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const look = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "light" as Look,
  );
  const next = look === "trace" ? "light" : "trace";
  return (
    <button
      type="button"
      onClick={() => setLook(next)}
      aria-label={look === "trace" ? "Przełącz na jasny wygląd" : "Przełącz na ciemny wygląd"}
      title="Wygląd (test)"
      className={`no-print inline-flex min-h-10 items-center gap-1.5 rounded-[var(--r-btn)] border border-rule-strong px-3 text-xs font-semibold text-ink-2 hover:text-ink ${className}`}
    >
      <Icon d={look === "trace" ? ICON.sun : ICON.moon} size={15} />
      {look === "trace" ? "Jasny" : "Ciemny"}
    </button>
  );
}

/** For print: always print in the light look, then restore. */
export function printLight() {
  const was = read();
  if (was === "trace") delete document.documentElement.dataset.theme;
  const restore = () => {
    if (was === "trace") document.documentElement.dataset.theme = "trace";
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}

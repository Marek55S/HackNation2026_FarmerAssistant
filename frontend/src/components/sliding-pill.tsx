"use client";

// Active "pill" of a segmented control that slides to the chosen option instead of jumping.
// Place <SlidingPill> as the first child of the control (which must be `relative`); the active option is
// found by aria-checked / aria-selected, so the buttons keep their own semantics.

import { useLayoutEffect, useRef, useState } from "react";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function SlidingPill({ active }: { active: string }) {
  // The pill finds its control through its own parent: a parent's ref is not attached yet when a child's
  // layout effect runs on mount.
  const self = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  // The first placement must not animate from the corner.
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const root = self.current?.parentElement;
    if (!root) return;
    const measure = () => {
      const el = root.querySelector<HTMLElement>('[aria-checked="true"], [aria-selected="true"]');
      setBox(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
    };
    measure();
    // Labels wrap and the control reflows with the viewport: follow the option's size.
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [active]);

  useLayoutEffect(() => {
    if (!box || animate) return;
    // After the first placement has been painted (a timer, not rAF: rAF stalls in background tabs).
    const id = setTimeout(() => setAnimate(true), 50);
    return () => clearTimeout(id);
  }, [box, animate]);

  return (
    <span
      ref={self}
      aria-hidden
      className="seg-pill pointer-events-none absolute left-0 top-0 rounded-full bg-tab-active shadow-sm"
      data-animate={animate || undefined}
      style={box ? { width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` } : { visibility: "hidden" }}
    />
  );
}

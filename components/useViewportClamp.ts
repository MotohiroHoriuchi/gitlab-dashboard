"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

const MARGIN = 8;

/** Clamp a `position:fixed` floating box to the viewport using its *measured*
 *  size — no hand-maintained width/height constants that drift from the box's
 *  actual styles. Pass the box's ref plus the desired (unclamped) coordinates
 *  and use the returned left/top instead. Measurement runs in
 *  useLayoutEffect, so the corrected position is applied before paint. */
export function useViewportClamp(
  ref: RefObject<HTMLElement | null>,
  x: number,
  y: number,
): { left: number; top: number } {
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    });
  }, [ref, x, y]);
  return pos;
}

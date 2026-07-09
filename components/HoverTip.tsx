"use client";

import { type CSSProperties, useRef } from "react";
import { MONO, SANS, SH_2, T, rgb, rgba, toneColor, type CalTip } from "@/lib/logic";
import { useViewportClamp } from "@/components/useViewportClamp";

/** Square color swatch — shared by the tooltip title row and the calendar's
 *  day popover rows. */
export const dot = (color: string): CSSProperties => ({
  width: "10px",
  height: "10px",
  borderRadius: "2px",
  background: rgb(color),
  flex: "0 0 auto",
});

/** Cursor-anchored hover tooltip for a CalTip (calendar bars, roadmap lane
 *  bars / ticks / "+N" chips). position:fixed at the raw cursor offset,
 *  clamped to the viewport against the measured box size; pointer-events:none
 *  so it never steals the hover from the element underneath. */
export default function HoverTip({ tip, x, y }: { tip: CalTip; x: number; y: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const { left, top } = useViewportClamp(boxRef, x, y);
  const box: CSSProperties = {
    position: "fixed",
    left,
    top,
    zIndex: 60,
    pointerEvents: "none",
    minWidth: "180px",
    maxWidth: "280px",
    background: rgb(T.canvasSoft),
    border: "1px solid " + rgb(T.hairline),
    borderRadius: "8px",
    boxShadow: SH_2,
    padding: "9px 11px",
    fontFamily: SANS,
  };
  return (
    <div ref={boxRef} style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "6px" }}>
        <span style={dot(tip.color)} />
        <span
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            fontSize: "13.5px",
            fontWeight: 700,
            color: rgb(T.ink),
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {tip.title}
        </span>
      </div>
      {tip.labelName && (
        <span
          style={{
            display: "inline-block",
            marginBottom: "6px",
            padding: "2px 8px",
            borderRadius: "999px",
            fontSize: "10.5px",
            fontWeight: 600,
            fontFamily: MONO,
            background: rgba(tip.color, 0.15),
            color: rgb(T.ink),
            border: "1px solid " + rgba(tip.color, 0.45),
          }}
        >
          {tip.labelName}
        </span>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px" }}>
        {tip.rows.map((r, i) => (
          <div key={i} style={{ display: "contents" }}>
            <span style={{ fontSize: "11.5px", color: rgb(T.muted) }}>{r.k}</span>
            <span style={{ fontSize: "12.5px", fontWeight: r.tone ? 600 : 400, color: rgb(toneColor(r.tone ?? "neutral")) }}>
              {r.v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

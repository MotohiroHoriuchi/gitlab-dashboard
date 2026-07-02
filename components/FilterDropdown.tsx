"use client";

import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MONO, SANS, T, rgb, rgba, type FilterOption } from "@/lib/logic";

/** Compact, searchable multi-select filter. Scales to many labels/assignees
 *  without widening the filter bar (the trigger stays one button). */
export default function FilterDropdown({
  title,
  options,
  selectedCount,
  onClear,
}: {
  title: string;
  options: FilterOption[];
  selectedCount: number;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [flip, setFlip] = useState({ right: false, up: false });
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  const active = selectedCount > 0;

  // Flip away from viewport edges. Decided from the trigger's rect + the
  // popup's measured size (size is side-independent, so a stale flip from a
  // previous open can't skew the measurement). Re-runs as the filtered list
  // resizes the popup. useLayoutEffect: corrected before paint.
  useLayoutEffect(() => {
    if (!open) return;
    const wrap = ref.current;
    const pop = popRef.current;
    if (!wrap || !pop) return;
    const anchor = wrap.getBoundingClientRect();
    const { width, height } = pop.getBoundingClientRect();
    setFlip({
      right: anchor.left + width > window.innerWidth - 8,
      up: anchor.bottom + 6 + height > window.innerHeight - 8,
    });
  }, [open, shown.length, active]);

  const trigger: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    padding: "7px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "12.5px",
    fontWeight: 600,
    fontFamily: SANS,
    transition: "all .15s",
    border: "1px solid " + (active || open ? rgba(T.primary, 0.5) : rgb(T.hairline)),
    background: active ? rgba(T.primary, 0.14) : rgb(T.canvasSoft),
    color: active ? rgb(T.primary) : rgb(T.body),
  };
  const badge: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "16px",
    height: "16px",
    padding: "0 4px",
    borderRadius: "8px",
    background: rgb(T.primary),
    color: rgb(T.canvas),
    fontSize: "10px",
    fontWeight: 700,
    fontFamily: MONO,
  };
  const pop: CSSProperties = {
    position: "absolute",
    ...(flip.up ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 6px)" }),
    ...(flip.right ? { right: 0 } : { left: 0 }),
    zIndex: 50,
    width: "268px",
    background: rgb(T.canvasSoft),
    border: "1px solid " + rgb(T.hairline),
    borderRadius: "10px",
    boxShadow: "0 10px 30px rgba(0,0,0,.55)",
    padding: "8px",
    boxSizing: "border-box",
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button type="button" style={trigger} onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        {active && <span style={badge}>{selectedCount}</span>}
        <span style={{ fontSize: "10px", opacity: 0.8 }}>▾</span>
      </button>

      {open && (
        <div ref={popRef} style={pop}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`${title}を検索…`}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "6px 8px",
              marginBottom: "6px",
              borderRadius: "6px",
              border: "1px solid " + rgb(T.hairline),
              background: rgb(T.canvas),
              color: rgb(T.ink),
              fontSize: "12px",
              fontFamily: SANS,
              outline: "none",
            }}
          />
          <div style={{ maxHeight: "244px", overflowY: "auto" }}>
            {shown.length === 0 && (
              <div style={{ padding: "10px", fontSize: "12px", color: rgb(T.mutedSoft), textAlign: "center" }}>
                該当なし
              </div>
            )}
            {shown.map((o, i) => (
              <button
                type="button"
                key={i}
                onClick={o.onToggle}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  border: "none",
                  background: o.active ? rgba(T.primary, 0.12) : "transparent",
                  color: rgb(T.body),
                  fontSize: "12.5px",
                  fontFamily: SANS,
                }}
              >
                <span
                  style={{
                    width: "15px",
                    height: "15px",
                    borderRadius: "4px",
                    flex: "0 0 auto",
                    boxSizing: "border-box",
                    border: "1px solid " + (o.active ? rgba(T.primary, 0.85) : rgb(T.hairline)),
                    background: o.active ? rgb(T.primary) : "transparent",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: rgb(T.canvas),
                    fontSize: "10px",
                    fontWeight: 800,
                  }}
                >
                  {o.active ? "✓" : ""}
                </span>
                {o.color && (
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: rgb(o.color),
                      flex: "0 0 auto",
                    }}
                  ></span>
                )}
                <span style={{ flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.name}
                </span>
                <span style={{ flex: "0 0 auto", color: rgb(T.mutedSoft), fontFamily: MONO, fontSize: "11px" }}>
                  {o.count}
                </span>
              </button>
            ))}
          </div>
          {active && (
            <button
              type="button"
              onClick={onClear}
              style={{
                width: "100%",
                marginTop: "6px",
                padding: "6px",
                borderRadius: "6px",
                border: "1px solid " + rgb(T.hairline),
                background: "transparent",
                color: rgb(T.mutedSoft),
                cursor: "pointer",
                fontSize: "11.5px",
                fontWeight: 600,
                fontFamily: SANS,
              }}
            >
              選択をクリア（{selectedCount}）
            </button>
          )}
        </div>
      )}
    </div>
  );
}

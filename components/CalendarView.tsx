"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  MONO,
  SANS,
  S,
  T,
  rgb,
  rgba,
  toneColor,
  type CalDayItem,
  type CalSegment,
  type CalTip,
  type CalVals,
} from "@/lib/logic";
import { useViewportClamp } from "@/components/useViewportClamp";

type HoverState = { tip: CalTip; x: number; y: number } | null;
type DayState = { dayLabel: string; items: CalDayItem[]; x: number; y: number } | null;

/** Renderer for the calendar/timeline view model (buildCalendar). Layout lives
 *  in lib/logic.ts; this binds it to markup and owns only the client-side
 *  overlay interactions (hover tooltip + day-overflow popover). */
export default function CalendarView({ cal }: { cal: CalVals }) {
  const [hover, setHover] = useState<HoverState>(null);
  const [day, setDay] = useState<DayState>(null);
  const [sparkle, setSparkle] = useState(0); // bump to replay the checkpoint-star shine
  const dayRef = useRef<HTMLDivElement>(null);

  // close the day popover on outside click / Escape (mirrors FilterDropdown)
  useEffect(() => {
    if (!day) return;
    const onDown = (e: MouseEvent) => {
      if (dayRef.current && !dayRef.current.contains(e.target as Node)) setDay(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDay(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [day]);

  // position/z-index lift the text above the overrun hatch / duetick overlays,
  // which are later siblings on the same grid cell (they must cover the bar's
  // background but not its text).
  const labelStyle = S(
    "overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; position:relative; z-index:1;",
  );
  const weekdayCell = S(
    "padding:2px 6px 5px; font-size:10px; font-weight:600; letter-spacing:.04em; color:rgb(110 118 129);",
  );
  // Re-keying an element with `sparkle` remounts it, replaying these one-shot
  // anims: checkpoints shine (star + gold ring), everything else dims briefly.
  const sparkleAnim: CSSProperties = sparkle ? { animation: "gi-sparkle 3s ease-in-out" } : {};
  const cpGlow: CSSProperties = sparkle ? { animation: "gi-checkpoint-glow 3s ease-in-out" } : {};
  const dimAnim: CSSProperties = sparkle ? { animation: "gi-dim 3s ease-in-out" } : {};
  const starWrap: CSSProperties = { color: rgb("255 199 74"), fontSize: "12px", ...sparkleAnim };
  const segKey = (k: string) => (sparkle ? `${k}-${sparkle}` : k);

  // Raw cursor-offset coordinates only — viewport clamping happens inside the
  // overlay components via useViewportClamp, against their measured size.
  const showTip = (e: React.MouseEvent, tip: CalTip) => {
    setHover({ tip, x: e.clientX + 14, y: e.clientY + 14 });
  };
  const openDay = (e: React.MouseEvent, s: CalSegment) => {
    e.stopPropagation();
    setDay({ dayLabel: s.dayLabel ?? "", items: s.items ?? [], x: e.clientX + 10, y: e.clientY + 10 });
  };

  return (
    <section
      style={S(
        "background:rgb(26 26 26); border:1px solid rgb(61 58 57); border-radius:14px; padding:18px 20px 20px; min-width:0;",
      )}
    >
      {/* ── header: title + mode toggle + nav ── */}
      <div
        style={S(
          "display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:12px;",
        )}
      >
        <h2 style={S("margin:0; font-size:16px; font-weight:700; color:rgb(242 242 242);")}>
          {cal.title}
        </h2>
        <div style={S("display:flex; align-items:center; gap:10px; flex-wrap:wrap;")}>
          <div style={S("display:flex; gap:6px;")}>
            <button style={cal.modeBtns.month.style} onClick={cal.modeBtns.month.onClick}>
              月
            </button>
            <button style={cal.modeBtns.twoweek.style} onClick={cal.modeBtns.twoweek.onClick}>
              2週
            </button>
          </div>
          <div style={S("display:flex; gap:6px;")}>
            <button style={cal.navPrev.style} onClick={cal.navPrev.onClick} aria-label="前へ">
              ‹
            </button>
            <button style={cal.navToday.style} onClick={cal.navToday.onClick}>
              今日
            </button>
            <button style={cal.navNext.style} onClick={cal.navNext.onClick} aria-label="次へ">
              ›
            </button>
          </div>
        </div>
      </div>

      {/* ── legend ── */}
      <div
        style={S(
          "display:flex; flex-wrap:wrap; align-items:center; gap:6px 16px; margin-bottom:10px; font-size:11px; color:rgb(139 148 158);",
        )}
      >
        <Swatch style={{ background: rgba("176 131 240", 0.2), border: "1px solid " + rgba("176 131 240", 0.6) }} text="マイルストーン" />
        <Swatch
          style={{
            background:
              "repeating-linear-gradient(45deg," +
              rgba(T.primary, 0.5) +
              " 0 4px," +
              rgba(T.primary, 0.16) +
              " 4px 8px)",
            border: "1px solid " + rgba(T.primary, 0.75),
          }}
          text="進行中イシュー"
        />
        <Swatch style={{ background: rgba(T.primary, 0.9), border: "1px solid " + rgb(T.primary) }} text="完了イシュー" />
        <button
          type="button"
          onClick={() => setSparkle((n) => n + 1)}
          title="クリックでチェックポイントの星を輝かせる"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: rgb(T.muted),
            fontSize: "11px",
            fontFamily: SANS,
          }}
        >
          <span style={starWrap} key={sparkle ? `legend-star-${sparkle}` : "legend-star"}>
            ★
          </span>
          チェックポイント（{cal.legend.checkpointLabel}）
        </button>
      </div>

      {/* ── weekday header ── */}
      <div style={cal.weekdayRowStyle}>
        {cal.weekdayLabels.map((w, i) => (
          <div key={i} style={weekdayCell}>
            {w}
          </div>
        ))}
      </div>

      {/* ── weeks ── */}
      {cal.weeks.map((week) => (
        <div key={week.key}>
          <div style={week.headStyle}>
            {week.days.map((d) => (
              <div key={d.key} style={d.headStyle}>
                <span style={d.numStyle}>{d.dayNum}</span>
              </div>
            ))}
          </div>
          <div style={week.gridStyle}>
            {week.todayStripStyle && <div style={week.todayStripStyle} />}
            {week.segments.map((s) =>
              s.kind === "overflow" ? (
                <div
                  key={segKey(s.key)}
                  style={{ ...s.style, ...dimAnim }}
                  onClick={(e) => openDay(e, s)}
                  title="この日の予定をすべて表示"
                >
                  {s.overflowLabel} ▾
                </div>
              ) : s.kind === "overrun" || s.kind === "duetick" ? (
                // schedule-overrun hatch / plan tick — non-interactive overlay
                <div key={segKey(s.key)} style={{ ...s.style, ...dimAnim }} />
              ) : (
                <div
                  key={segKey(s.key)}
                  style={{ ...s.style, ...(s.isCheckpoint ? cpGlow : dimAnim) }}
                  onMouseEnter={(e) => s.tip && showTip(e, s.tip)}
                  onMouseMove={(e) => s.tip && showTip(e, s.tip)}
                  onMouseLeave={() => setHover(null)}
                >
                  {s.showLabel && <span style={labelStyle}>{s.label}</span>}
                  {s.starStyle && (
                    <span key={`${s.key}-star-${sparkle}`} style={{ ...s.starStyle, ...sparkleAnim }}>
                      ★
                    </span>
                  )}
                </div>
              ),
            )}
          </div>
        </div>
      ))}

      {cal.empty && (
        <div style={S("padding:32px 0; text-align:center; font-size:13px; color:rgb(110 118 129);")}>
          この期間に表示できる予定がありません。マイルストーン／期限を設定するか、期間を移動してください。
        </div>
      )}

      {hover && <BarTooltip hover={hover} />}
      {day && <DayPopover day={day} innerRef={dayRef} onClose={() => setDay(null)} />}
    </section>
  );
}

/* ── hover tooltip for a single bar ── */
function BarTooltip({ hover }: { hover: NonNullable<HoverState> }) {
  const { tip, x, y } = hover;
  const boxRef = useRef<HTMLDivElement>(null);
  const { left, top } = useViewportClamp(boxRef, x, y);
  const box: CSSProperties = {
    position: "fixed",
    left,
    top,
    zIndex: 60,
    pointerEvents: "none",
    minWidth: "160px",
    maxWidth: "240px",
    background: rgb(T.canvasSoft),
    border: "1px solid " + rgb(T.hairline),
    borderRadius: "8px",
    boxShadow: "0 10px 30px rgba(0,0,0,.55)",
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
            fontSize: "12px",
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
            padding: "1px 7px",
            borderRadius: "999px",
            fontSize: "10px",
            fontWeight: 600,
            fontFamily: MONO,
            background: rgba(tip.color, 0.16),
            color: rgb(tip.color),
            border: "1px solid " + rgba(tip.color, 0.32),
          }}
        >
          {tip.labelName}
        </span>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px" }}>
        {tip.rows.map((r, i) => (
          <div key={i} style={{ display: "contents" }}>
            <span style={{ fontSize: "10.5px", color: rgb(T.mutedSoft) }}>{r.k}</span>
            <span style={{ fontSize: "11px", fontWeight: r.tone ? 600 : 400, color: rgb(toneColor(r.tone ?? "neutral")) }}>
              {r.v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── day-overflow popover: every item covering a given day ── */
function DayPopover({
  day,
  innerRef,
  onClose,
}: {
  day: NonNullable<DayState>;
  innerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const { left, top } = useViewportClamp(innerRef, day.x, day.y);
  const box: CSSProperties = {
    position: "fixed",
    left,
    top,
    zIndex: 70,
    width: "300px",
    maxHeight: "340px",
    overflowY: "auto",
    background: rgb(T.canvasSoft),
    border: "1px solid " + rgb(T.hairline),
    borderRadius: "10px",
    boxShadow: "0 14px 36px rgba(0,0,0,.6)",
    padding: "10px 12px 12px",
    fontFamily: SANS,
  };
  return (
    <div ref={innerRef} style={box}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "12.5px", fontWeight: 700, color: rgb(T.ink) }}>{day.dayLabel}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          style={{
            border: "none",
            background: "transparent",
            color: rgb(T.mutedSoft),
            cursor: "pointer",
            fontSize: "14px",
            lineHeight: 1,
            padding: "2px 4px",
          }}
        >
          ×
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
        {day.items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <span style={{ ...dot(it.color), marginTop: "4px" }} />
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span
                  style={{
                    minWidth: 0,
                    fontSize: "12px",
                    fontWeight: 600,
                    color: rgb(T.body),
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {it.track === "issue" ? `#${it.id} ${it.title}` : it.title}
                </span>
                {it.isCheckpoint && <span style={{ color: rgb("255 199 74"), fontSize: "11px" }}>★</span>}
              </div>
              <div style={{ marginTop: "2px", fontSize: "10.5px", color: rgb(T.mutedSoft) }}>
                <span style={{ color: rgb(statusColor(it.status)), fontWeight: 600 }}>{it.statusLabel}</span>
                {metaRest(it) && <span> · {metaRest(it)}</span>}
                {it.varianceLabel && (
                  <span style={{ color: rgb(toneColor(it.varianceTone)), fontWeight: 600 }}>
                    {" · "}
                    {it.varianceLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const dot = (color: string): CSSProperties => ({
  width: "9px",
  height: "9px",
  borderRadius: "2px",
  background: rgb(color),
  flex: "0 0 auto",
});

function statusColor(status: CalDayItem["status"]): string {
  return status === "open" ? T.primary : status === "closed" ? T.muted : "176 131 240";
}

/** "担当者 · 期間 · ラベル" — the non-status part of an item's meta line. */
function metaRest(it: CalDayItem): string {
  const parts = [it.track === "issue" ? it.assignee : "", it.rangeLabel, it.track === "issue" ? it.labelName : ""];
  return parts.filter(Boolean).join(" · ");
}

function Swatch({ style, text }: { style: React.CSSProperties; text: string }) {
  return (
    <span style={S("display:inline-flex; align-items:center; gap:5px;")}>
      <span style={{ width: "18px", height: "11px", borderRadius: "3px", ...style }} />
      {text}
    </span>
  );
}

"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  MONO,
  SANS,
  S,
  T,
  calBarKey,
  chipSelectionRole,
  relBadgeStyle,
  relBadgeText,
  rgb,
  rgba,
  selectionOverlay,
  selectionRole,
  toneColor,
  type CalDayItem,
  type CalRelIndex,
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
  // click-focus: "track:id" of the selected bar (highlights its relations,
  // dims the rest). A plain key string, so it survives the 60s polling
  // re-render — the view model is rebuilt but the selection stays.
  const [selected, setSelected] = useState<string | null>(null);
  const [sparkle, setSparkle] = useState(0); // bump to replay the checkpoint-star shine

  // One-shot: drop back to 0 once the 3s animations finish. While sparkle is
  // set, every bar carries an `animation:` style, so any later remount
  // (month/2-week switch, prev/next nav) would replay the whole show.
  useEffect(() => {
    if (!sparkle) return;
    const t = setTimeout(() => setSparkle(0), 3200);
    return () => clearTimeout(t);
  }, [sparkle]);
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

  // clear the click-focus selection on outside click / Escape. Mousedown on a
  // bar is ignored (its own onClick toggles, else re-clicking the selected bar
  // would clear-then-reselect), as is the popover (rows focus via onClick).
  // While the popover is open, Escape closes it first (listener above); the
  // next Escape clears the selection.
  useEffect(() => {
    if (!selected) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.("[data-calbar]")) return;
      if (dayRef.current?.contains(t)) return;
      setSelected(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !day) setSelected(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [selected, day]);

  const toggleSelect = (key: string) => setSelected((p) => (p === key ? null : key));

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
        {/* non-working-day toggles: click a weekday chip to hide/show its column */}
        <span style={S("margin-left:auto; display:inline-flex; align-items:center; gap:4px;")}>
          <span style={S("font-size:10.5px; color:rgb(110 118 129);")}>表示曜日</span>
          {cal.dowToggles.map((t) => (
            <button
              type="button"
              key={t.label}
              style={t.style}
              onClick={t.onClick}
              disabled={t.disabled}
              aria-pressed={t.active}
              title={t.active ? "クリックで非表示" : "クリックで表示"}
            >
              {t.label}
            </button>
          ))}
        </span>
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
            {week.segments.map((s) => {
              if (s.kind === "overflow") {
                // rings when a hidden item relates to the selection (the chip
                // is its only visible stand-in), dims when none does.
                // data-calbar keeps opening it from clearing the selection.
                const chipRole = chipSelectionRole(selected, cal.relations, s.items ?? []);
                return (
                  <div
                    key={segKey(s.key)}
                    data-calbar
                    style={{ ...s.style, ...dimAnim, ...selectionOverlay(chipRole) }}
                    onClick={(e) => openDay(e, s)}
                    title="この日の予定をすべて表示"
                  >
                    {s.overflowLabel} ▾
                  </div>
                );
              }
              const role = selectionRole(selected, cal.relations, s.track, s.id);
              if (s.kind === "overrun" || s.kind === "duetick") {
                // schedule-overrun hatch / plan tick — non-interactive overlay;
                // dims with its bar but never carries the focus ring itself.
                return (
                  <div
                    key={segKey(s.key)}
                    style={{
                      ...s.style,
                      ...dimAnim,
                      ...(role === "dim" ? selectionOverlay("dim") : {}),
                    }}
                  />
                );
              }
              const badge = relBadgeText(role);
              return (
                <div
                  key={segKey(s.key)}
                  data-calbar
                  role="button"
                  tabIndex={0}
                  aria-pressed={role === "self"}
                  style={{
                    ...s.style,
                    ...(s.isCheckpoint ? cpGlow : dimAnim),
                    ...selectionOverlay(role, s.style.boxShadow as string | undefined),
                  }}
                  onClick={() => toggleSelect(calBarKey(s.track, s.id))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSelect(calBarKey(s.track, s.id));
                    }
                  }}
                  onMouseEnter={(e) => s.tip && showTip(e, s.tip)}
                  onMouseMove={(e) => s.tip && showTip(e, s.tip)}
                  onMouseLeave={() => setHover(null)}
                >
                  {s.showLabel && badge && <span style={relBadgeStyle}>{badge}</span>}
                  {s.showLabel && <span style={labelStyle}>{s.label}</span>}
                  {s.starStyle && (
                    <span key={`${s.key}-star-${sparkle}`} style={{ ...s.starStyle, ...sparkleAnim }}>
                      ★
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {cal.empty && (
        <div style={S("padding:32px 0; text-align:center; font-size:13px; color:rgb(110 118 129);")}>
          この期間に表示できる予定がありません。マイルストーン／期限を設定するか、期間を移動してください。
        </div>
      )}

      {hover && <BarTooltip hover={hover} />}
      {day && (
        <DayPopover
          day={day}
          innerRef={dayRef}
          onClose={() => setDay(null)}
          selected={selected}
          relations={cal.relations}
          onFocus={(key) => {
            setSelected(key);
            setDay(null);
          }}
        />
      )}
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
  selected,
  relations,
  onFocus,
}: {
  day: NonNullable<DayState>;
  innerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  selected: string | null;
  relations: CalRelIndex;
  onFocus: (key: string) => void;
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
        {day.items.map((it, i) => {
          const role = selectionRole(selected, relations, it.track, it.id);
          const badge = relBadgeText(role);
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              title="クリックでカレンダー上の関係を強調"
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
                cursor: "pointer",
                opacity: role === "dim" ? 0.45 : 1,
              }}
              onClick={() => onFocus(calBarKey(it.track, it.id))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onFocus(calBarKey(it.track, it.id));
                }
              }}
            >
              <span style={{ ...dot(it.color), marginTop: "4px" }} />
              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  {(badge || role === "self") && (
                    <span style={relBadgeStyle}>{badge ?? "選択中"}</span>
                  )}
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
                {it.relLine && (
                  <div style={{ marginTop: "1px", fontSize: "10px", color: rgb(T.mutedSoft) }}>
                    {it.relLine}
                  </div>
                )}
              </div>
            </div>
          );
        })}
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

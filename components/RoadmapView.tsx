"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  CHECKPOINT_STAR,
  MILESTONE_COLOR,
  MONO,
  SANS,
  SH_2,
  S,
  T,
  rgb,
  rgba,
  seg,
  toneColor,
  type CalTip,
  type RoadmapIssueRef,
  type RoadmapRow,
  type RoadmapVals,
} from "@/lib/logic";
import { useViewportClamp } from "@/components/useViewportClamp";
import HoverTip from "@/components/HoverTip";
// viewBox dims — must match SPARK_*/CHART_* in lib/logic.ts
const SPARK_W = 120,
  SPARK_H = 32;
const CHART_W = 680,
  CHART_H = 200;

type ChipState = { refs: RoadmapIssueRef[]; x: number; y: number } | null;

/** Renderer for the roadmap/milestone-progress view model (buildMilestoneCalendar).
 *  One lane per milestone on a continuous date axis; progress + burndown in the
 *  left column; clicking a row expands a large burndown + remaining-work list. */
export default function RoadmapView({
  roadmap,
  fullscreen,
  onToggleFull,
  onExitFull,
}: {
  roadmap: RoadmapVals;
  fullscreen?: boolean;
  onToggleFull?: () => void;
  onExitFull?: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [chip, setChip] = useState<ChipState>(null);
  const [hover, setHover] = useState<{ tip: CalTip; x: number; y: number } | null>(null);
  const chipRef = useRef<HTMLDivElement>(null);

  // Raw cursor offsets only — HoverTip clamps to the viewport itself (mirrors
  // CalendarView's showTip). Suppressed while the "+N" popover is open so the
  // tooltip never lingers behind it.
  const showTip = (e: React.MouseEvent, tip: CalTip) => {
    if (chip) return;
    setHover({ tip, x: e.clientX + 14, y: e.clientY + 14 });
  };
  const hideTip = () => setHover(null);

  // outside-click / Escape closes the "+N" popover first, then the expansion
  // (mirrors CalendarView's overlay handling).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (chip && chipRef.current && !chipRef.current.contains(t) && !t.closest?.("[data-rm-chip]"))
        setChip(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (chip) setChip(null);
      else if (expanded) setExpanded(null);
      else onExitFull?.(); // bottom layer: leave fullscreen mode
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [chip, expanded, onExitFull]);

  const COL = "268px minmax(0,1fr)"; // left KPI column + date-axis track

  return (
    <section
      style={S(
        `background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:16px; padding:18px 20px 20px; min-width:0;`,
      )}
    >
      {/* header */}
      <div style={S("display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:4px;")}>
        <h2 style={S(`margin:0; font-size:16px; font-weight:700; color:${rgb(T.ink)};`)}>マイルストーンの進み具合</h2>
        <div style={S("display:flex; align-items:center; gap:10px;")}>
          <span style={S(`font-size:12.5px; color:${rgb(T.muted)}; font-family:'JetBrains Mono',ui-monospace,monospace;`)}>{roadmap.spanLabel}</span>
          {onToggleFull && (
            <button
              style={seg(!!fullscreen)}
              onClick={onToggleFull}
              aria-pressed={!!fullscreen}
              title={fullscreen ? "全画面を解除（Esc）" : "ツールバーとロードマップだけを全画面表示"}
            >
              {fullscreen ? "✕ 全画面解除" : "⛶ 全画面"}
            </button>
          )}
        </div>
      </div>
      <p style={S(`margin:0 0 12px; font-size:12.5px; color:${rgb(T.muted)}; line-height:1.5;`)}>
        バーは start→due（縦線が本日、濃い部分が経過）。tick は<b style={{ color: rgb(T.ink) }}>未完</b>イシューの締切（
        <span style={{ color: rgb(T.err) }}>■</span>超過 ·
        <span style={{ color: rgb(CHECKPOINT_STAR) }}> ★</span>チェックポイント）。左のスパークは残数（実線）と理想線（破線）。行クリックで詳細。
      </p>

      {/* month header aligned to the track column */}
      <div style={{ display: "grid", gridTemplateColumns: COL, gap: "0 14px", alignItems: "end", marginBottom: "2px" }}>
        <div />
        <div style={{ position: "relative", height: "18px" }}>
          {roadmap.gridLines.map((g, i) => (
            <span key={i} style={monthLabelStyle(g.x)}>{g.label}</span>
          ))}
          {roadmap.todayX !== null && <span style={todayLabelStyle(roadmap.todayX)}>本日</span>}
        </div>
      </div>

      {roadmap.empty ? (
        <div style={S(`padding:32px 0; text-align:center; font-size:13px; color:${rgb(T.mutedSoft)};`)}>
          表示できるマイルストーンがありません。マイルストーンに開始日／期限を設定してください。
        </div>
      ) : (
        roadmap.rows.map((row) => (
          <div key={row.key}>
            <div
              onClick={() => setExpanded((p) => (p === row.key ? null : row.key))}
              style={{
                display: "grid",
                gridTemplateColumns: COL,
                gap: "0 14px",
                alignItems: "center",
                padding: "10px 0",
                borderBottom: "1px solid " + rgb(T.hairline),
                cursor: "pointer",
                background: expanded === row.key ? rgba(MILESTONE_COLOR, 0.06) : "transparent",
                transition: "background .15s",
              }}
            >
              <KpiColumn row={row} onTip={showTip} onTipEnd={hideTip} />
              <Track
                row={row}
                todayX={roadmap.todayX}
                weekStepPct={roadmap.weekStepPct}
                gridLines={roadmap.gridLines}
                onChip={(c) => {
                  setChip(c);
                  hideTip();
                }}
                onTip={showTip}
                onTipEnd={hideTip}
              />
            </div>
            {expanded === row.key && <Expanded row={row} />}
          </div>
        ))
      )}

      {hover && <HoverTip tip={hover.tip} x={hover.x} y={hover.y} />}
      {chip && <ChipPopover chip={chip} innerRef={chipRef} onClose={() => setChip(null)} />}
    </section>
  );
}

/* ── left column: title + health + progress + KPIs + mini burndown ── */
function KpiColumn({
  row,
  onTip,
  onTipEnd,
}: {
  row: RoadmapRow;
  onTip: (e: React.MouseEvent, tip: CalTip) => void;
  onTipEnd: () => void;
}) {
  const tone = toneColor(row.healthTone);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: rgb(tone), flex: "0 0 auto" }} />
        <span
          style={{ minWidth: 0, fontSize: "15px", fontWeight: 700, color: rgb(T.ink), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          onMouseEnter={(e) => onTip(e, row.tip)}
          onMouseMove={(e) => onTip(e, row.tip)}
          onMouseLeave={onTipEnd}
        >
          {row.title}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "5px" }}>
        <div style={{ position: "relative", flex: "1 1 auto", height: "6px", borderRadius: "3px", background: rgba(T.hairline, 0.8), overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: row.pct + "%", background: rgb(tone), borderRadius: "3px" }} />
        </div>
        <span style={{ fontSize: "13.5px", fontWeight: 700, color: rgb(tone), fontFamily: MONO, flex: "0 0 auto" }}>{row.pct}%</span>
      </div>
      <div style={{ marginTop: "4px", fontSize: "12.5px", color: rgb(T.muted), fontFamily: MONO }}>
        {row.hasSchedule || row.total > 0 ? `完了 ${row.done}/${row.total}` : "日程未設定"}
        {row.remaining > 0 && ` · 残${row.remaining}`}
        {row.overdue > 0 && <span style={{ color: rgb(T.warn), fontWeight: 700 }}> · 超過{row.overdue}</span>}
        {row.remainLabel !== "—" && (
          <span style={{ color: row.remainLabel.startsWith("超過") ? rgb(T.err) : rgb(T.muted) }}> · {row.remainLabel}</span>
        )}
      </div>
      {row.spark.hasData && (
        <svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} style={{ marginTop: "5px", display: "block" }}>
          <polyline points={row.spark.ideal} fill="none" stroke={rgba(T.mutedSoft, 0.7)} strokeWidth="1" strokeDasharray="3 2" />
          <polyline points={row.spark.actual} fill="none" stroke={rgb(toneColor(row.healthTone))} strokeWidth="1.5" />
        </svg>
      )}
    </div>
  );
}

/* ── date-axis track: gridlines, today, bar (today-split), due marker, ticks ── */
function Track({
  row,
  todayX,
  weekStepPct,
  gridLines,
  onChip,
  onTip,
  onTipEnd,
}: {
  row: RoadmapRow;
  todayX: number | null;
  weekStepPct: number;
  gridLines: RoadmapVals["gridLines"];
  onChip: (c: ChipState) => void;
  onTip: (e: React.MouseEvent, tip: CalTip) => void;
  onTipEnd: () => void;
}) {
  const trackStyle: CSSProperties = {
    position: "relative",
    height: "56px",
    borderRadius: "6px",
    overflow: "hidden", // clamp any child that rounds past the edge
    backgroundImage: `repeating-linear-gradient(90deg, ${rgba(T.ink, 0.05)} 0 1px, transparent 1px ${weekStepPct}%)`,
  };
  return (
    <div style={trackStyle}>
      {gridLines.map((g, i) => (
        <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: g.x + "%", width: "1px", background: rgba(T.ink, 0.12) }} />
      ))}
      {todayX !== null && <div style={{ position: "absolute", top: 0, bottom: 0, left: todayX + "%", width: "2px", background: rgba(T.primary, 0.9), zIndex: 2 }} />}

      {row.bar && (
        <div
          style={{
            position: "absolute",
            top: "7px",
            height: "22px",
            left: row.bar.left + "%",
            width: row.bar.width + "%",
            borderRadius: "5px",
            border: "1px solid " + rgba(MILESTONE_COLOR, 0.6),
            background: `linear-gradient(90deg, ${rgba(MILESTONE_COLOR, 0.5)} 0 ${row.bar.elapsedPct}%, ${rgba(MILESTONE_COLOR, 0.14)} ${row.bar.elapsedPct}% 100%)`,
          }}
          onMouseEnter={(e) => onTip(e, row.tip)}
          onMouseMove={(e) => onTip(e, row.tip)}
          onMouseLeave={onTipEnd}
        />
      )}
      {row.dueX !== null && (
        <div
          style={{ position: "absolute", top: "4px", height: "28px", left: row.dueX + "%", width: "0", borderLeft: "2px dotted " + rgba(T.ink, 0.7) }}
          onMouseEnter={(e) => onTip(e, row.tip)}
          onMouseMove={(e) => onTip(e, row.tip)}
          onMouseLeave={onTipEnd}
        />
      )}

      {/* unfinished ticks (individually labeled) */}
      {row.ticks.map((t) => (
        <div
          key={t.id}
          style={{ position: "absolute", left: t.x + "%", bottom: "3px", zIndex: 1 }}
          onMouseEnter={(e) => onTip(e, t.tip)}
          onMouseMove={(e) => onTip(e, t.tip)}
          onMouseLeave={onTipEnd}
        >
          <div style={tickLabelStyle(t.x)}>
            {t.isCheckpoint && <span style={{ color: rgb(CHECKPOINT_STAR) }}>★</span>} #{t.id}
          </div>
          <div style={{ position: "absolute", left: 0, bottom: "-2px", transform: "translateX(-50%)", width: t.isCheckpoint ? "0" : "2px", height: "10px", background: t.isCheckpoint ? "transparent" : rgb(t.color) }}>
            {t.isCheckpoint && <span style={{ position: "absolute", left: "-4px", bottom: 0, fontSize: "11px", color: rgb(CHECKPOINT_STAR) }}>★</span>}
          </div>
        </div>
      ))}

      {/* collapsed bulk of safe-future open issues */}
      {row.moreChip && (
        <div
          data-rm-chip
          onClick={(e) => {
            e.stopPropagation();
            onChip({ refs: row.moreChip!.refs, x: e.clientX + 10, y: e.clientY + 10 });
          }}
          style={{ ...moreChipStyle(row.moreChip.x), zIndex: 3 }}
          onMouseEnter={(e) => onTip(e, row.moreChip!.tip)}
          onMouseMove={(e) => onTip(e, row.moreChip!.tip)}
          onMouseLeave={onTipEnd}
        >
          {row.moreChip.label}
        </div>
      )}
    </div>
  );
}

/* ── inline expansion: large burndown + remaining-work buckets ── */
function Expanded({ row }: { row: RoadmapRow }) {
  const b = row.burndown;
  const tone = toneColor(row.healthTone);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "18px", padding: "14px 4px 18px", borderBottom: "1px solid " + rgb(T.hairline) }}>
      <div style={{ flex: "1 1 380px", minWidth: 0 }}>
        <div style={{ fontSize: "13.5px", fontWeight: 700, color: rgb(T.body), marginBottom: "6px" }}>
          バーンダウン
          <span style={{ marginLeft: "10px", fontWeight: 400, color: rgb(T.muted), fontSize: "12.5px" }}>
            <span style={{ color: rgb(tone) }}>実線</span>=残数 · <span style={{ color: rgb(T.muted) }}>破線</span>=理想 · <span style={{ color: rgba(MILESTONE_COLOR, 0.9) }}>薄線</span>=総スコープ
          </span>
        </div>
        {b.hasData ? (
          <svg width="100%" viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="xMidYMid meet" style={{ maxWidth: "100%", display: "block" }}>
            {b.yLabels.map((yl, i) => (
              <g key={i}>
                <line x1="34" y1={yl.y} x2={CHART_W - 12} y2={yl.y} stroke={rgb(T.hairline)} strokeWidth="1" />
                <text x="30" y={yl.y + 4} textAnchor="end" fontSize="12" fill={rgb(T.muted)} fontFamily={MONO}>{yl.label}</text>
              </g>
            ))}
            {b.xLabels.map((xl, i) => (
              <text key={i} x={xl.x} y={CHART_H - 6} textAnchor={i === 0 ? "start" : i === b.xLabels.length - 1 ? "end" : "middle"} fontSize="12" fill={rgb(T.muted)} fontFamily={MONO}>{xl.label}</text>
            ))}
            <polyline points={b.scopePoints} fill="none" stroke={rgba(MILESTONE_COLOR, 0.7)} strokeWidth="1.5" />
            <polyline points={b.idealPoints} fill="none" stroke={rgba(T.mutedSoft, 0.8)} strokeWidth="1.5" strokeDasharray="5 3" />
            <polyline points={b.actualPoints} fill="none" stroke={rgb(tone)} strokeWidth="2.5" />
          </svg>
        ) : (
          <div style={S(`padding:20px 0; font-size:12.5px; color:${rgb(T.muted)};`)}>このマイルストーンにはイシューがありません。</div>
        )}
      </div>

      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <div style={{ fontSize: "13.5px", fontWeight: 700, color: rgb(T.body), marginBottom: "6px" }}>残作業（未完 {row.remaining} 件）</div>
        <Bucket title="超過" tone="err" refs={row.buckets.overdue} />
        <Bucket title="今週（〜7日）" tone="warn" refs={row.buckets.thisWeek} />
        <Bucket title="それ以降・期限なし" tone="neutral" refs={row.buckets.later} />
        {row.remaining === 0 && <div style={S(`font-size:12.5px; color:${rgb(T.ok)};`)}>未完はありません 🎉</div>}
      </div>
    </div>
  );
}

function Bucket({ title, tone, refs }: { title: string; tone: "err" | "warn" | "neutral"; refs: RoadmapIssueRef[] }) {
  if (!refs.length) return null;
  const col = tone === "err" ? T.err : tone === "warn" ? T.warn : T.muted;
  return (
    <div style={{ marginBottom: "9px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: rgb(col), textTransform: "uppercase", letterSpacing: ".04em", marginBottom: "3px" }}>
        {title} · {refs.length}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        {refs.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13.5px", color: rgb(T.body), minWidth: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: "12.5px", color: rgb(T.muted), flex: "0 0 auto" }}>#{r.id}</span>
            {r.isCheckpoint && <span style={{ color: rgb(CHECKPOINT_STAR), flex: "0 0 auto" }}>★</span>}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
            <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: "11px", color: rgb(toneColor(r.tone)), flex: "0 0 auto" }}>{r.dueLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── "+N" popover: the collapsed open-issue list, viewport-clamped ── */
function ChipPopover({ chip, innerRef, onClose }: { chip: NonNullable<ChipState>; innerRef: React.RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const { left, top } = useViewportClamp(innerRef, chip.x, chip.y);
  return (
    <div
      ref={innerRef}
      style={{
        position: "fixed",
        left,
        top,
        zIndex: 70,
        width: "300px",
        maxHeight: "320px",
        overflowY: "auto",
        background: rgb(T.canvasSoft),
        border: "1px solid " + rgb(T.hairline),
        borderRadius: "12px",
        boxShadow: SH_2,
        padding: "10px 12px",
        fontFamily: SANS,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "7px" }}>
        <span style={{ fontSize: "15px", fontWeight: 700, color: rgb(T.ink) }}>未完 {chip.refs.length} 件</span>
        <button type="button" onClick={onClose} aria-label="閉じる" style={{ border: "none", background: "transparent", color: rgb(T.mutedSoft), cursor: "pointer", fontSize: "14px", lineHeight: 1 }}>×</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {chip.refs.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13.5px", color: rgb(T.body), minWidth: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: "12.5px", color: rgb(T.muted), flex: "0 0 auto" }}>#{r.id}</span>
            {r.isCheckpoint && <span style={{ color: rgb(CHECKPOINT_STAR), flex: "0 0 auto" }}>★</span>}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
            <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: "11px", color: rgb(toneColor(r.tone)), flex: "0 0 auto" }}>{r.dueLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── edge-safe positioning helpers (keep labels inside the track) ── */
function edgeAnchor(x: number): { left: string; transform: string; textAlign: CSSProperties["textAlign"] } {
  if (x <= 6) return { left: "0%", transform: "translateX(0)", textAlign: "left" };
  if (x >= 94) return { left: "100%", transform: "translateX(-100%)", textAlign: "right" };
  return { left: x + "%", transform: "translateX(-50%)", textAlign: "center" };
}
function monthLabelStyle(x: number): CSSProperties {
  const a = edgeAnchor(x);
  return { position: "absolute", bottom: 0, left: a.left, transform: a.transform, fontSize: "12.5px", fontWeight: 600, color: rgb(T.muted), fontFamily: MONO, whiteSpace: "nowrap" };
}
function todayLabelStyle(x: number): CSSProperties {
  const a = edgeAnchor(x);
  return { position: "absolute", bottom: 0, left: a.left, transform: a.transform, fontSize: "12.5px", fontWeight: 700, color: rgb(T.primary), fontFamily: MONO, whiteSpace: "nowrap" };
}
function tickLabelStyle(x: number): CSSProperties {
  const a = edgeAnchor(x);
  return { position: "absolute", bottom: "12px", left: 0, transform: a.transform, fontSize: "11px", fontWeight: 500, color: rgb(T.body), fontFamily: MONO, whiteSpace: "nowrap" };
}
function moreChipStyle(x: number): CSSProperties {
  const a = edgeAnchor(x);
  return {
    position: "absolute",
    bottom: "4px",
    left: a.left,
    transform: a.transform,
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 700,
    fontFamily: SANS,
    color: rgb(T.body),
    background: rgb(T.strong),
    border: "1px solid " + rgba(T.hairline, 0.9),
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

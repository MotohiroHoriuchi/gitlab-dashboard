"use client";

import { type CSSProperties, useEffect, useState } from "react";
import {
  DAY,
  MONO,
  SANS,
  T,
  rgb,
  rgba,
  seg,
  type ExecutiveScheduleBar,
  type ExecutiveScheduleIssue,
  type ExecutiveScheduleVals,
} from "@/lib/logic";

const MIN_RANGE_DAYS = 28;
const MAX_RANGE_DAYS = 366;
const OWNER_COL = 220;
const TRACK_MIN = 760;

const formatDay = (day: number): string => new Date(day * DAY).toISOString().slice(0, 10);
const parseDay = (value: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(parsed)) return null;
  const day = Math.floor(parsed / DAY);
  return formatDay(day) === value ? day : null;
};

function issueTone(issue: ExecutiveScheduleIssue): string {
  return issue.risk === "overdue" ? T.err : issue.risk === "soon" ? T.warn : T.muted;
}

function barColors(bar: ExecutiveScheduleBar): CSSProperties {
  if (bar.phase === "overdue") {
    return {
      color: rgb(T.err),
      borderColor: rgba(T.err, 0.65),
      background: rgba(T.err, 0.09),
    };
  }
  if (bar.phase === "active") {
    return {
      color: rgb(T.primary),
      borderColor: rgba(T.primary, 0.65),
      background: rgba(T.primary, 0.14),
    };
  }
  return {
    color: rgb(T.body),
    borderColor: rgba(T.primary, 0.32),
    background: rgb(T.card),
  };
}

const detailId = (key: string): string =>
  "schedule-detail-" + Array.from(key, (char) => char.codePointAt(0)!.toString(36)).join("-");

export default function ExecutiveScheduleView({
  schedule,
  startDay,
  endDay,
  defaultStart,
  defaultEnd,
  onRangeChange,
  fullscreen,
  onToggleFull,
  onExitFull,
  onClearFilters,
}: {
  schedule: ExecutiveScheduleVals;
  startDay: number;
  endDay: number;
  defaultStart: number;
  defaultEnd: number;
  onRangeChange: (start: number, end: number) => void;
  fullscreen?: boolean;
  onToggleFull?: () => void;
  onExitFull?: () => void;
  onClearFilters: () => void;
}) {
  const [draftStart, setDraftStart] = useState(formatDay(startDay));
  const [draftEnd, setDraftEnd] = useState(formatDay(endDay));
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setDraftStart(formatDay(startDay));
    setDraftEnd(formatDay(endDay));
    setError(null);
  }, [startDay, endDay]);

  useEffect(() => {
    if (!fullscreen || !onExitFull) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selected) setSelected(null);
        else onExitFull();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen, onExitFull, selected]);

  const applyRange = () => {
    const nextStart = parseDay(draftStart);
    const nextEnd = parseDay(draftEnd);
    if (nextStart === null || nextEnd === null) {
      setError("開始日と終了日を正しい日付で入力してください。");
      return;
    }
    const days = nextEnd - nextStart + 1;
    if (days < MIN_RANGE_DAYS) {
      setError(`表示期間は${MIN_RANGE_DAYS}日以上にしてください。`);
      return;
    }
    if (days > MAX_RANGE_DAYS) {
      setError(`表示期間は${MAX_RANGE_DAYS}日以内にしてください。`);
      return;
    }
    setError(null);
    setSelected(null);
    onRangeChange(nextStart, nextEnd);
  };
  const moveRange = (direction: -1 | 1) => {
    const span = endDay - startDay + 1;
    onRangeChange(startDay + span * direction, endDay + span * direction);
    setSelected(null);
  };
  const resetRange = () => {
    onRangeChange(defaultStart, defaultEnd);
    setSelected(null);
  };

  const control = (style: CSSProperties): CSSProperties =>
    fullscreen ? { ...style, padding: "10px 16px", fontSize: "16px" } : style;
  const inputStyle: CSSProperties = {
    minHeight: fullscreen ? "42px" : "36px",
    boxSizing: "border-box",
    padding: fullscreen ? "7px 10px" : "5px 8px",
    border: "1px solid " + (error ? rgba(T.err, 0.75) : rgb(T.hairline)),
    borderRadius: "8px",
    background: rgb(T.card),
    color: rgb(T.ink),
    fontFamily: MONO,
    fontSize: fullscreen ? "16px" : "13px",
    fontVariantNumeric: "tabular-nums",
  };

  return (
    <section
      aria-labelledby="executive-schedule-title"
      style={{
        minWidth: 0,
        padding: fullscreen ? "24px 28px 28px" : "18px 20px 20px",
        border: "1px solid " + rgb(T.hairline),
        borderRadius: "16px",
        background: rgb(T.card),
        color: rgb(T.ink),
        fontFamily: SANS,
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px", flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: rgb(T.primary), fontSize: fullscreen ? "15px" : "12.5px", fontWeight: 700 }}>
            MANAGEMENT HORIZON
          </p>
          <h2 id="executive-schedule-title" style={{ margin: "5px 0 0", fontSize: fullscreen ? "30px" : "22px", lineHeight: 1.25, textWrap: "balance" }}>
            誰が、どの大日程を動かしているか
          </h2>
          <p style={{ margin: "7px 0 0", color: rgb(T.muted), fontSize: fullscreen ? "16px" : "13px", lineHeight: 1.55, textWrap: "pretty" }}>
            Openイシューの担当者でマイルストーンを整理 · {schedule.rangeLabel}
          </p>
        </div>
        {onToggleFull && (
          <button type="button" style={control(seg(!!fullscreen))} onClick={onToggleFull} aria-pressed={!!fullscreen}>
            {fullscreen ? "✕ 会議表示を終了" : "⛶ 会議表示"}
          </button>
        )}
      </header>

      <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", flexWrap: "wrap", marginTop: "20px", padding: "13px 14px", border: "1px solid " + rgb(T.hairline), borderRadius: "12px", background: rgb(T.canvas) }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "5px", color: rgb(T.muted), fontSize: fullscreen ? "14px" : "11.5px", fontWeight: 700 }}>
          開始日
          <input type="date" value={draftStart} onInput={(e) => setDraftStart(e.currentTarget.value)} style={inputStyle} aria-invalid={!!error} aria-describedby={error ? "schedule-range-error" : undefined} />
        </label>
        <span aria-hidden="true" style={{ paddingBottom: fullscreen ? "10px" : "8px", color: rgb(T.muted) }}>〜</span>
        <label style={{ display: "flex", flexDirection: "column", gap: "5px", color: rgb(T.muted), fontSize: fullscreen ? "14px" : "11.5px", fontWeight: 700 }}>
          終了日
          <input type="date" value={draftEnd} onInput={(e) => setDraftEnd(e.currentTarget.value)} style={inputStyle} aria-invalid={!!error} aria-describedby={error ? "schedule-range-error" : undefined} />
        </label>
        <button type="button" style={control(seg(true))} onClick={applyRange}>期間を適用</button>
        <div style={{ display: "flex", gap: "6px", marginLeft: fullscreen ? "8px" : 0 }}>
          <button type="button" style={control(seg(false))} onClick={() => moveRange(-1)}>← 前期間</button>
          <button type="button" style={control(seg(false))} onClick={() => moveRange(1)}>次期間 →</button>
          <button type="button" style={control(seg(false))} onClick={resetRange}>初期範囲</button>
        </div>
        <span style={{ marginLeft: "auto", color: rgb(T.muted), fontFamily: MONO, fontSize: fullscreen ? "15px" : "12px", fontVariantNumeric: "tabular-nums" }}>
          {schedule.rangeDays}日
        </span>
        {error && (
          <p id="schedule-range-error" role="alert" style={{ flexBasis: "100%", margin: "2px 0 0", color: rgb(T.err), fontSize: fullscreen ? "15px" : "12.5px" }}>
            {error}
          </p>
        )}
      </div>

      <dl aria-label="大日程の集計" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "10px", margin: "14px 0 18px" }}>
        {[
          ["稼働メンバー", schedule.people, T.primary],
          ["進行中", schedule.open, T.ink],
          ["マイルストーン", schedule.milestones, T.body],
          ["期限超過", schedule.overdue, schedule.overdue ? T.err : T.ok],
        ].map(([label, value, tone]) => (
          <div key={String(label)} style={{ padding: fullscreen ? "14px 16px" : "11px 13px", borderLeft: "3px solid " + rgb(String(tone)), background: rgb(T.canvas), borderRadius: "8px" }}>
            <dt style={{ color: rgb(T.muted), fontSize: fullscreen ? "14px" : "11.5px", fontWeight: 700 }}>{label}</dt>
            <dd style={{ margin: "5px 0 0", color: rgb(String(tone)), fontFamily: MONO, fontSize: fullscreen ? "28px" : "21px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</dd>
          </div>
        ))}
      </dl>

      {schedule.outOfRange > 0 && (
        <p style={{ margin: "0 0 10px", color: rgb(T.muted), fontSize: fullscreen ? "14px" : "12px", textWrap: "pretty" }}>
          選択期間の外に、日程設定済みマイルストーンが {schedule.outOfRange} 件あります。
        </p>
      )}

      {schedule.lanes.length ? (
        <div style={{ overflowX: "auto", border: "1px solid " + rgb(T.hairline), borderRadius: "12px" }}>
          <div style={{ minWidth: OWNER_COL + TRACK_MIN }}>
            <div style={{ display: "grid", gridTemplateColumns: `${OWNER_COL}px minmax(${TRACK_MIN}px,1fr)`, minHeight: fullscreen ? "58px" : "48px", borderBottom: "1px solid " + rgb(T.hairline), background: rgb(T.canvas) }}>
              <div style={{ display: "flex", alignItems: "flex-end", padding: "0 14px 10px", color: rgb(T.muted), fontSize: fullscreen ? "14px" : "11.5px", fontWeight: 700 }}>担当者 / 現在の仕事</div>
              <Axis schedule={schedule} fullscreen={fullscreen} />
            </div>
            {schedule.lanes.map((lane) => {
              const laneHeight = (fullscreen ? 22 : 17) + lane.sublaneCount * (fullscreen ? 50 : 42);
              return (
                <div key={lane.name}>
                  <div style={{ display: "grid", gridTemplateColumns: `${OWNER_COL}px minmax(${TRACK_MIN}px,1fr)`, minHeight: laneHeight, borderBottom: "1px solid " + rgb(T.hairline) }}>
                    <div style={{ padding: fullscreen ? "15px 16px" : "12px 14px", borderRight: "1px solid " + rgb(T.hairline), background: rgb(T.card) }}>
                      <div style={{ overflow: "hidden", color: rgb(T.ink), fontSize: fullscreen ? "19px" : "15px", fontWeight: 700, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lane.name}</div>
                      <div style={{ marginTop: "5px", color: lane.overdue ? rgb(T.err) : rgb(T.muted), fontFamily: MONO, fontSize: fullscreen ? "13.5px" : "11px", fontVariantNumeric: "tabular-nums" }}>
                        Open {lane.open} · 大日程 {lane.milestoneCount}{lane.overdue ? ` · 超過 ${lane.overdue}` : ""}
                      </div>
                    </div>
                    <LaneTrack laneHeight={laneHeight} schedule={schedule} bars={lane.bars} selected={selected} onSelect={setSelected} fullscreen={fullscreen} />
                  </div>
                  {lane.bars.map((bar) => selected === bar.key && <BarDetail key={bar.key} bar={bar} owner={lane.name} fullscreen={fullscreen} />)}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ padding: "34px 20px", border: "1px solid " + rgb(T.hairline), borderRadius: "12px", textAlign: "center", background: rgb(T.canvas) }}>
          <p style={{ margin: 0, color: rgb(T.muted), fontSize: fullscreen ? "16px" : "13px" }}>この期間に表示できる担当者別マイルストーンがありません。</p>
          <button type="button" style={{ ...seg(false), marginTop: "13px" }} onClick={onClearFilters}>絞り込みを解除</button>
        </div>
      )}

      {schedule.unscheduled.length > 0 && (
        <section aria-labelledby="unscheduled-title" style={{ marginTop: "20px", padding: fullscreen ? "18px" : "15px", border: "1px solid " + rgba(T.warn, 0.38), borderRadius: "12px", background: rgba(T.warn, 0.05) }}>
          <h3 id="unscheduled-title" style={{ margin: 0, color: rgb(T.ink), fontSize: fullscreen ? "20px" : "15px", textWrap: "balance" }}>日程未設定</h3>
          <p style={{ margin: "5px 0 12px", color: rgb(T.muted), fontSize: fullscreen ? "14px" : "12px", textWrap: "pretty" }}>開始日と期限の両方が揃うと、上のタイムラインに表示されます。</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "9px" }}>
            {schedule.unscheduled.map((group) => (
              <div key={group.name} style={{ padding: "11px 12px", border: "1px solid " + rgba(T.warn, 0.25), borderRadius: "8px", background: rgb(T.card) }}>
                <div style={{ color: rgb(T.ink), fontSize: fullscreen ? "16px" : "13px", fontWeight: 700 }}>{group.name}</div>
                <ul style={{ margin: "7px 0 0", padding: 0, listStyle: "none" }}>
                  {group.items.map((item) => (
                    <li key={`${item.milestoneId ?? "none"}:${item.title}`} style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "5px 0", borderTop: "1px solid " + rgb(T.hairline), color: rgb(T.body), fontSize: fullscreen ? "14px" : "12px" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                      <span style={{ flex: "0 0 auto", color: rgb(T.warn), fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{item.openCount}件</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function Axis({ schedule, fullscreen }: { schedule: ExecutiveScheduleVals; fullscreen?: boolean }) {
  return (
    <div aria-label="日付軸" style={{ position: "relative", minHeight: fullscreen ? "58px" : "48px" }}>
      {schedule.axisMarks.map((mark) => (
        <time key={`${mark.kind}:${mark.date}`} dateTime={mark.date} style={{ position: "absolute", left: mark.x + "%", top: mark.kind === "month" ? (fullscreen ? "9px" : "7px") : undefined, bottom: mark.kind === "week" ? (fullscreen ? "7px" : "5px") : undefined, transform: mark.x > 94 ? "translateX(-100%)" : mark.x < 4 ? "none" : "translateX(-50%)", color: mark.kind === "month" ? rgb(T.body) : rgb(T.muted), fontFamily: MONO, fontSize: mark.kind === "month" ? (fullscreen ? "15px" : "12px") : (fullscreen ? "13px" : "11px"), fontWeight: mark.kind === "month" ? 700 : 500, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          {mark.label}
        </time>
      ))}
      {schedule.todayX !== null && <span style={{ position: "absolute", left: schedule.todayX + "%", top: fullscreen ? "9px" : "7px", transform: "translateX(-50%)", padding: "1px 3px", color: rgb(T.primary), background: rgb(T.canvas), fontSize: fullscreen ? "14px" : "11.5px", fontWeight: 700 }}>本日</span>}
    </div>
  );
}

function LaneTrack({ laneHeight, schedule, bars, selected, onSelect, fullscreen }: { laneHeight: number; schedule: ExecutiveScheduleVals; bars: ExecutiveScheduleBar[]; selected: string | null; onSelect: (key: string | null) => void; fullscreen?: boolean }) {
  return (
    <div style={{ position: "relative", minHeight: laneHeight, overflow: "hidden", background: rgb(T.card) }}>
      {schedule.axisMarks.map((mark) => <span aria-hidden="true" key={`${mark.kind}:${mark.date}`} style={{ position: "absolute", insetBlock: 0, left: mark.x + "%", width: "1px", background: mark.kind === "month" ? rgba(T.ink, 0.12) : rgba(T.ink, 0.045) }} />)}
      {schedule.todayX !== null && <span aria-hidden="true" style={{ position: "absolute", insetBlock: 0, left: schedule.todayX + "%", width: "2px", background: rgba(T.primary, 0.75), zIndex: 1 }} />}
      {bars.map((bar) => (
        <button key={bar.key} type="button" aria-expanded={selected === bar.key} aria-controls={detailId(bar.key)} onClick={() => onSelect(selected === bar.key ? null : bar.key)} style={{ position: "absolute", top: (fullscreen ? 13 : 10) + bar.sublane * (fullscreen ? 50 : 42), left: bar.left + "%", width: bar.width + "%", minWidth: "20px", height: fullscreen ? "38px" : "32px", overflow: "hidden", padding: fullscreen ? "4px 10px" : "3px 8px", border: "1px solid", borderRadius: "6px", cursor: "pointer", textAlign: "left", fontFamily: SANS, zIndex: selected === bar.key ? 2 : 1, ...barColors(bar) }} title={`${bar.title} · Open ${bar.openCount}件 · ${formatDay(bar.startDay)}〜${formatDay(bar.endDay)}`}>
          <span style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0 }}>
            {bar.continuesBefore && <span aria-hidden="true">‹</span>}
            <strong style={{ minWidth: 0, overflow: "hidden", fontSize: fullscreen ? "14px" : "12px", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bar.title}</strong>
            <span style={{ flex: "0 0 auto", fontFamily: MONO, fontSize: fullscreen ? "12px" : "10.5px", fontVariantNumeric: "tabular-nums" }}>{bar.openCount}</span>
            {bar.continuesAfter && <span aria-hidden="true">›</span>}
          </span>
          {bar.width >= 15 && <span style={{ display: "block", overflow: "hidden", marginTop: "1px", fontSize: fullscreen ? "11.5px" : "10px", opacity: 0.82, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bar.focusTitle}</span>}
        </button>
      ))}
    </div>
  );
}

function BarDetail({ bar, owner, fullscreen }: { bar: ExecutiveScheduleBar; owner: string; fullscreen?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `${OWNER_COL}px minmax(0,1fr)`, borderBottom: "1px solid " + rgb(T.hairline), background: rgba(T.primary, 0.045) }}>
      <div style={{ padding: "13px 14px", borderRight: "1px solid " + rgb(T.hairline), color: rgb(T.muted), fontSize: fullscreen ? "13px" : "11px" }}>
        {owner}<br />{formatDay(bar.startDay)} 〜 {formatDay(bar.endDay)}
      </div>
      <div id={detailId(bar.key)} style={{ padding: fullscreen ? "15px 18px" : "12px 15px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "baseline" }}>
          <h3 style={{ margin: 0, color: rgb(T.ink), fontSize: fullscreen ? "18px" : "14px", textWrap: "balance" }}>{bar.title}の進行中イシュー</h3>
          <span style={{ color: rgb(T.muted), fontFamily: MONO, fontSize: fullscreen ? "13px" : "11px", fontVariantNumeric: "tabular-nums" }}>{bar.openCount}件</span>
        </div>
        <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "6px 14px", margin: "9px 0 0", padding: 0, listStyle: "none" }}>
          {bar.issues.map((issue) => (
            <li key={issue.id} style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, padding: "6px 0", borderTop: "1px solid " + rgb(T.hairline) }}>
              <span style={{ flex: "0 0 auto", color: rgb(T.primary), fontFamily: MONO, fontSize: fullscreen ? "13px" : "11px", fontWeight: 700 }}>#{issue.id}</span>
              {issue.isCheckpoint && <span aria-label="チェックポイント" style={{ color: rgb(T.warn) }}>★</span>}
              <span style={{ minWidth: 0, overflow: "hidden", color: rgb(T.body), fontSize: fullscreen ? "14px" : "12px", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{issue.title}</span>
              <span style={{ flex: "0 0 auto", marginLeft: "auto", color: rgb(issueTone(issue)), fontSize: fullscreen ? "12px" : "10.5px" }}>{issue.dueLabel}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

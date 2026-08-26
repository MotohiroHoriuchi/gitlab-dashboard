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
  type ExecutiveScheduleVals,
} from "@/lib/logic";
import ExecutiveScheduleWorkspace from "@/components/ExecutiveScheduleWorkspace";
import type { GitLabProtocol } from "@/lib/types";

const MIN_RANGE_DAYS = 28;
const MAX_RANGE_DAYS = 366;

const formatDay = (day: number): string => new Date(day * DAY).toISOString().slice(0, 10);
const parseDay = (value: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(parsed)) return null;
  const day = Math.floor(parsed / DAY);
  return formatDay(day) === value ? day : null;
};

export default function ExecutiveScheduleView({
  schedule,
  repo,
  gitlabProtocol,
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
  repo: string;
  gitlabProtocol: GitLabProtocol;
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

  useEffect(() => {
    setDraftStart(formatDay(startDay));
    setDraftEnd(formatDay(endDay));
    setError(null);
  }, [startDay, endDay]);

  useEffect(() => {
    if (!fullscreen || !onExitFull) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExitFull();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen, onExitFull]);

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
    onRangeChange(nextStart, nextEnd);
  };
  const moveRange = (direction: -1 | 1) => {
    const span = endDay - startDay + 1;
    onRangeChange(startDay + span * direction, endDay + span * direction);
  };
  const resetRange = () => {
    onRangeChange(defaultStart, defaultEnd);
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
        <ExecutiveScheduleWorkspace
          schedule={schedule}
          repo={repo}
          defaultProtocol={gitlabProtocol}
          fullscreen={fullscreen}
        />
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

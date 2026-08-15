"use client";

import { type CSSProperties, useMemo, useState } from "react";
import {
  DAY,
  T,
  rgb,
  rgba,
  type ExecutiveScheduleBar,
  type ExecutiveScheduleIssue,
  type ExecutiveScheduleVals,
} from "@/lib/logic";
import styles from "./ExecutiveScheduleWorkspace.module.css";

type Tone = "danger" | "warning" | "success" | "neutral";

const dayText = (day: number): string => {
  const date = new Date(day * DAY);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
};

const projectUrl = (repo: string): string => {
  const clean = repo.replace(/（[^）]*）/g, "").trim().replace(/\/$/, "");
  return /^https?:\/\//.test(clean) ? clean : `https://${clean}`;
};

const barTone = (bar: ExecutiveScheduleBar): { color: string; soft: string } => {
  if (bar.phase === "overdue" || bar.overdue > 0) {
    return { color: rgb(T.err), soft: rgba(T.err, 0.08) };
  }
  if (bar.phase === "future") {
    return { color: rgb(T.muted), soft: rgba(T.muted, 0.08) };
  }
  if (bar.issues.some((issue) => issue.risk === "soon")) {
    return { color: rgb(T.warn), soft: rgba(T.warn, 0.08) };
  }
  return { color: rgb(T.ok), soft: rgba(T.ok, 0.08) };
};

const statusOf = (bar: ExecutiveScheduleBar): { label: string; symbol: string; tone: Tone } => {
  if (bar.phase === "overdue" || bar.overdue > 0) return { label: "期限超過", symbol: "!", tone: "danger" };
  if (bar.phase === "future") return { label: "未着手", symbol: "○", tone: "neutral" };
  if (bar.issues.some((issue) => issue.risk === "soon")) return { label: "要注意", symbol: "△", tone: "warning" };
  return { label: "順調", symbol: "✓", tone: "success" };
};

const issueStatus = (issue: ExecutiveScheduleIssue): { label: string; symbol: string; tone: Tone } => {
  if (issue.risk === "overdue") return { label: "期限超過", symbol: "!", tone: "danger" };
  if (issue.risk === "soon") return { label: "要注意", symbol: "△", tone: "warning" };
  return { label: "進行中", symbol: issue.isCheckpoint ? "★" : "○", tone: issue.isCheckpoint ? "warning" : "neutral" };
};

export default function ExecutiveScheduleWorkspace({
  schedule,
  repo,
  fullscreen,
}: {
  schedule: ExecutiveScheduleVals;
  repo: string;
  fullscreen?: boolean;
}) {
  const bars = useMemo(
    () => schedule.lanes.flatMap((lane) => lane.bars.map((bar) => ({ bar, owner: lane.name }))),
    [schedule.lanes],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selection = bars.find(({ bar }) => bar.key === selectedKey) ?? bars[0] ?? null;
  const activeKey = selection?.bar.key ?? null;
  const baseUrl = projectUrl(repo);
  const theme = {
    "--canvas": T.canvas,
    "--card": T.card,
    "--ink": T.ink,
    "--body": T.body,
    "--muted": T.muted,
    "--primary": T.primary,
    "--hairline": T.hairline,
    "--warn": T.warn,
    "--err": T.err,
    "--ok": T.ok,
  } as CSSProperties;

  return (
    <div className={`${styles.workspace} ${fullscreen ? styles.fullscreen : ""}`} style={theme}>
      <section className={styles.timelinePanel} aria-label="担当者別マイルストーン">
        <div className={styles.timelineScroll}>
          <div className={styles.timelineInner}>
            <div className={styles.axisRow}>
              <div className={styles.ownerHeading}>担当者 / 現在の仕事</div>
              <Axis schedule={schedule} />
            </div>
            {schedule.lanes.map((lane) => {
              const laneHeight = 18 + lane.sublaneCount * 58;
              return (
                <div className={styles.laneRow} key={lane.name} style={{ "--lane-height": `${laneHeight}px` } as CSSProperties}>
                  <div className={styles.ownerCell}>
                    <strong>{lane.name}</strong>
                    <span className={lane.overdue ? styles.ownerDanger : undefined}>
                      残 {lane.open} · 最大{lane.sublaneCount}重{lane.overdue ? ` · 超過 ${lane.overdue}` : ""}
                    </span>
                  </div>
                  <div className={styles.track}>
                    {schedule.axisMarks.map((mark) => (
                      <span
                        aria-hidden="true"
                        className={mark.kind === "month" ? styles.monthGrid : styles.weekGrid}
                        key={`${mark.kind}:${mark.date}`}
                        style={{ left: `${mark.x}%` }}
                      />
                    ))}
                    {schedule.todayX !== null && (
                      <span aria-hidden="true" className={styles.todayLine} style={{ left: `${schedule.todayX}%` }} />
                    )}
                    {lane.bars.map((bar) => (
                      <MilestoneBar
                        key={bar.key}
                        bar={bar}
                        selected={bar.key === activeKey}
                        onSelect={() => setSelectedKey(bar.key)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {selection && (
        <Inspector bar={selection.bar} owner={selection.owner} baseUrl={baseUrl} />
      )}
    </div>
  );
}

function Axis({ schedule }: { schedule: ExecutiveScheduleVals }) {
  return (
    <div className={styles.axis} aria-label="日付軸">
      {schedule.todayX !== null && (
        <span className={styles.todayLabel} style={{ left: `${schedule.todayX}%` }}>今日</span>
      )}
      {schedule.axisMarks.map((mark) => (
        <time
          className={mark.kind === "month" ? styles.monthMark : styles.weekMark}
          dateTime={mark.date}
          key={`${mark.kind}:${mark.date}`}
          style={{ left: `${mark.x}%` }}
        >
          {mark.label}
        </time>
      ))}
    </div>
  );
}

function MilestoneBar({
  bar,
  selected,
  onSelect,
}: {
  bar: ExecutiveScheduleBar;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = barTone(bar);
  const style = {
    "--bar-left": `${bar.left}%`,
    "--bar-width": `${bar.width}%`,
    "--bar-top": `${8 + bar.sublane * 58}px`,
    "--bar-color": tone.color,
    "--bar-soft": tone.soft,
    "--bar-progress": `${bar.progress}%`,
  } as CSSProperties;

  return (
    <button
      type="button"
      className={styles.milestoneBar}
      style={style}
      aria-pressed={selected}
      aria-controls="executive-milestone-inspector"
      aria-label={`${bar.title}、残り${bar.openCount}件、進捗${bar.progress}%`}
      onClick={onSelect}
      title={`${bar.title} · 残り${bar.openCount}件 · ${dayText(bar.startDay)}〜${dayText(bar.endDay)}`}
    >
      <span className={styles.barTopline}>
        <strong className={styles.barTitle}>
          {bar.continuesBefore && <span aria-hidden="true">‹ </span>}
          {bar.title}
          {bar.continuesAfter && <span aria-hidden="true"> ›</span>}
        </strong>
        <span className={styles.barCount}>残 {bar.openCount}</span>
      </span>
      <span className={styles.barProgressRow}>
        <span
          className={styles.barProgress}
          role="progressbar"
          aria-label={`${bar.title}の進捗`}
          aria-valuemin={0}
          aria-valuemax={bar.totalCount}
          aria-valuenow={bar.doneCount}
          aria-valuetext={`${bar.progress}%、全${bar.totalCount}件中${bar.doneCount}件完了`}
        >
          <span />
        </span>
        <span className={styles.barPercent}>{bar.progress}%</span>
      </span>
    </button>
  );
}

function Inspector({ bar, owner, baseUrl }: { bar: ExecutiveScheduleBar; owner: string; baseUrl: string }) {
  const status = statusOf(bar);
  return (
    <aside id="executive-milestone-inspector" className={styles.inspector} aria-label="選択中のマイルストーン詳細">
      <div className={styles.inspectorHeader}>
        <div>
          <p className={styles.eyebrow}>SELECTED MILESTONE</p>
          <h3>{bar.title}</h3>
        </div>
        <p className={styles.milestoneDates}>
          <time dateTime={new Date(bar.startDay * DAY).toISOString().slice(0, 10)}>{dayText(bar.startDay)}</time>
          <span aria-hidden="true">–</span>
          <time dateTime={new Date(bar.endDay * DAY).toISOString().slice(0, 10)}>{dayText(bar.endDay)}</time>
        </p>
      </div>

      <div className={styles.summaryRow}>
        <p className={`${styles.status} ${styles[`tone_${status.tone}`]}`}>
          <span aria-hidden="true">{status.symbol}</span>{status.label}
          <span className={styles.ownerName}>{owner}</span>
        </p>
        <p className={styles.remaining}><strong>{bar.openCount}</strong><span>件残り / 全{bar.totalCount}件</span></p>
      </div>

      <div className={styles.inspectorProgressRow}>
        <div
          className={styles.inspectorProgress}
          role="progressbar"
          aria-label={`${bar.title}の進捗`}
          aria-valuemin={0}
          aria-valuemax={bar.totalCount}
          aria-valuenow={bar.doneCount}
          aria-valuetext={`${bar.progress}%、全${bar.totalCount}件中${bar.doneCount}件完了`}
          style={{ "--detail-progress": `${bar.progress}%` } as CSSProperties}
        ><span /></div>
        <strong>{bar.progress}%</strong>
      </div>

      <ul className={styles.issueList} aria-label={`${bar.title}の進行中Issue`}>
        {bar.issues.map((issue) => {
          const state = issueStatus(issue);
          return (
            <li key={issue.id}>
              <a className={styles.issueLink} href={`${baseUrl}/-/issues/${issue.id}`} target="_blank" rel="noreferrer">
                <span className={`${styles.issueState} ${styles[`tone_${state.tone}`]}`} aria-label={state.label}>{state.symbol}</span>
                <span className={styles.issueCopy}>
                  <span className={styles.issueTitle}><strong>#{issue.id}</strong> {issue.title}</span>
                  <span className={styles.issueMeta}>{state.label} · {issue.dueLabel} · {issue.label}</span>
                </span>
                <span className={styles.openIcon} aria-hidden="true">↗</span>
              </a>
            </li>
          );
        })}
      </ul>

      <a
        className={styles.openAll}
        href={`${baseUrl}/-/issues?milestone_title=${encodeURIComponent(bar.title)}`}
        target="_blank"
        rel="noreferrer"
      >
        <span>GitLabで関連Issueを開く</span><span aria-hidden="true">↗</span>
      </a>
    </aside>
  );
}

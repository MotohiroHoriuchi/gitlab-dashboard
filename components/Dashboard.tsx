"use client";

import { type CSSProperties, useEffect, useState } from "react";
import {
  DAY,
  DEFAULT_GROUP_BY,
  DEFAULT_HIDDEN_DOWS,
  S,
  T,
  renderVals,
  rgb,
  rgba,
  sanitizeHiddenDows,
  type Patch,
} from "@/lib/logic";
import {
  readDashboardUrlState,
  toDashboardUrlState,
  writeDashboardUrlState,
} from "@/lib/dashboardParams";
import type { ApiResponse, DashState } from "@/lib/types";
import FilterControls from "@/components/FilterControls";
import CalendarView from "@/components/CalendarView";
import RoadmapView from "@/components/RoadmapView";
import ExecutiveScheduleView from "@/components/ExecutiveScheduleView";
import TeamView from "@/components/TeamView";

/** Toolbar+view wrapper for the calendar/schedule/roadmap/team tabs. In fullscreen it
 * turns into a viewport-filling fixed overlay above the page (z 40, below the
 * popover/tooltip layers at 60/70). */
const fsWrap = (on: boolean): CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap: "20px", // matches the main grid's gap
  minWidth: 0,
  ...(on && {
    position: "fixed" as const,
    inset: 0,
    zIndex: 40,
    background: rgb(T.canvas),
    overflow: "auto",
    padding: "18px 22px 24px",
    boxSizing: "border-box" as const,
  }),
});

/** Full-height dark shell used for the loading / error states. */
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={S(
        `min-height:100vh; display:flex; align-items:center; justify-content:center; background:${rgb(T.canvas)}; color:${rgb(T.muted)}; font-family:'Inter',system-ui,-apple-system,sans-serif; padding:24px; box-sizing:border-box; text-align:center;`,
      )}
    >
      {children}
    </div>
  );
}

// Non-working weekdays persist per browser. SSR prerender falls back to the
// default, which never reaches the DOM: the first paint is the st-independent
// loading screen, and by the time data arrives the stored value is in state.
const HIDDEN_DOWS_KEY = "gitlab-dashboard.hiddenDows.v1";
function loadHiddenDows(): number[] {
  if (typeof window === "undefined") return DEFAULT_HIDDEN_DOWS;
  try {
    const raw = window.localStorage.getItem(HIDDEN_DOWS_KEY);
    return raw ? sanitizeHiddenDows(JSON.parse(raw)) : DEFAULT_HIDDEN_DOWS;
  } catch {
    return DEFAULT_HIDDEN_DOWS; // broken JSON / storage blocked (private mode)
  }
}

function shiftUtcMonths(day: number, months: number): number {
  const d = new Date(day * DAY);
  const targetMonth = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(d.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), targetMonth, Math.min(d.getUTCDate(), last)) / DAY,
  );
}

function createDefaultState(): DashState {
  const today = Math.floor(Date.now() / DAY);
  return {
    status: "all",
    sort: "linger",
    labels: [],
    assignees: [],
    milestones: [],
    hiddenDows: loadHiddenDows(),
    groupBy: DEFAULT_GROUP_BY,
    hovered: null,
    panel: "ranking",
    calMode: "twoweek",
    calAnchor: today,
    scheduleStart: shiftUtcMonths(today, -1),
    scheduleEnd: shiftUtcMonths(today, 5),
    fullscreen: false,
  };
}

function loadInitialState(defaults: DashState): DashState {
  if (typeof window === "undefined") return defaults;
  return {
    ...defaults,
    ...readDashboardUrlState(
      new URLSearchParams(window.location.search),
      toDashboardUrlState(defaults),
    ),
  };
}

export default function Dashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defaults] = useState<DashState>(createDefaultState);
  const [st, setSt] = useState<DashState>(() => loadInitialState(defaults));
  const patch: Patch = (p) =>
    setSt((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) }));
  const exitMeetingMode = () => {
    patch({ fullscreen: false });
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };
  const toggleMeetingMode = () => {
    if (st.fullscreen) {
      exitMeetingMode();
      return;
    }
    patch({ fullscreen: true });
    // Native fullscreen removes browser chrome on meeting-room displays. The
    // fixed overlay remains a complete fallback when the browser blocks it.
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };

  // Keep shareable view/filter state in the URL without adding one browser
  // history entry per click. Unknown query parameters (for embedding, etc.)
  // are left untouched.
  useEffect(() => {
    const current = new URL(window.location.href);
    const nextParams = writeDashboardUrlState(
      current.searchParams,
      toDashboardUrlState(st),
      toDashboardUrlState(defaults),
    );
    const query = nextParams.toString();
    const nextPath = current.pathname + (query ? `?${query}` : "") + current.hash;
    const currentPath = current.pathname + current.search + current.hash;
    if (nextPath !== currentPath) {
      window.history.replaceState(window.history.state, "", nextPath);
    }
  }, [
    defaults,
    st.panel,
    st.status,
    st.sort,
    st.labels,
    st.assignees,
    st.milestones,
    st.groupBy,
    st.calMode,
    st.calAnchor,
    st.scheduleStart,
    st.scheduleEnd,
  ]);

  // A URL reached through browser history is authoritative for the persisted
  // controls. Ephemeral state (hover/fullscreen/hidden weekdays) stays local.
  useEffect(() => {
    const onPopState = () => {
      const restored = readDashboardUrlState(
        new URLSearchParams(window.location.search),
        toDashboardUrlState(defaults),
      );
      setSt((current) => ({ ...current, ...restored }));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [defaults]);

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_DOWS_KEY, JSON.stringify(st.hiddenDows));
    } catch {
      // storage blocked — the setting just won't survive a reload
    }
  }, [st.hiddenDows]);

  // Fullscreen focus mode: lock the page scroll behind the fixed overlay.
  useEffect(() => {
    document.body.style.overflow = st.fullscreen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [st.fullscreen]);

  useEffect(() => {
    let alive = true;
    let busy = false; // skip a tick while the previous fetch is still running
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await fetch("/api/issues");
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (alive) {
          setData(j as ApiResponse);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        busy = false;
      }
    };
    load();
    // 60s polling, matching the server-side TTL. Hidden tabs skip ticks and
    // refresh immediately on return — the server cache absorbs the extra hit.
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, 60_000);
    const onVis = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Full error screen only when there is nothing to show; a failed poll keeps
  // rendering the last good payload.
  if (error && !data) {
    return (
      <Screen>
        <div>
          <div style={S(`font-size:15px; color:${rgb(T.err)}; font-weight:600; margin-bottom:8px;`)}>
            データを取得できませんでした
          </div>
          <div style={S("font-size:13px; max-width:520px; line-height:1.6;")}>{error}</div>
          <div style={S(`font-size:11.5px; color:${rgb(T.mutedSoft)}; margin-top:12px;`)}>
            GITLAB_BASE_URL / GITLAB_PROJECT_ID / GITLAB_TOKEN を確認してください。
          </div>
        </div>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <div style={S("font-size:13.5px; font-family:'JetBrains Mono',ui-monospace,monospace;")}>
          Loading issues…
        </div>
      </Screen>
    );
  }

  const v = renderVals(data.issues, st, patch, {
    repo: data.repo,
    project: data.project,
    asOf: data.asOf,
    milestones: data.milestones,
    checkpointLabel: data.checkpointLabel,
  });
  const cs = v.calendar.summary; // 納期予実 KPIs (calendar metric cards)

  return (
    <div
      style={S(
        `min-height:100vh; background:${rgb(T.canvas)}; color:${rgb(T.ink)}; font-family:'Inter',system-ui,-apple-system,sans-serif; padding:28px 34px 52px; box-sizing:border-box;`,
      )}
    >
      {/* ── Header ── */}
      <div style={S("display:flex; align-items:flex-end; justify-content:space-between; gap:24px; flex-wrap:wrap; margin-bottom:22px;")}>
        <div>
          <div style={S("display:flex; align-items:center; gap:9px;")}>
            <div style={S(`width:8px; height:8px; border-radius:50%; background:${rgb(T.primary)}; box-shadow:0 0 0 3px ${rgba(T.primary, .15)};`)}></div>
            <span style={S(`font-size:11.5px; letter-spacing:.15em; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:600;`)}>GitLab Issue Analytics</span>
          </div>
          <h1 style={S(`margin:9px 0 5px; font-size:26px; font-weight:700; color:${rgb(T.ink)}; letter-spacing:-0.5px;`)}>{v.project}</h1>
          <div style={S(`font-size:12.5px; color:${rgb(T.muted)}; font-family:'JetBrains Mono',ui-monospace,monospace;`)}>{v.repo} · {v.asOf} 時点 · 最終更新 {new Date(data.fetchedAt).toLocaleTimeString("ja-JP")}</div>
        </div>
        <div style={S("text-align:right;")}>
          <div style={S(`font-size:11px; color:${rgb(T.mutedSoft)}; text-transform:uppercase; letter-spacing:.09em; font-weight:600;`)}>総イシュー</div>
          <div style={S(`font-size:13.5px; color:${rgb(T.body)}; font-family:'JetBrains Mono',ui-monospace,monospace; margin-top:3px;`)}>全 {v.totalCount} 件</div>
        </div>
      </div>

      {/* ── Content tabs ── */}
      <div style={S("display:flex; align-items:center; gap:8px; margin-bottom:16px; flex-wrap:wrap;")}>
        <span style={S(`font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:${rgb(T.mutedSoft)}; font-weight:600;`)}>表示</span>
        <button style={v.panelTabs.ranking.style} onClick={v.panelTabs.ranking.onClick}>イシュー一覧</button>
        <button style={v.panelTabs.dist.style} onClick={v.panelTabs.dist.onClick}>Close日数の分布</button>
        <button style={v.panelTabs.calendar.style} onClick={v.panelTabs.calendar.onClick}>カレンダー</button>
        <button style={v.panelTabs.schedule.style} onClick={v.panelTabs.schedule.onClick}>大日程</button>
        <button style={v.panelTabs.roadmap.style} onClick={v.panelTabs.roadmap.onClick}>ロードマップ</button>
        <button style={v.panelTabs.team.style} onClick={v.panelTabs.team.onClick}>担当者</button>
      </div>

      {/* ── Main grid ── */}
      <div style={v.gridStyle}>
        {/* Issue-list tab: summary metrics + filters + ranked list (all filter-dependent) */}
        {v.showRank && (
          <>
            {/* Summary metrics */}
            <div style={S("display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:14px;")}>
              <div style={S(`background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:12px; padding:15px 17px;`)}>
                <div style={S(`font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:600;`)}>Open 件数</div>
                <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
                  <span style={S(`font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:${rgb(T.warn)};`)}>{v.openCount}</span>
                  <span style={S(`font-size:12.5px; color:${rgb(T.muted)};`)}>件</span>
                </div>
                <div style={S(`margin-top:7px; font-size:11.5px; color:${rgb(T.mutedSoft)}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`)}>{v.openSub}</div>
                <div style={S(`height:3px; border-radius:2px; margin-top:11px; background:${rgba(T.warn, .45)};`)}></div>
              </div>
              <div style={S(`background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:12px; padding:15px 17px;`)}>
                <div style={S(`font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:600;`)}>Close 件数</div>
                <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
                  <span style={S(`font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:${rgb(T.primary)};`)}>{v.closedCount}</span>
                  <span style={S(`font-size:12.5px; color:${rgb(T.muted)};`)}>件</span>
                </div>
                <div style={S(`margin-top:7px; font-size:11.5px; color:${rgb(T.mutedSoft)}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`)}>{v.closeSub}</div>
                <div style={S(`height:3px; border-radius:2px; margin-top:11px; background:${rgba(T.primary, .45)};`)}></div>
              </div>
              <div style={S(`background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:12px; padding:15px 17px;`)}>
                <div style={S(`font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:600;`)}>平均 Close 日数</div>
                <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
                  <span style={S(`font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:${rgb(T.ink)};`)}>{v.avgDays}</span>
                  <span style={S(`font-size:12.5px; color:${rgb(T.muted)};`)}>日</span>
                </div>
                <div style={S(`margin-top:7px; font-size:11.5px; color:${rgb(T.mutedSoft)};`)}>closed issues</div>
                <div style={S(`height:3px; border-radius:2px; margin-top:11px; background:${rgba(T.ink, .2)};`)}></div>
              </div>
              <div style={S(`background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:12px; padding:15px 17px;`)}>
                <div style={S(`font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:600;`)}>中央値 Close 日数</div>
                <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
                  <span style={S(`font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:${rgb(T.ink)};`)}>{v.medDays}</span>
                  <span style={S(`font-size:12.5px; color:${rgb(T.muted)};`)}>日</span>
                </div>
                <div style={S(`margin-top:7px; font-size:11.5px; color:${rgb(T.mutedSoft)};`)}>closed issues</div>
                <div style={S(`height:3px; border-radius:2px; margin-top:11px; background:${rgba(T.ink, .2)};`)}></div>
              </div>
              <div style={S(`background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:12px; padding:15px 17px;`)}>
                <div style={S(`font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:600;`)}>最長滞留 (Open)</div>
                <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
                  <span style={S(`font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:${rgb(T.err)};`)}>{v.maxOpenDays}</span>
                  <span style={S(`font-size:12.5px; color:${rgb(T.muted)};`)}>日</span>
                </div>
                <div style={S(`margin-top:7px; font-size:11.5px; color:${rgb(T.mutedSoft)}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`)}>{v.maxOpenSub}</div>
                <div style={S(`height:3px; border-radius:2px; margin-top:11px; background:${rgba(T.err, .45)};`)}></div>
              </div>
            </div>

            {/* Filter / sort bar */}
            <FilterControls v={v} st={st} showSort />

            {/* Ranked list */}
            <section style={S(`background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:16px; padding:18px 20px 20px; min-width:0;`)}>
              <div style={S("display:flex; align-items:baseline; justify-content:flex-end; gap:12px; margin-bottom:3px;")}>
                <span style={S(`font-size:11.5px; color:${rgb(T.mutedSoft)}; font-family:'JetBrains Mono',ui-monospace,monospace;`)}>上位 {v.topN} 件 · 単位 日</span>
              </div>
              <p style={S(`margin:0 0 12px; font-size:12px; color:${rgb(T.muted)}; line-height:1.5;`)}>
                バーが長いほど Open→Close に時間がかかっている。
                <span style={{ color: rgb(T.primary) }}>■</span>
                {"<30日 "}
                <span style={{ color: rgb(T.warn) }}>■</span>
                30日超{" "}
                <span style={{ color: rgb(T.err) }}>■</span>
                90日超 · 斜線は Open（未解決）。
              </p>

              <div style={S(`display:grid; grid-template-columns:224px minmax(0,1fr); align-items:center; gap:14px; padding:8px 0; border-bottom:1px solid ${rgb(T.hairline)};`)}>
                <div></div>
                <div style={S("position:relative; height:15px;")}>
                  {v.rankTicks.map((t, i) => (
                    <span key={i} style={t.style}>{t.label}</span>
                  ))}
                </div>
              </div>

              {v.rows.map((row, i) => (
                <div key={i} style={S(`display:grid; grid-template-columns:224px minmax(0,1fr); align-items:center; gap:14px; padding:8px 0; border-bottom:1px solid ${rgb(T.hairline)};`)}>
                  <div style={S("min-width:0;")}>
                    <div style={S("display:flex; align-items:center; gap:7px;")}>
                      <span style={S(`font-family:'JetBrains Mono',ui-monospace,monospace; font-size:11px; color:${rgb(T.mutedSoft)}; width:20px; flex:0 0 auto;`)}>{row.rankLabel}</span>
                      <span style={row.chipStyle}>{row.labelName}</span>
                    </div>
                    <div style={S(`font-size:12.5px; color:${rgb(T.body)}; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`)}>{row.title}</div>
                    <div style={S(`font-size:10.5px; color:${rgb(T.mutedSoft)}; margin-top:2px; font-family:'JetBrains Mono',ui-monospace,monospace;`)}>{row.meta}</div>
                  </div>
                  <div style={v.rankTrackStyle}>
                    <div style={row.barFillStyle}></div>
                    {row.isOpen && <span style={row.capStyle}></span>}
                    <span style={row.dayStyle}>{row.dayText}</span>
                  </div>
                </div>
              ))}

              {v.noRows && (
                <div style={S(`padding:26px 0; text-align:center; font-size:13px; color:${rgb(T.mutedSoft)};`)}>
                  条件に一致するイシューがありません。
                </div>
              )}
            </section>
          </>
        )}

        {/* Distribution tab: box-plot over ALL issues (filter-independent) */}
        {v.showDist && (
          <section style={S(`background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:16px; padding:18px 20px 20px; min-width:0;`)}>
            <div style={S("display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:3px;")}>
              <h2 style={S(`margin:0; font-size:16px; font-weight:700; color:${rgb(T.ink)};`)}>Close 日数の分布（箱ひげ）</h2>
              <div style={S("display:flex; gap:6px;")}>
                <button style={v.groupBtns.label.style} onClick={v.groupBtns.label.onClick}>ラベル</button>
                <button style={v.groupBtns.assignee.style} onClick={v.groupBtns.assignee.onClick}>担当者</button>
                <button style={v.groupBtns.milestone.style} onClick={v.groupBtns.milestone.onClick}>マイルストーン</button>
              </div>
            </div>
            <p style={S(`margin:0 0 12px; font-size:12px; color:${rgb(T.muted)}; line-height:1.5;`)}>箱＝Q1〜Q3、縦線＝中央値、ひげ＝1.5×IQR、点＝外れ値。Close済み3件未満は箱を描けないため各データ点＋中央値のみ表示。中央値が大きい順。行にホバーで詳細。全イシューが対象（フィルタ非依存）。</p>

            <div style={S(`display:grid; grid-template-columns:150px minmax(0,1fr); align-items:center; gap:12px; padding:7px 0; border-bottom:1px solid ${rgb(T.hairline)};`)}>
              <div></div>
              <div style={S("position:relative; height:15px;")}>
                {v.boxTicks.map((t, i) => (
                  <span key={i} style={t.style}>{t.label}</span>
                ))}
              </div>
            </div>

            {v.groups.map((g, i) => (
              <div key={i} style={g.rowStyle} onMouseEnter={g.onEnter}>
                <div style={S("min-width:0; display:flex; align-items:center; gap:8px;")}>
                  <span style={g.dotStyle}></span>
                  <div style={S("min-width:0;")}>
                    <div style={S(`font-size:12.5px; color:${rgb(T.body)}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`)}>{g.name}</div>
                    <div style={S(`font-size:10px; color:${rgb(T.mutedSoft)}; font-family:'JetBrains Mono',ui-monospace,monospace;`)}>{g.sub}</div>
                  </div>
                </div>
                <div style={v.boxTrackStyle}>
                  <div style={g.whiskerStyle}></div>
                  <div style={g.capLoStyle}></div>
                  <div style={g.capHiStyle}></div>
                  <div style={g.rectStyle}></div>
                  <div style={g.medianStyle}></div>
                  {g.outliers.map((o, j) => (
                    <div key={j} style={o.style}></div>
                  ))}
                </div>
              </div>
            ))}

            {/* Hover detail */}
            <div style={S(`margin-top:14px; padding:12px 14px; background:${rgb(T.canvasSoft)}; border:1px solid ${rgb(T.hairline)}; border-radius:12px;`)}>
              <div style={S("display:flex; align-items:center; gap:8px; margin-bottom:11px;")}>
                <span style={v.hoveredDetail.dotStyle}></span>
                <span style={S(`font-size:13px; font-weight:700; color:${rgb(T.ink)};`)}>{v.hoveredDetail.name}</span>
                <span style={S(`font-size:10.5px; color:${rgb(T.mutedSoft)};`)}>— 行にホバーで切替</span>
              </div>
              <div style={S("display:grid; grid-template-columns:repeat(auto-fit,minmax(66px,1fr)); gap:9px;")}>
                {v.hoveredDetail.cells.map((cell, i) => (
                  <div key={i}>
                    <div style={S(`font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color:${rgb(T.mutedSoft)}; font-weight:600;`)}>{cell.k}</div>
                    <div style={cell.vStyle}>{cell.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Calendar tab: schedule-variance metrics + milestone/issue timeline (filter-dependent) */}
        {v.showCal && (
          <>
            {/* Schedule-variance metrics (納期予実) — mirrors the ranking summary cards */}
            <div style={S("display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:14px;")}>
              <div style={S(`background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:12px; padding:15px 17px;`)}>
                <div style={S(`font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:600;`)}>納期遵守率</div>
                <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
                  <span style={S(`font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:${rgb(T.ok)};`)}>{cs.adherenceRate ?? "—"}</span>
                  {cs.adherenceRate !== null && <span style={S(`font-size:12.5px; color:${rgb(T.muted)};`)}>%</span>}
                </div>
                <div style={S(`margin-top:7px; font-size:11.5px; color:${rgb(T.mutedSoft)}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`)}>期限内 {cs.onTime} ／ 完了&期限あり {cs.closedWithDue} 件</div>
                <div style={S(`height:3px; border-radius:2px; margin-top:11px; background:${rgba(T.ok, .45)};`)}></div>
              </div>
              <div style={S(`background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:12px; padding:15px 17px;`)}>
                <div style={S(`font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:600;`)}>遅延完了</div>
                <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
                  <span style={S(`font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:${rgb(T.err)};`)}>{cs.late}</span>
                  <span style={S(`font-size:12.5px; color:${rgb(T.muted)};`)}>件</span>
                </div>
                <div style={S(`margin-top:7px; font-size:11.5px; color:${rgb(T.mutedSoft)}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`)}>{cs.avgLateDays !== null ? `平均 +${cs.avgLateDays} 日遅れ` : "遅延なし"}</div>
                <div style={S(`height:3px; border-radius:2px; margin-top:11px; background:${rgba(T.err, .45)};`)}></div>
              </div>
              <div style={S(`background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:12px; padding:15px 17px;`)}>
                <div style={S(`font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:600;`)}>期限超過（進行中）</div>
                <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
                  <span style={S(`font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:${rgb(T.warn)};`)}>{cs.overdue}</span>
                  <span style={S(`font-size:12.5px; color:${rgb(T.muted)};`)}>件</span>
                </div>
                <div style={S(`margin-top:7px; font-size:11.5px; color:${rgb(T.mutedSoft)};`)}>予定日を過ぎた未完了</div>
                <div style={S(`height:3px; border-radius:2px; margin-top:11px; background:${rgba(T.warn, .45)};`)}></div>
              </div>
            </div>

            <div className={st.fullscreen ? "meeting-shell" : undefined} style={fsWrap(st.fullscreen)}>
              <FilterControls v={v} st={st} showSort={false} presentation={st.fullscreen} />
              <CalendarView
                cal={v.calendar}
                fullscreen={st.fullscreen}
                onToggleFull={toggleMeetingMode}
                onExitFull={exitMeetingMode}
              />
            </div>
          </>
        )}

        {/* Executive schedule: owner swimlanes over official milestone dates. */}
        {v.showSchedule && (
          <div className={st.fullscreen ? "meeting-shell" : undefined} style={fsWrap(st.fullscreen)}>
            <FilterControls
              v={v}
              st={st}
              showSort={false}
              showStatus={false}
              summary={v.schedule.filterSummary}
              presentation={st.fullscreen}
            />
            <ExecutiveScheduleView
              schedule={v.schedule}
              repo={v.repo}
              startDay={st.scheduleStart}
              endDay={st.scheduleEnd}
              defaultStart={defaults.scheduleStart}
              defaultEnd={defaults.scheduleEnd}
              onRangeChange={(scheduleStart, scheduleEnd) => patch({ scheduleStart, scheduleEnd })}
              fullscreen={st.fullscreen}
              onToggleFull={toggleMeetingMode}
              onExitFull={exitMeetingMode}
              onClearFilters={() => patch({ labels: [], assignees: [], milestones: [] })}
            />
          </div>
        )}

        {/* Roadmap tab: milestone-progress timeline. Progress needs open+closed,
            so status filtering is hidden and counts run over all statuses. */}
        {v.showRoadmap && (
          <>
            <div style={S("display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:14px;")}>
              <div style={S(`background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:12px; padding:15px 17px;`)}>
                <div style={S(`font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:600;`)}>納期遵守率</div>
                <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
                  <span style={S(`font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:${rgb(T.ok)};`)}>{v.roadmap.summary.adherenceRate ?? "—"}</span>
                  {v.roadmap.summary.adherenceRate !== null && <span style={S(`font-size:12.5px; color:${rgb(T.muted)};`)}>%</span>}
                </div>
                <div style={S(`margin-top:7px; font-size:11.5px; color:${rgb(T.mutedSoft)}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`)}>期限内 {v.roadmap.summary.onTime} ／ 完了&期限あり {v.roadmap.summary.closedWithDue} 件</div>
                <div style={S(`height:3px; border-radius:2px; margin-top:11px; background:${rgba(T.ok, .45)};`)}></div>
              </div>
              <div style={S(`background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:12px; padding:15px 17px;`)}>
                <div style={S(`font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:600;`)}>遅延完了</div>
                <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
                  <span style={S(`font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:${rgb(T.err)};`)}>{v.roadmap.summary.late}</span>
                  <span style={S(`font-size:12.5px; color:${rgb(T.muted)};`)}>件</span>
                </div>
                <div style={S(`margin-top:7px; font-size:11.5px; color:${rgb(T.mutedSoft)}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`)}>{v.roadmap.summary.avgLateDays !== null ? `平均 +${v.roadmap.summary.avgLateDays} 日遅れ` : "遅延なし"}</div>
                <div style={S(`height:3px; border-radius:2px; margin-top:11px; background:${rgba(T.err, .45)};`)}></div>
              </div>
              <div style={S(`background:${rgb(T.card)}; border:1px solid ${rgb(T.hairline)}; border-radius:12px; padding:15px 17px;`)}>
                <div style={S(`font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:600;`)}>期限超過（進行中）</div>
                <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
                  <span style={S(`font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:${rgb(T.warn)};`)}>{v.roadmap.summary.overdue}</span>
                  <span style={S(`font-size:12.5px; color:${rgb(T.muted)};`)}>件</span>
                </div>
                <div style={S(`margin-top:7px; font-size:11.5px; color:${rgb(T.mutedSoft)};`)}>予定日を過ぎた未完了</div>
                <div style={S(`height:3px; border-radius:2px; margin-top:11px; background:${rgba(T.warn, .45)};`)}></div>
              </div>
            </div>

            <div className={st.fullscreen ? "meeting-shell" : undefined} style={fsWrap(st.fullscreen)}>
              <FilterControls
                v={v}
                st={st}
                showSort={false}
                showStatus={false}
                summary={v.roadmap.filterSummary}
                presentation={st.fullscreen}
              />
              <RoadmapView
                roadmap={v.roadmap}
                fullscreen={st.fullscreen}
                onToggleFull={toggleMeetingMode}
                onExitFull={exitMeetingMode}
              />
            </div>
          </>
        )}

        {/* Team tab: owner-first view, intentionally separate from schedule views. */}
        {v.showTeam && (
          <div className={st.fullscreen ? "meeting-shell" : undefined} style={fsWrap(st.fullscreen)}>
            <FilterControls
              v={v}
              st={st}
              showSort={false}
              showStatus={false}
              summary={`稼働 ${v.team.members.length} 名 / 進行中 ${v.team.open} 件`}
              presentation={st.fullscreen}
            />
            <TeamView
              overview={v.team}
              project={v.project}
              fetchedAt={data.fetchedAt}
              fullscreen={st.fullscreen}
              onToggleFull={toggleMeetingMode}
              onExitFull={exitMeetingMode}
              onClearFilters={() => patch({ labels: [], assignees: [], milestones: [] })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

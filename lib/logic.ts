// Presentation + analytics logic, ported from the imported design component
// (the `class Component extends DCLogic` in design/GitlabIssueDashboard.dc.html).
// Pure functions: given the fetched issues and the current UI state, produce
// every value/style the view binds to. No framework coupling beyond CSSProperties.

import type { CSSProperties } from "react";
import type { CalMode, DashState, Issue, LabelDef, Milestone } from "./types";

/* ------------------------------------------------------------------ *
 *  Config (were `$props` on the design component)
 * ------------------------------------------------------------------ */
export const TOP_N = 30; // ranking rows (design range 15–50)
export const DEFAULT_GROUP_BY: DashState["groupBy"] = "label";

/* ------------------------------------------------------------------ *
 *  Theme tokens + font stacks. Fonts resolve to the next/font CSS
 *  variables declared in app/layout.tsx (self-hosted, no CDN).
 * ------------------------------------------------------------------ */
export const T = {
  canvas: "16 16 16",
  canvasSoft: "22 22 22",
  card: "26 26 26",
  strong: "36 36 36",
  ink: "242 242 242",
  body: "189 189 189",
  muted: "139 148 158",
  mutedSoft: "110 118 129",
  primary: "0 217 146",
  hairline: "61 58 57",
  warn: "210 153 34",
  err: "248 81 73",
  ok: "16 185 129",
} as const;

export const SANS = "var(--font-inter), system-ui, -apple-system, sans-serif";
export const MONO =
  "var(--font-jetbrains-mono), ui-monospace, 'SFMono-Regular', monospace";

export const rgb = (t: string) => `rgb(${t})`;
export const rgba = (t: string, a: number) => `rgb(${t} / ${a})`;
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/* CSS string -> React style object; lets the design's literal inline styles be
 * used verbatim. Font-family literals from the design are remapped onto the
 * next/font variables. Mirrors the dc-runtime's cssToObj. */
function mapFont(f: string): string {
  if (f.includes("'Inter'")) return SANS;
  if (f.includes("'JetBrains Mono'")) return MONO;
  return f;
}
export function S(css: string): CSSProperties {
  const o: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    if (!prop) continue;
    const val = decl.slice(i + 1).trim();
    o[prop.startsWith("--") ? prop : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] =
      val;
  }
  if (typeof o.fontFamily === "string") o.fontFamily = mapFont(o.fontFamily);
  return o as CSSProperties;
}

/* Segmented-control button style — shared by the panel tabs, the status/sort/
 * group toggles, and the calendar mode/nav buttons. (Lifted out of renderVals
 * so buildCalendar can reuse it.) */
export const seg = (active: boolean): CSSProperties => ({
  padding: "7px 13px",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "12.5px",
  fontWeight: 600,
  fontFamily: SANS,
  letterSpacing: ".01em",
  transition: "all .15s",
  border: "1px solid " + (active ? rgba(T.primary, 0.5) : rgb(T.hairline)),
  background: active ? rgba(T.primary, 0.14) : rgb(T.canvasSoft),
  color: active ? rgb(T.primary) : rgb(T.body),
});

/* ------------------------------------------------------------------ *
 *  Calendar / timeline date math. Everything is a UTC integer day-index
 *  (floor(ms/DAY)) so positioning is pure integer arithmetic and immune to
 *  DST / local-midnight drift (and matches the server's UTC `asOf`).
 * ------------------------------------------------------------------ */
export const DAY = 86_400_000;
export const WEEK_START = 1; // 0=Sun .. 1=Mon. One-line locale switch.

/** ISO string -> UTC day-index. Bare "YYYY-MM-DD" parses as UTC midnight. */
export const dayIndex = (iso: string): number => Math.floor(Date.parse(iso) / DAY);
/** Day-of-week for a day-index, Sun=0..Sat=6 (1970-01-01 = Thursday = idx 0). */
export const dowOf = (idx: number): number => (((idx + 4) % 7) + 7) % 7;
/** Column 0..6 within a week that begins on WEEK_START. */
export const colOf = (idx: number): number => (dowOf(idx) - WEEK_START + 7) % 7;
export const weekStartOnOrBefore = (idx: number): number => idx - colOf(idx);

/** Visible window for a mode+anchor: the first week's start day-index and how
 *  many 7-day rows to draw (month = 4–6 whole weeks; twoweek = 2). */
export function windowFor(mode: CalMode, anchor: number): { weekStart: number; weeks: number } {
  if (mode === "twoweek") return { weekStart: weekStartOnOrBefore(anchor), weeks: 2 };
  const d = new Date(anchor * DAY);
  const firstIdx = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY);
  const lastIdx = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) / DAY);
  const weekStart = weekStartOnOrBefore(firstIdx);
  const weekEnd = weekStartOnOrBefore(lastIdx) + 6;
  return { weekStart, weeks: Math.round((weekEnd - weekStart + 1) / 7) };
}

/** Greedy interval-partition into lanes: mutates each item's `lane` and returns
 *  the lane count. Items touching on the same day still collide (strict `>`). */
export function assignLanes<T extends { startDay: number; endDay: number; lane: number }>(
  items: T[],
): number {
  const sorted = items.slice().sort((a, b) => a.startDay - b.startDay || b.endDay - a.endDay);
  const laneEnd: number[] = [];
  for (const it of sorted) {
    let placed = false;
    for (let L = 0; L < laneEnd.length; L++) {
      if (it.startDay > laneEnd[L]) {
        laneEnd[L] = it.endDay;
        it.lane = L;
        placed = true;
        break;
      }
    }
    if (!placed) {
      it.lane = laneEnd.length;
      laneEnd.push(it.endDay);
    }
  }
  return laneEnd.length;
}

/* ------------------------------------------------------------------ *
 *  Stats helpers (verbatim from the design)
 * ------------------------------------------------------------------ */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q,
    b = Math.floor(pos),
    r = pos - b;
  return sorted[b + 1] !== undefined ? sorted[b] + r * (sorted[b + 1] - sorted[b]) : sorted[b];
}
function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range || 1)),
    f = range / Math.pow(10, exp);
  let nf: number;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * Math.pow(10, exp);
}
export function makeTicks(maxVal: number) {
  const range = niceNum(Math.max(maxVal, 1), false);
  const step = niceNum(range / 5, true);
  const niceMax = Math.max(step, Math.ceil(maxVal / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + 1e-9; v += step) ticks.push(Math.round(v));
  return { niceMax, ticks, step };
}

/* ------------------------------------------------------------------ *
 *  View-model types
 * ------------------------------------------------------------------ */
export interface Btn {
  style: CSSProperties;
  onClick: () => void;
}
interface Tick {
  label: string;
  style: CSSProperties;
}
interface RankRow {
  rankLabel: string;
  labelName: string;
  title: string;
  meta: string;
  chipStyle: CSSProperties;
  isOpen: boolean;
  barFillStyle: CSSProperties;
  capStyle: CSSProperties;
  dayStyle: CSSProperties;
  dayText: string;
}
interface GroupOut {
  name: string;
  sub: string;
  dotStyle: CSSProperties;
  whiskerStyle: CSSProperties;
  capLoStyle: CSSProperties;
  capHiStyle: CSSProperties;
  rectStyle: CSSProperties;
  medianStyle: CSSProperties;
  outliers: { style: CSSProperties }[];
  rowStyle: CSSProperties;
  onEnter: () => void;
}
/** One selectable option in a label/assignee filter dropdown. */
export interface FilterOption {
  name: string;
  count: number;
  color?: string; // "R G B" for labels; omitted for assignees
  active: boolean;
  onToggle: () => void;
}
interface Cell {
  k: string;
  v: string | number;
  vStyle: CSSProperties;
}
interface HoveredDetail {
  name: string;
  dotStyle: CSSProperties;
  cells: Cell[];
}

/* ── calendar view-model ── */
/** Structured hover tooltip for a calendar bar (rendered as a rich popover by
 *  CalendarView instead of the native `title` attribute). Mirrors the box-plot
 *  `hoveredDetail.cells` `{k,v}` pattern. */
export interface CalTip {
  title: string; // "#101 API設計" (issue) or the milestone title
  labelName: string | null; // label chip text for issues; null for milestones
  color: string; // "R G B"
  rows: { k: string; v: string }[]; // 担当者 / 状態 / 期間 …
}
/** One row in a day-overflow popover: every item covering that day (bars beyond
 *  the lane cap are otherwise hidden). */
export interface CalDayItem {
  id: number;
  track: "milestone" | "issue";
  title: string;
  assignee: string;
  labelName: string;
  color: string; // "R G B"
  status: "open" | "closed" | "milestone";
  statusLabel: string; // 進行中 | 完了 | マイルストーン
  rangeLabel: string; // "7/6 – 7/13" (or single "7/8")
  isCheckpoint: boolean;
}
/** One clipped bar piece within a single week row. A bar crossing a week
 *  boundary yields one segment per row (isStart/isEnd flag the true ends).
 *  `kind:"overflow"` is a per-day "+N 件" chip standing in for bars past the
 *  lane cap (carries the day's full item list for the click-through popover). */
export interface CalSegment {
  key: string;
  kind: "bar" | "overflow";
  track: "milestone" | "issue";
  id: number;
  label: string; // rendered only when showLabel
  showLabel: boolean; // true on the row where the item actually starts
  meta: string; // legacy hover text (bars); unused by the renderer now
  colStart: number; // 0..6
  colSpan: number; // 1..7
  gridRowStart: number; // 1-based lane row (milestone lanes first, then issues)
  style: CSSProperties; // precomputed bar style incl. gridColumn/gridRow
  starStyle?: CSSProperties; // present on a checkpoint's end segment (★)
  isCheckpoint?: boolean; // true on every segment of a checkpoint issue bar
  tip?: CalTip; // present on kind:"bar" — rich hover content
  overflowLabel?: string; // "+N 件" (kind:"overflow")
  dayLabel?: string; // "7/8（水）" (kind:"overflow")
  items?: CalDayItem[]; // the day's full item list (kind:"overflow")
}
export interface CalDay {
  key: string;
  dayNum: number;
  isToday: boolean;
  isOtherMonth: boolean;
  isWeekend: boolean;
  headStyle: CSSProperties;
  numStyle: CSSProperties;
}
export interface CalWeek {
  key: string;
  days: CalDay[]; // length 7
  segments: CalSegment[];
  laneCount: number; // occupied lanes in this row (0 = empty)
  todayCol: number | null;
  headStyle: CSSProperties; // day-number row (7-col grid)
  gridStyle: CSSProperties; // bar grid container (relative, 7-col, auto-rows)
  todayStripStyle: CSSProperties | null; // tinted vertical strip behind bars
}
export interface CalVals {
  weeks: CalWeek[];
  weekdayLabels: string[]; // rotated to WEEK_START
  weekdayRowStyle: CSSProperties;
  title: string; // "2026年 7月" | "6/29 – 7/12"
  modeBtns: { month: Btn; twoweek: Btn };
  navPrev: Btn;
  navNext: Btn;
  navToday: Btn;
  laneHeight: number;
  empty: boolean;
  legend: { checkpointLabel: string };
}

export interface Vals {
  repo: string;
  asOf: string;
  filterSummary: string;
  openCount: number;
  openSub: string;
  closedCount: number;
  closeSub: string;
  avgDays: number;
  medDays: number;
  maxOpenDays: number;
  maxOpenSub: string;
  statusBtns: { all: Btn; open: Btn; closed: Btn };
  sortBtns: { linger: Btn; recent: Btn; oldest: Btn };
  groupBtns: { label: Btn; assignee: Btn; milestone: Btn };
  showRank: boolean;
  showDist: boolean;
  showCal: boolean;
  panelTabs: { ranking: Btn; dist: Btn; calendar: Btn };
  calendar: CalVals;
  labelOptions: FilterOption[];
  assigneeOptions: FilterOption[];
  totalCount: number;
  clearBtn: { onClick: () => void };
  clearAssigneeBtn: { onClick: () => void };
  gridStyle: CSSProperties;
  topN: number;
  rankTrackStyle: CSSProperties;
  rankTicks: Tick[];
  rows: RankRow[];
  noRows: boolean;
  boxTrackStyle: CSSProperties;
  boxTicks: Tick[];
  groups: GroupOut[];
  hoveredDetail: HoveredDetail;
}

export type Patch = (
  p: Partial<DashState> | ((s: DashState) => Partial<DashState>),
) => void;

/** Unique labels (name + color) with frequency, most-common first — powers the
 *  filter chips. */
export function deriveLabelDefs(issues: Issue[]): LabelDef[] {
  const m = new Map<string, { c: string; count: number }>();
  for (const it of issues) {
    const e = m.get(it.label.name);
    if (e) e.count++;
    else m.set(it.label.name, { c: it.label.color, count: 1 });
  }
  return [...m.entries()]
    .map(([n, v]) => ({ n, c: v.c, count: v.count }))
    .sort((a, b) => b.count - a.count || a.n.localeCompare(b.n));
}

/** Unique assignees with frequency, most-active first — powers the assignee filter chips. */
export function deriveAssignees(issues: Issue[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of issues) m.set(it.assignee, (m.get(it.assignee) || 0) + 1);
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ *
 *  renderVals — the whole view model
 * ------------------------------------------------------------------ */
export function renderVals(
  data: Issue[],
  st: DashState,
  patch: Patch,
  meta: { repo: string; asOf: string; milestones: Milestone[]; checkpointLabel: string },
): Vals {
  const showRank = st.panel === "ranking";
  const showDist = st.panel === "dist";
  const showCal = st.panel === "calendar";
  const todayIndex = dayIndex(meta.asOf);
  const setS = (p: Partial<DashState>) => () => patch(p);

  // ── filtering ──
  const pass = (it: Issue) =>
    (st.status === "all" || (st.status === "open" ? it.isOpen : !it.isOpen)) &&
    (st.labels.length === 0 || st.labels.includes(it.label.name)) &&
    (st.assignees.length === 0 || st.assignees.includes(it.assignee));
  const filtered = data.filter(pass);
  // Calendar reuses the same filtered issue set; milestones show unfiltered.
  const calendar = buildCalendar(
    filtered,
    meta.milestones,
    st,
    patch,
    todayIndex,
    meta.checkpointLabel,
  );
  const openArr = filtered.filter((i) => i.isOpen);
  const closedArr = filtered.filter((i) => !i.isOpen);
  const closedDur = closedArr.map((i) => i.linger).sort((a, b) => a - b);
  const avg = closedDur.length
    ? Math.round(closedDur.reduce((a, b) => a + b, 0) / closedDur.length)
    : 0;
  const med = closedDur.length ? Math.round(quantile(closedDur, 0.5)) : 0;
  const rate = filtered.length ? Math.round((closedArr.length / filtered.length) * 100) : 0;
  const maxOpen = openArr.reduce<{ linger: number; title: string }>(
    (m, i) => (i.linger > m.linger ? i : m),
    { linger: -1, title: "—" },
  );

  // ── ranking (gantt) ──
  let ranked = filtered.slice();
  if (st.sort === "linger") ranked.sort((a, b) => b.linger - a.linger);
  else if (st.sort === "recent") ranked.sort((a, b) => a.openedAgo - b.openedAgo);
  else ranked.sort((a, b) => b.openedAgo - a.openedAgo);
  const topN = TOP_N;
  ranked = ranked.slice(0, topN);
  const rankMax = ranked.reduce((m, i) => Math.max(m, i.linger), 1);
  const rt = makeTicks(rankMax);
  const rStepPct = (rt.step / rt.niceMax) * 100;
  const rankTicks: Tick[] = rt.ticks.map((v) => ({
    label: "" + v,
    style: {
      position: "absolute",
      left: (v / rt.niceMax) * 100 + "%",
      transform: "translateX(-50%)",
      top: 0,
      fontSize: "10px",
      color: rgb(T.mutedSoft),
      fontFamily: MONO,
    },
  }));
  const rankTrackStyle: CSSProperties = {
    position: "relative",
    height: "22px",
    display: "flex",
    alignItems: "center",
    backgroundImage: "linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)",
    backgroundSize: rStepPct + "% 100%",
  };

  const bucket = (d: number) => (d > 90 ? T.err : d > 30 ? T.warn : T.primary);
  const rows: RankRow[] = ranked.map((it, i) => {
    const c = bucket(it.linger),
      pct = Math.max(1.5, (it.linger / rt.niceMax) * 100);
    const fill: CSSProperties = it.isOpen
      ? {
          width: pct + "%",
          height: "12px",
          borderRadius: "4px",
          border: "1px solid " + rgba(c, 0.8),
          background:
            "repeating-linear-gradient(45deg," +
            rgba(c, 0.42) +
            " 0 5px," +
            rgba(c, 0.12) +
            " 5px 10px)",
          transition: "width .45s cubic-bezier(.4,0,.2,1)",
          flex: "0 0 auto",
          boxSizing: "border-box",
          // cap so the trailing day label always has room and never overflows the card
          maxWidth: "calc(100% - 92px)",
        }
      : {
          width: pct + "%",
          height: "12px",
          borderRadius: "4px",
          background: rgb(c),
          transition: "width .45s cubic-bezier(.4,0,.2,1)",
          flex: "0 0 auto",
          maxWidth: "calc(100% - 92px)",
        };
    return {
      rankLabel: i + 1 + ".",
      labelName: it.label.name,
      title: it.title,
      meta: "#" + it.id + " · " + it.assignee + " · " + it.milestone,
      chipStyle: {
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 8px",
        borderRadius: "999px",
        fontSize: "10.5px",
        fontWeight: 600,
        fontFamily: MONO,
        background: rgba(it.label.color, 0.16),
        color: rgb(it.label.color),
        border: "1px solid " + rgba(it.label.color, 0.32),
        flex: "0 0 auto",
      },
      isOpen: it.isOpen,
      barFillStyle: fill,
      capStyle: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: rgb(c),
        marginLeft: "6px",
        flex: "0 0 auto",
        animation: "gi-pulse 1.6s ease-in-out infinite",
      },
      dayStyle: {
        marginLeft: "7px",
        fontFamily: MONO,
        fontSize: "11px",
        fontWeight: 600,
        color: rgb(c),
        whiteSpace: "nowrap",
        flex: "0 0 auto",
      },
      dayText: it.isOpen ? it.linger + "日 経過" : it.linger + "日",
    };
  });

  // ── box plots ──
  const gb = st.groupBy;
  const keyOf = (it: Issue) =>
    gb === "label" ? it.label.name : gb === "assignee" ? it.assignee : it.milestone;
  const palette = [
    "0 217 146",
    "108 182 255",
    "212 167 44",
    "176 131 240",
    "255 166 87",
    "87 171 90",
    "248 81 73",
    "139 148 158",
  ];
  const map: Record<string, Issue[]> = {};
  data.forEach((it) => {
    const k = keyOf(it);
    (map[k] = map[k] || []).push(it);
  });
  let gi = 0;
  interface Stat {
    k: string;
    col: string;
    empty: boolean;
    md: number;
    n?: number;
    openN?: number;
    q1?: number;
    q3?: number;
    iqr?: number;
    min?: number;
    max?: number;
    wlo?: number;
    whi?: number;
    outs?: number[];
  }
  const groups: Required<Stat>[] = (
    Object.keys(map).map((k): Stat => {
      const items = map[k];
      const closed = items
        .filter((i) => !i.isOpen)
        .map((i) => i.linger)
        .sort((a, b) => a - b);
      const openN = items.filter((i) => i.isOpen).length;
      const col = gb === "label" ? items[0].label.color : palette[gi++ % palette.length];
      if (closed.length < 3) return { k, col, empty: true, md: 0 };
      const q1 = quantile(closed, 0.25),
        md = quantile(closed, 0.5),
        q3 = quantile(closed, 0.75);
      const iqr = q3 - q1,
        lf = q1 - 1.5 * iqr,
        uf = q3 + 1.5 * iqr;
      const inl = closed.filter((v) => v >= lf && v <= uf);
      const wlo = inl.length ? inl[0] : closed[0],
        whi = inl.length ? inl[inl.length - 1] : closed[closed.length - 1];
      const outs = closed.filter((v) => v < lf || v > uf);
      return {
        k,
        col,
        empty: false,
        n: closed.length,
        openN,
        q1,
        md,
        q3,
        iqr,
        min: closed[0],
        max: closed[closed.length - 1],
        wlo,
        whi,
        outs,
      };
    }) as Required<Stat>[]
  )
    .filter((g) => !g.empty)
    .sort((a, b) => b.md - a.md);

  const allClosed = data
    .filter((i) => !i.isOpen)
    .map((i) => i.linger)
    .sort((a, b) => a - b);
  let cap = quantile(allClosed, 0.96);
  groups.forEach((g) => {
    cap = Math.max(cap, g.whi);
  });
  const bt = makeTicks(cap);
  const boxMax = bt.niceMax,
    bStepPct = (bt.step / boxMax) * 100;
  const boxTicks: Tick[] = bt.ticks.map((v) => ({
    label: "" + v,
    style: {
      position: "absolute",
      left: (v / boxMax) * 100 + "%",
      transform: "translateX(-50%)",
      top: 0,
      fontSize: "10px",
      color: rgb(T.mutedSoft),
      fontFamily: MONO,
    },
  }));
  const P = (v: number) => Math.max(0, Math.min(100, (v / boxMax) * 100));
  const boxTrackStyle: CSSProperties = {
    position: "relative",
    height: "30px",
    borderRadius: "4px",
    backgroundImage: "linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)",
    backgroundSize: bStepPct + "% 100%",
  };

  const groupsOut: GroupOut[] = groups.map((g) => ({
    name: g.k,
    sub: "n=" + g.n + " · 中央 " + Math.round(g.md) + "日",
    dotStyle: {
      width: "9px",
      height: "9px",
      borderRadius: "2px",
      background: rgb(g.col),
      flex: "0 0 auto",
    },
    whiskerStyle: {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      left: P(g.wlo) + "%",
      width: P(g.whi) - P(g.wlo) + "%",
      height: "1.5px",
      background: rgba(g.col, 0.7),
    },
    capLoStyle: {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      left: P(g.wlo) + "%",
      width: "1.5px",
      height: "10px",
      background: rgba(g.col, 0.7),
    },
    capHiStyle: {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      left: P(g.whi) + "%",
      width: "1.5px",
      height: "10px",
      background: rgba(g.col, 0.7),
    },
    rectStyle: {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      left: P(g.q1) + "%",
      width: Math.max(0.8, P(g.q3) - P(g.q1)) + "%",
      height: "16px",
      borderRadius: "3px",
      background: rgba(g.col, 0.22),
      border: "1px solid " + rgba(g.col, 0.65),
      boxSizing: "border-box",
    },
    medianStyle: {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      left: P(g.md) + "%",
      width: "2.5px",
      height: "18px",
      borderRadius: "1px",
      background: rgb(g.col),
    },
    outliers: g.outs.slice(0, 40).map((v) => ({
      style: {
        position: "absolute",
        top: "50%",
        transform: "translate(-50%,-50%)",
        left: P(v) + "%",
        width: "5px",
        height: "5px",
        borderRadius: "50%",
        background: rgba(g.col, 0.85),
      },
    })),
    rowStyle: {
      display: "grid",
      gridTemplateColumns: "150px minmax(0,1fr)",
      alignItems: "center",
      gap: "12px",
      padding: "7px 0",
      borderBottom: "1px solid " + rgba(T.hairline, 0.5),
      cursor: "pointer",
      background: st.hovered === g.k ? rgba(g.col, 0.06) : "transparent",
      transition: "background .15s",
    },
    onEnter: () => patch({ hovered: g.k }),
  }));

  const hg = groups.find((g) => g.k === st.hovered) || groups[0] || null;
  const cellStyle = (accent: boolean): CSSProperties => ({
    fontFamily: MONO,
    fontSize: "14px",
    fontWeight: 600,
    marginTop: "3px",
    color: accent ? rgb(T.primary) : rgb(T.ink),
  });
  const hoveredDetail: HoveredDetail = hg
    ? {
        name: hg.k,
        dotStyle: {
          width: "10px",
          height: "10px",
          borderRadius: "2px",
          background: rgb(hg.col),
          flex: "0 0 auto",
        },
        cells: [
          { k: "件数", v: hg.n, vStyle: cellStyle(false) },
          { k: "未解決", v: hg.openN + "件", vStyle: cellStyle(false) },
          { k: "最小", v: Math.round(hg.min) + "日", vStyle: cellStyle(false) },
          { k: "Q1", v: Math.round(hg.q1) + "日", vStyle: cellStyle(false) },
          { k: "中央値", v: Math.round(hg.md) + "日", vStyle: cellStyle(true) },
          { k: "Q3", v: Math.round(hg.q3) + "日", vStyle: cellStyle(false) },
          { k: "最大", v: Math.round(hg.max) + "日", vStyle: cellStyle(false) },
          { k: "IQR", v: Math.round(hg.iqr) + "日", vStyle: cellStyle(false) },
          { k: "外れ値", v: hg.outs.length + "件", vStyle: cellStyle(false) },
        ],
      }
    : { name: "—", dotStyle: {}, cells: [] };

  // ── layout ──
  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr)",
    gap: "20px",
  };

  const labelOptions: FilterOption[] = deriveLabelDefs(data).map((l) => ({
    name: l.n,
    color: l.c,
    count: l.count,
    active: st.labels.includes(l.n),
    onToggle: () =>
      patch((s) => ({
        labels: s.labels.includes(l.n)
          ? s.labels.filter((x) => x !== l.n)
          : s.labels.concat(l.n),
      })),
  }));
  const assigneeOptions: FilterOption[] = deriveAssignees(data).map((a) => ({
    name: a.name,
    count: a.count,
    active: st.assignees.includes(a.name),
    onToggle: () =>
      patch((s) => ({
        assignees: s.assignees.includes(a.name)
          ? s.assignees.filter((x) => x !== a.name)
          : s.assignees.concat(a.name),
      })),
  }));

  return {
    repo: meta.repo,
    asOf: meta.asOf,
    filterSummary: filtered.length + " 件 / 全 " + data.length + " 件",
    openCount: openArr.length,
    openSub: "全 " + filtered.length + " 件中",
    closedCount: closedArr.length,
    closeSub: "解決率 " + rate + "%",
    avgDays: avg,
    medDays: med,
    maxOpenDays: maxOpen.linger < 0 ? 0 : maxOpen.linger,
    maxOpenSub: maxOpen.linger < 0 ? "—" : trunc(maxOpen.title, 20),
    statusBtns: {
      all: { style: seg(st.status === "all"), onClick: setS({ status: "all" }) },
      open: { style: seg(st.status === "open"), onClick: setS({ status: "open" }) },
      closed: { style: seg(st.status === "closed"), onClick: setS({ status: "closed" }) },
    },
    sortBtns: {
      linger: { style: seg(st.sort === "linger"), onClick: setS({ sort: "linger" }) },
      recent: { style: seg(st.sort === "recent"), onClick: setS({ sort: "recent" }) },
      oldest: { style: seg(st.sort === "oldest"), onClick: setS({ sort: "oldest" }) },
    },
    groupBtns: {
      label: { style: seg(gb === "label"), onClick: setS({ groupBy: "label" }) },
      assignee: { style: seg(gb === "assignee"), onClick: setS({ groupBy: "assignee" }) },
      milestone: { style: seg(gb === "milestone"), onClick: setS({ groupBy: "milestone" }) },
    },
    showRank,
    showDist,
    showCal,
    panelTabs: {
      ranking: { style: seg(st.panel === "ranking"), onClick: setS({ panel: "ranking" }) },
      dist: { style: seg(st.panel === "dist"), onClick: setS({ panel: "dist" }) },
      calendar: { style: seg(st.panel === "calendar"), onClick: setS({ panel: "calendar" }) },
    },
    calendar,
    labelOptions,
    assigneeOptions,
    totalCount: data.length,
    clearBtn: { onClick: () => patch({ labels: [] }) },
    clearAssigneeBtn: { onClick: () => patch({ assignees: [] }) },
    gridStyle,
    topN,
    rankTrackStyle,
    rankTicks,
    rows,
    noRows: rows.length === 0,
    boxTrackStyle,
    boxTicks,
    groups: groupsOut,
    hoveredDetail,
  };
}

/* ------------------------------------------------------------------ *
 *  buildCalendar — the timeline view model
 * ------------------------------------------------------------------ */
const MILESTONE_COLOR = "176 131 240"; // distinct purple accent for milestone bars
const CHECKPOINT_STAR = "255 199 74"; // gold ★ for checkpoint deadlines
/** Max issue lanes drawn per week before the surplus collapses into a per-day
 *  "+N 件" overflow chip. Milestones are exempt (few, always shown up top). */
const MAX_LANES = 3;
const JP_WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

interface CalItem {
  track: "milestone" | "issue";
  id: number;
  label: string;
  color: string;
  assignee: string; // "" for milestones
  labelName: string; // issue label name; "" for milestones
  startDay: number;
  endDay: number;
  isOpen: boolean;
  isCheckpoint: boolean;
  meta: string;
  lane: number;
}

const fmtMD = (idx: number): string => {
  const d = new Date(idx * DAY);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

/** Inclusive day-range label: single day, or "start – end". */
const calRange = (startDay: number, endDay: number): string =>
  startDay === endDay ? fmtMD(startDay) : `${fmtMD(startDay)} – ${fmtMD(endDay)}`;
/** "7/8（水）" — day label for the overflow popover header. */
const dayLabelOf = (d: number): string => `${fmtMD(d)}（${JP_WEEKDAY[dowOf(d)]}）`;

function itemStatus(it: CalItem): { status: "open" | "closed" | "milestone"; label: string } {
  if (it.track === "milestone") return { status: "milestone", label: "マイルストーン" };
  return it.isOpen ? { status: "open", label: "進行中" } : { status: "closed", label: "完了" };
}

/** Rich hover tooltip for a bar. */
function buildTip(it: CalItem): CalTip {
  const st = itemStatus(it);
  const rows: { k: string; v: string }[] = [];
  if (it.track === "issue") rows.push({ k: "担当者", v: it.assignee || "—" });
  rows.push({ k: "状態", v: st.label });
  rows.push({ k: "期間", v: calRange(it.startDay, it.endDay) });
  return {
    title: it.track === "issue" ? `#${it.id} ${it.label}` : it.label,
    labelName: it.track === "issue" ? it.labelName : null,
    color: it.color,
    rows,
  };
}

/** One item as it appears in the day-overflow popover. */
function toDayItem(it: CalItem): CalDayItem {
  const st = itemStatus(it);
  return {
    id: it.id,
    track: it.track,
    title: it.label,
    assignee: it.assignee,
    labelName: it.labelName,
    color: it.color,
    status: st.status,
    statusLabel: st.label,
    rangeLabel: calRange(it.startDay, it.endDay),
    isCheckpoint: it.isCheckpoint,
  };
}

/** Style for a per-day "+N 件" overflow chip (single column, overflow row). */
function overflowStyle(colStart: number, gridRowStart: number): CSSProperties {
  return {
    gridColumn: `${colStart + 1} / span 1`,
    gridRow: String(gridRowStart),
    alignSelf: "center",
    height: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
    boxSizing: "border-box",
    borderRadius: "5px",
    fontSize: "10px",
    fontFamily: SANS,
    fontWeight: 700,
    lineHeight: 1,
    color: rgb(T.muted),
    background: rgb(T.strong),
    border: "1px solid " + rgba(T.hairline, 0.9),
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
  };
}

/** Issue -> inclusive [startDay, endDay] day-index interval.
 *  start = start_date || created_at; end = closed_at (if closed) || due_date || today.
 *  Exported for unit tests. */
export function issueInterval(it: Issue, todayIndex: number): { startDay: number; endDay: number } {
  const startDay = it.startDate ? dayIndex(it.startDate) : dayIndex(it.createdAt);
  let endDay: number;
  if (!it.isOpen && it.closedAt) endDay = dayIndex(it.closedAt);
  else if (it.dueDate) endDay = dayIndex(it.dueDate);
  else endDay = todayIndex;
  if (Number.isNaN(endDay)) endDay = startDay;
  return { startDay, endDay: Math.max(endDay, startDay) };
}

/** Precomputed bar style. Left/right corners round only on the true start/end
 *  row so a wrapped bar reads as one continuous span. */
function barStyle(
  it: CalItem,
  isStart: boolean,
  isEnd: boolean,
  colStart: number,
  colSpan: number,
  gridRowStart: number,
): CSSProperties {
  const c = it.color;
  const rL = isStart ? "5px" : "1px";
  const rR = isEnd ? "5px" : "1px";
  const s: CSSProperties = {
    gridColumn: `${colStart + 1} / span ${colSpan}`,
    gridRow: String(gridRowStart),
    alignSelf: "center",
    height: "16px",
    display: "flex",
    alignItems: "center",
    gap: "3px",
    padding: "0 5px",
    boxSizing: "border-box",
    overflow: "hidden",
    whiteSpace: "nowrap",
    fontSize: "10px",
    fontFamily: SANS,
    fontWeight: 600,
    lineHeight: 1,
    borderRadius: `${rL} ${rR} ${rR} ${rL}`,
    color: rgb(T.ink),
    textShadow: "0 1px 2px rgb(0 0 0 / .55)",
    cursor: "default",
  };
  if (it.track === "milestone") {
    s.background = rgba(c, 0.2);
    s.border = "1px solid " + rgba(c, 0.6);
  } else if (it.isOpen) {
    // hatched = still open (mirrors the ranking gantt)
    s.background =
      "repeating-linear-gradient(45deg," +
      rgba(c, 0.5) +
      " 0 5px," +
      rgba(c, 0.16) +
      " 5px 10px)";
    s.border = "1px solid " + rgba(c, 0.75);
  } else {
    s.background = rgba(c, 0.9);
    s.border = "1px solid " + rgb(c);
  }
  // Checkpoints are always drawn (never collapsed) and stand out with a gold
  // ring + glow so deadlines are impossible to miss.
  if (it.track === "issue" && it.isCheckpoint) {
    s.border = "1px solid " + rgb(CHECKPOINT_STAR);
    s.boxShadow =
      "0 0 0 1px " + rgba(CHECKPOINT_STAR, 0.6) + ", 0 0 9px " + rgba(CHECKPOINT_STAR, 0.5);
  }
  return s;
}

/** Issues (already pass()-filtered) + milestones -> the calendar view model. */
export function buildCalendar(
  issues: Issue[],
  milestones: Milestone[],
  st: DashState,
  patch: Patch,
  todayIndex: number,
  checkpointLabel: string,
): CalVals {
  const { weekStart, weeks } = windowFor(st.calMode, st.calAnchor);
  const winStart = weekStart;
  const winEnd = weekStart + weeks * 7 - 1;
  const anchorMonth = new Date(st.calAnchor * DAY).getUTCMonth();

  // ── milestones -> intervals ──
  const mItemsAll: CalItem[] = [];
  for (const m of milestones) {
    const s = m.startDate ? dayIndex(m.startDate) : null;
    const e = m.dueDate ? dayIndex(m.dueDate) : null;
    if (s === null && e === null) continue; // no dates -> can't place
    let startDay = s ?? (e as number);
    let endDay = e ?? (s as number);
    if (Number.isNaN(startDay) || Number.isNaN(endDay)) continue;
    if (endDay < startDay) [startDay, endDay] = [endDay, startDay];
    mItemsAll.push({
      track: "milestone",
      id: m.id,
      label: m.title,
      color: MILESTONE_COLOR,
      assignee: "",
      labelName: "",
      startDay,
      endDay,
      isOpen: false,
      isCheckpoint: false,
      meta: `${m.title} · ${m.startDate ?? "?"} → ${m.dueDate ?? "?"}`,
      lane: 0,
    });
  }

  // ── issues -> intervals ──
  const iItemsAll: CalItem[] = [];
  for (const it of issues) {
    const { startDay, endDay } = issueInterval(it, todayIndex);
    if (Number.isNaN(startDay)) continue; // no valid start -> skip
    iItemsAll.push({
      track: "issue",
      id: it.id,
      label: it.title,
      color: it.label.color,
      assignee: it.assignee,
      labelName: it.label.name,
      startDay,
      endDay,
      isOpen: it.isOpen,
      isCheckpoint: it.isCheckpoint,
      meta: `#${it.id} ${it.title} · ${it.assignee}`,
      lane: 0,
    });
  }

  // ── clip to the visible window, then assign lanes per band ──
  // Bands stack top-to-bottom: milestones, checkpoints (always shown), then
  // regular issues (the only band subject to the lane cap / overflow).
  const inWin = (it: CalItem) => it.endDay >= winStart && it.startDay <= winEnd;
  const mItems = mItemsAll.filter(inWin);
  const iItems = iItemsAll.filter(inWin);
  const cpItems = iItems.filter((it) => it.isCheckpoint);
  const regItems = iItems.filter((it) => !it.isCheckpoint);
  const mLaneCount = assignLanes(mItems);
  const cpLaneCount = assignLanes(cpItems);
  assignLanes(regItems);
  const issueOffset = mLaneCount + cpLaneCount;
  // twoweek shows only 2 rows, so there is room for twice as many issue lanes
  // before collapsing into overflow chips.
  const maxLanes = st.calMode === "twoweek" ? MAX_LANES * 2 : MAX_LANES;

  const laneHeight = 19;

  // ── per-week rows ──
  const weeksOut: CalWeek[] = [];
  for (let r = 0; r < weeks; r++) {
    const rowStart = weekStart + r * 7;
    const rowEnd = rowStart + 6;

    const days: CalDay[] = [];
    for (let c = 0; c < 7; c++) {
      const d = rowStart + c;
      const date = new Date(d * DAY);
      const isToday = d === todayIndex;
      const dw = dowOf(d);
      const isWeekend = dw === 0 || dw === 6;
      const isOtherMonth = st.calMode === "month" && date.getUTCMonth() !== anchorMonth;
      days.push({
        key: "d" + d,
        dayNum: date.getUTCDate(),
        isToday,
        isOtherMonth,
        isWeekend,
        headStyle: {
          padding: "3px 6px 2px",
          borderLeft: "1px solid " + rgba(T.hairline, 0.5),
          borderTop: isToday ? "2px solid " + rgb(T.primary) : "2px solid transparent",
          background: isToday ? rgba(T.primary, 0.08) : "transparent",
          boxSizing: "border-box",
        },
        numStyle: {
          fontFamily: MONO,
          fontSize: "11px",
          fontWeight: isToday ? 700 : 500,
          color: isToday
            ? rgb(T.primary)
            : isOtherMonth
              ? rgba(T.mutedSoft, 0.5)
              : isWeekend
                ? rgb(T.muted)
                : rgb(T.body),
        },
      });
    }

    const segments: CalSegment[] = [];
    let laneCount = 0;
    const emit = (it: CalItem, laneOffset: number) => {
      if (it.endDay < rowStart || it.startDay > rowEnd) return;
      const segStart = Math.max(it.startDay, rowStart);
      const segEnd = Math.min(it.endDay, rowEnd);
      const colStart = segStart - rowStart;
      const colSpan = segEnd - segStart + 1;
      const isStart = it.startDay >= rowStart;
      const isEnd = it.endDay <= rowEnd;
      const gridRowStart = laneOffset + it.lane + 1;
      laneCount = Math.max(laneCount, gridRowStart);
      const s: CalSegment = {
        key: `${it.track}-${it.id}-r${r}`,
        kind: "bar",
        track: it.track,
        id: it.id,
        label: it.label,
        showLabel: isStart,
        meta: it.meta,
        colStart,
        colSpan,
        gridRowStart,
        style: barStyle(it, isStart, isEnd, colStart, colSpan, gridRowStart),
        isCheckpoint: it.track === "issue" && it.isCheckpoint,
        tip: buildTip(it),
      };
      if (it.isCheckpoint && isEnd) {
        s.starStyle = {
          marginLeft: "auto",
          flex: "0 0 auto",
          fontSize: "13px",
          lineHeight: 1,
          color: rgb(CHECKPOINT_STAR),
          textShadow: "0 0 6px " + rgba(CHECKPOINT_STAR, 0.9),
        };
      }
      segments.push(s);
    };
    // Milestones + checkpoints always shown; regular issue bars up to the cap.
    for (const it of mItems) emit(it, 0);
    for (const it of cpItems) emit(it, mLaneCount);
    for (const it of regItems) if (it.lane < maxLanes) emit(it, issueOffset);

    // Per-day overflow chips for the regular issues past the cap. The chip's
    // count is how many are hidden that day; the popover lists ALL items
    // covering it (milestones + checkpoints + regular issues).
    const covers = (it: CalItem, d: number) => it.startDay <= d && it.endDay >= d;
    const overflowRow = issueOffset + maxLanes + 1;
    for (let c = 0; c < 7; c++) {
      const d = rowStart + c;
      const hidden = regItems.filter((it) => it.lane >= maxLanes && covers(it, d)).length;
      if (hidden === 0) continue;
      const items: CalDayItem[] = [
        ...mItems.filter((it) => covers(it, d)),
        ...cpItems.filter((it) => covers(it, d)),
        ...regItems.filter((it) => covers(it, d)).sort((a, b) => a.lane - b.lane),
      ].map(toDayItem);
      laneCount = Math.max(laneCount, overflowRow);
      segments.push({
        key: `overflow-${d}-r${r}`,
        kind: "overflow",
        track: "issue",
        id: -d - 1, // synthetic, negative to avoid colliding with real ids
        label: `+${hidden}`,
        showLabel: true,
        meta: "",
        colStart: c,
        colSpan: 1,
        gridRowStart: overflowRow,
        style: overflowStyle(c, overflowRow),
        overflowLabel: `+${hidden} 件`,
        dayLabel: dayLabelOf(d),
        items,
      });
    }

    const todayCol = todayIndex >= rowStart && todayIndex <= rowEnd ? todayIndex - rowStart : null;
    weeksOut.push({
      key: "w" + rowStart,
      days,
      segments,
      laneCount,
      todayCol,
      headStyle: { display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))" },
      gridStyle: {
        position: "relative",
        display: "grid",
        gridTemplateColumns: "repeat(7,minmax(0,1fr))",
        gridAutoRows: laneHeight + "px",
        rowGap: "3px",
        padding: "5px 0 7px",
        minHeight: laneHeight + "px",
        borderTop: "1px solid " + rgba(T.hairline, 0.4),
      },
      todayStripStyle:
        todayCol !== null
          ? {
              position: "absolute",
              top: 0,
              bottom: 0,
              left: (todayCol / 7) * 100 + "%",
              width: 100 / 7 + "%",
              background: rgba(T.primary, 0.06),
              pointerEvents: "none",
            }
          : null,
    });
  }

  const weekdayLabels = Array.from({ length: 7 }, (_, i) => JP_WEEKDAY[(WEEK_START + i) % 7]);

  const title =
    st.calMode === "month"
      ? (() => {
          const d = new Date(st.calAnchor * DAY);
          return `${d.getUTCFullYear()}年 ${d.getUTCMonth() + 1}月`;
        })()
      : `${fmtMD(winStart)} – ${fmtMD(winEnd)}`;

  const navTo = (idx: number) => () => patch({ calAnchor: idx });
  const stepMonth = (dir: number): number => {
    const d = new Date(st.calAnchor * DAY);
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1) / DAY);
  };
  const prevAnchor = st.calMode === "twoweek" ? st.calAnchor - 14 : stepMonth(-1);
  const nextAnchor = st.calMode === "twoweek" ? st.calAnchor + 14 : stepMonth(1);

  return {
    weeks: weeksOut,
    weekdayLabels,
    weekdayRowStyle: {
      display: "grid",
      gridTemplateColumns: "repeat(7,minmax(0,1fr))",
      marginTop: "4px",
    },
    title,
    modeBtns: {
      month: { style: seg(st.calMode === "month"), onClick: () => patch({ calMode: "month" }) },
      twoweek: {
        style: seg(st.calMode === "twoweek"),
        onClick: () => patch({ calMode: "twoweek" }),
      },
    },
    navPrev: { style: seg(false), onClick: navTo(prevAnchor) },
    navNext: { style: seg(false), onClick: navTo(nextAnchor) },
    navToday: { style: seg(false), onClick: navTo(todayIndex) },
    laneHeight,
    empty: mItems.length === 0 && iItems.length === 0,
    legend: { checkpointLabel },
  };
}

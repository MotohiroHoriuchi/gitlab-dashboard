// Presentation + analytics logic, ported from the imported design component
// (the `class Component extends DCLogic` in design/GitlabIssueDashboard.dc.html).
// Pure functions: given the fetched issues and the current UI state, produce
// every value/style the view binds to. No framework coupling beyond CSSProperties.

import type { CSSProperties } from "react";
import type { CalMode, DashState, Issue, LabelDef, Milestone, RelatedRef } from "./types";

/* ------------------------------------------------------------------ *
 *  Config (were `$props` on the design component)
 * ------------------------------------------------------------------ */
export const TOP_N = 30; // ranking rows (design range 15–50)
export const DEFAULT_GROUP_BY: DashState["groupBy"] = "label";

/* ------------------------------------------------------------------ *
 *  Theme tokens + font stacks. Fonts resolve to the next/font CSS
 *  variables declared in app/layout.tsx (self-hosted, no CDN).
 *  Light "warm paper" theme per DESIGN.md (Notion-derived): page sits on
 *  canvas, surfaces are white and separated by hairline + barely-there
 *  shadows (SH_1/SH_2), and primary is the single structural accent.
 *  canvasSoft === card is deliberate — Notion differentiates surfaces by
 *  border/shadow, not fill.
 * ------------------------------------------------------------------ */
export const T = {
  canvas: "246 245 244", // #f6f5f4 warm paper
  canvasSoft: "255 255 255",
  card: "255 255 255",
  strong: "239 238 236", // chip/badge fill
  ink: "28 27 26", // #1c1b1a near-black
  body: "49 48 46", // #31302e
  muted: "97 93 89", // #615d59
  mutedSoft: "163 158 152", // #a39e98 — TS_MD+ asides only
  primary: "0 117 222", // #0075de Notion Blue
  onPrimary: "255 255 255", // text/glyphs on primary fills
  hairline: "230 230 230", // #e6e6e6
  warn: "180 83 9", // #b45309
  err: "209 36 47", // #d1242f
  ok: "26 127 55", // #1a7f37
} as const;

/* Barely-there layered shadows (DESIGN.md Elevation). SH_1: raised cards /
 * floating buttons. SH_2: modals, popovers, tooltips. */
export const SH_1 =
  "0 0.2px 1px rgba(0,0,0,.01), 0 0.8px 2.9px rgba(0,0,0,.02), 0 2px 7.8px rgba(0,0,0,.027), 0 4px 18px rgba(0,0,0,.04)";
export const SH_2 =
  "0 1px 2px rgba(0,0,0,.02), 0 3px 8px rgba(0,0,0,.03), 0 8px 20px rgba(0,0,0,.04), 0 14px 36px rgba(0,0,0,.05), 0 23px 52px rgba(0,0,0,.05)";

export const SANS = "var(--font-inter), system-ui, -apple-system, sans-serif";
export const MONO =
  "var(--font-jetbrains-mono), ui-monospace, 'SFMono-Regular', monospace";

/* Type scale (px) for the calendar/roadmap views. Every font-size in those
 * views sits on one of these four steps — px literals inside S("…") strings
 * must use the same values. Contrast rules on the light canvas: at TS_SM and
 * below never use T.mutedSoft (minimum: T.muted + weight 500); lane-primary
 * content (bar labels, "+N" chips, tick ids) uses T.ink; T.mutedSoft is
 * reserved for TS_MD+ asides and decoration. Overlays (tooltip/popovers) and
 * chrome (legends, headers) sit a step above lane-bound text — they cost no
 * lane density, so they get the readability budget first. */
export const TS_XS = 11; // badges, tick ids, auxiliary chips (hard floor)
export const TS_SM = 12.5; // bar labels, meta lines, legends, small headings
export const TS_MD = 13.5; // popover body, day numbers, values
export const TS_LG = 15; // tooltip / popover / KPI row titles

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
  fontSize: "13px",
  fontWeight: 600,
  fontFamily: SANS,
  letterSpacing: ".01em",
  transition: "all .15s",
  border: "1px solid " + (active ? rgba(T.primary, 0.45) : rgb(T.hairline)),
  background: active ? rgba(T.primary, 0.12) : rgb(T.canvasSoft),
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

/* ── non-working weekdays (calendar column hiding) ── */

export const DEFAULT_HIDDEN_DOWS = [0, 6]; // Sun + Sat hidden by default

/** Defensive normalization for values coming from localStorage: keep unique
 *  integers 0..6; anything malformed — or all 7 days hidden — falls back to
 *  the default so the calendar always keeps at least one column. */
export function sanitizeHiddenDows(v: unknown): number[] {
  if (!Array.isArray(v)) return DEFAULT_HIDDEN_DOWS;
  const set = new Set<number>();
  for (const x of v) if (Number.isInteger(x) && x >= 0 && x <= 6) set.add(x as number);
  if (set.size >= 7) return DEFAULT_HIDDEN_DOWS;
  return [...set].sort((a, b) => a - b);
}

/** Toggle weekday `dw` in the hidden set. Hiding the last visible column is a
 *  no-op (the input is returned unchanged). */
export function toggleDow(hidden: number[], dw: number): number[] {
  if (hidden.includes(dw)) return hidden.filter((x) => x !== dw);
  if (hidden.length >= 6) return hidden; // would leave zero visible columns
  return hidden.concat(dw).sort((a, b) => a - b);
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
  rows: { k: string; v: string; tone?: VarianceTone }[]; // 担当者 / 状態 / 期間 / 期限 / 予実
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
  varianceLabel: string; // schedule variance ("" when not measurable)
  varianceTone: VarianceTone;
  relLine: string; // "親 #10 · 子 #11, #13 · 関連 #15" ("" when unrelated)
  hidden: boolean; // collapsed past the lane cap — the chip is its only stand-in
}
/** One clipped bar piece within a single week row. A bar crossing a week
 *  boundary yields one segment per row (isStart/isEnd flag the true ends).
 *  `kind:"overflow"` is a per-day "+N 件" chip standing in for bars past the
 *  lane cap (carries the day's full item list for the click-through popover). */
export interface CalSegment {
  key: string;
  kind: "bar" | "overflow" | "overrun" | "duetick";
  track: "milestone" | "issue";
  id: number;
  label: string; // rendered only when showLabel
  showLabel: boolean; // true on the row where the item actually starts
  meta: string; // legacy hover text (bars); unused by the renderer now
  colStart: number; // compressed visible-column index (0..nCols-1)
  colSpan: number; // 1..nCols
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
  days: CalDay[]; // visible (non-hidden) days only, length = column count
  segments: CalSegment[];
  laneCount: number; // occupied lanes in this row (0 = empty)
  todayCol: number | null; // compressed column of today; null if out of row or hidden
  headStyle: CSSProperties; // day-number row grid (one column per visible day)
  gridStyle: CSSProperties; // bar grid container (relative, visible cols, auto-rows)
  weekendStrips: CSSProperties[]; // tinted vertical bands behind weekend columns
  todayStripStyle: CSSProperties | null; // tinted vertical strip behind bars
}
/** One weekday chip of the "表示曜日" toggle group. */
export interface DowToggle {
  label: string; // "月".."日"
  active: boolean; // currently visible
  disabled: boolean; // hiding this would leave zero columns
  style: CSSProperties;
  onClick: () => void;
}
export interface CalVals {
  weeks: CalWeek[];
  weekdayLabels: string[]; // visible weekdays only, rotated to WEEK_START
  weekdayRowStyle: CSSProperties;
  title: string; // "2026年 7月" | "6/29 – 7/12"
  modeBtns: { month: Btn; twoweek: Btn };
  navPrev: Btn;
  navNext: Btn;
  navToday: Btn;
  dowToggles: DowToggle[]; // 7 chips in WEEK_START order (non-working-day setting)
  laneHeight: number;
  empty: boolean;
  legend: { checkpointLabel: string };
  summary: ScheduleSummary; // 納期予実 KPIs over the filtered issue set
  relations: CalRelIndex; // click-focus lookup: selected bar key -> related bar keys
}

/** Owner-first team view model. Schedule views remain the source of exact
 * dates; this answers the separate question: "who owns what, and where is the
 * risk?" */
export interface TeamFocusItem {
  id: number;
  title: string;
  milestone: string;
  dueLabel: string;
  risk: "overdue" | "soon" | "normal";
  isCheckpoint: boolean;
}
export interface TeamMemberOverview {
  name: string;
  open: number;
  overdue: number;
  dueSoon: number;
  focus: TeamFocusItem[];
}
export interface TeamOverview {
  members: TeamMemberOverview[];
  open: number;
  overdue: number;
  dueSoon: number;
}

export type ExecutiveSchedulePhase = "active" | "future" | "overdue";
export interface ExecutiveScheduleIssue {
  id: number;
  title: string;
  dueLabel: string;
  label: string;
  risk: "overdue" | "soon" | "normal";
  isCheckpoint: boolean;
}
export interface ExecutiveScheduleBar {
  key: string;
  milestoneId: number;
  title: string;
  startDay: number;
  endDay: number;
  left: number;
  width: number;
  sublane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  phase: ExecutiveSchedulePhase;
  openCount: number;
  doneCount: number;
  totalCount: number;
  progress: number;
  overdue: number;
  focusTitle: string;
  issues: ExecutiveScheduleIssue[];
}
export interface ExecutiveScheduleLane {
  name: string;
  open: number;
  milestoneCount: number;
  overdue: number;
  sublaneCount: number;
  bars: ExecutiveScheduleBar[];
}
export interface ExecutiveUnscheduledItem {
  milestoneId: number | null;
  title: string;
  openCount: number;
  issues: ExecutiveScheduleIssue[];
}
export interface ExecutiveUnscheduledGroup {
  name: string;
  items: ExecutiveUnscheduledItem[];
}
export interface ExecutiveAxisMark {
  x: number;
  label: string;
  date: string;
  kind: "month" | "week";
}
export interface ExecutiveScheduleVals {
  lanes: ExecutiveScheduleLane[];
  unscheduled: ExecutiveUnscheduledGroup[];
  axisMarks: ExecutiveAxisMark[];
  todayX: number | null;
  rangeDays: number;
  rangeLabel: string;
  open: number;
  people: number;
  milestones: number;
  overdue: number;
  outOfRange: number;
  empty: boolean;
  filterSummary: string;
}

export interface Vals {
  repo: string;
  project: string;
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
  showSchedule: boolean;
  showRoadmap: boolean;
  showTeam: boolean;
  panelTabs: { ranking: Btn; dist: Btn; calendar: Btn; schedule: Btn; roadmap: Btn; team: Btn };
  calendar: CalVals;
  schedule: ExecutiveScheduleVals;
  roadmap: RoadmapVals;
  team: TeamOverview;
  labelOptions: FilterOption[];
  assigneeOptions: FilterOption[];
  milestoneOptions: FilterOption[];
  totalCount: number;
  clearBtn: { onClick: () => void };
  clearAssigneeBtn: { onClick: () => void };
  clearMilestoneBtn: { onClick: () => void };
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

/** Labels an issue is filtered by: ALL of its labels, or its representative
 *  ("未分類" when it has none) so unlabeled issues stay filterable. Display,
 *  chips and the distribution grouping still use the single representative
 *  label (it.label) — only filtering + the filter dropdown span every label. */
export function issueFilterLabels(it: Issue): string[] {
  return it.labelNames.length ? it.labelNames : [it.label.name];
}

/** Unique labels (name + color) with frequency, most-common first — powers the
 *  filter dropdown. Counts every label an issue carries (not just the leading
 *  one). Colors are only known for labels that lead some issue (it.label);
 *  labels that never lead fall back to a neutral tone. */
export function deriveLabelDefs(issues: Issue[]): LabelDef[] {
  const colorOf = new Map<string, string>();
  for (const it of issues) if (!colorOf.has(it.label.name)) colorOf.set(it.label.name, it.label.color);
  const count = new Map<string, number>();
  for (const it of issues) for (const n of issueFilterLabels(it)) count.set(n, (count.get(n) ?? 0) + 1);
  return [...count.entries()]
    .map(([n, c]) => ({ n, c: colorOf.get(n) ?? T.muted, count: c }))
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

/** Unique milestone titles with issue frequency, most-populated first — powers
 *  the milestone filter. Fetched milestones with zero issues (empty planning
 *  buckets) are appended with count 0 so they stay selectable — picking one
 *  shows just its bar on the calendar. */
export function deriveMilestones(
  issues: Issue[],
  milestones: Milestone[],
): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of issues) m.set(it.milestone, (m.get(it.milestone) || 0) + 1);
  for (const ms of milestones) if (!m.has(ms.title)) m.set(ms.title, 0);
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
  meta: {
    repo: string;
    project: string;
    asOf: string;
    milestones: Milestone[];
    checkpointLabel: string;
  },
): Vals {
  const showRank = st.panel === "ranking";
  const showDist = st.panel === "dist";
  const showCal = st.panel === "calendar";
  const showSchedule = st.panel === "schedule";
  const showRoadmap = st.panel === "roadmap";
  const showTeam = st.panel === "team";
  const todayIndex = dayIndex(meta.asOf);
  const setS = (p: Partial<DashState>) => () => patch(p);

  // ── filtering ──
  // passScope = label/assignee/milestone (status-independent). The roadmap needs
  // both open AND closed issues to compute progress/burndown, so it filters on
  // passScope only; every other view adds the status predicate on top.
  const passScope = (it: Issue) =>
    (st.labels.length === 0 || issueFilterLabels(it).some((n) => st.labels.includes(n))) &&
    (st.assignees.length === 0 || st.assignees.includes(it.assignee)) &&
    (st.milestones.length === 0 || st.milestones.includes(it.milestone));
  const pass = (it: Issue) =>
    (st.status === "all" || (st.status === "open" ? it.isOpen : !it.isOpen)) && passScope(it);
  const filtered = data.filter(pass);
  // Calendar reuses the same filtered issue set. Milestone bars follow the
  // milestone filter (only the selected ones stay); other filters leave them.
  const calMilestones =
    st.milestones.length === 0
      ? meta.milestones
      : meta.milestones.filter((m) => st.milestones.includes(m.title));
  const calendar = buildCalendar(
    filtered,
    calMilestones,
    st,
    patch,
    todayIndex,
    meta.checkpointLabel,
  );
  const roadmap = buildMilestoneCalendar(
    data.filter(passScope),
    calMilestones,
    todayIndex,
    meta.checkpointLabel,
  );
  const schedule = buildExecutiveSchedule(
    data.filter(passScope),
    calMilestones,
    todayIndex,
    st.scheduleStart,
    st.scheduleEnd,
  );
  const team = buildTeamOverview(data.filter(passScope), todayIndex);
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
      fontSize: "11px",
      color: rgb(T.mutedSoft),
      fontFamily: MONO,
    },
  }));
  const rankTrackStyle: CSSProperties = {
    position: "relative",
    height: "22px",
    display: "flex",
    alignItems: "center",
    backgroundImage: `linear-gradient(90deg, ${rgba(T.ink, 0.06)} 1px, transparent 1px)`,
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
          border: "1px solid " + rgba(c, 0.7),
          background:
            "repeating-linear-gradient(45deg," +
            rgba(c, 0.3) +
            " 0 5px," +
            rgba(c, 0.1) +
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
        background: rgba(it.label.color, 0.15),
        color: rgb(T.ink),
        border: "1px solid " + rgba(it.label.color, 0.45),
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
  // series colors darkened for the light canvas (fills stay translucent)
  const palette = [
    "5 150 105",
    "37 99 235",
    "180 83 9",
    "124 58 237",
    "234 88 12",
    "13 148 136",
    "220 38 38",
    "87 83 78",
  ];
  const map: Record<string, Issue[]> = {};
  data.forEach((it) => {
    const k = keyOf(it);
    (map[k] = map[k] || []).push(it);
  });
  let gi = 0;
  // A box needs ≥3 closed issues for meaningful quartiles. Groups with 1–2 closed
  // ("sparse") are NOT hidden — they render as their raw points + a median tick, so
  // every milestone/label/assignee with any closed issue stays visible (otherwise a
  // young project shows only the legacy no-milestone "Backlog" bucket). 0 closed →
  // dropped: a Close-days chart has nothing to plot for it.
  interface Base {
    k: string;
    col: string;
    md: number;
    n: number;
    openN: number;
    min: number;
    max: number;
  }
  type Stat =
    | ({ mode: "box"; q1: number; q3: number; iqr: number; wlo: number; whi: number; outs: number[] } & Base)
    | ({ mode: "sparse"; vals: number[] } & Base)
    | ({ mode: "empty" } & Base);
  type Group = Extract<Stat, { mode: "box" | "sparse" }>;
  const groups: Group[] = Object.keys(map)
    .map((k): Stat => {
      const items = map[k];
      const closed = items
        .filter((i) => !i.isOpen)
        .map((i) => i.linger)
        .sort((a, b) => a - b);
      const openN = items.filter((i) => i.isOpen).length;
      const col = gb === "label" ? items[0].label.color : palette[gi++ % palette.length];
      const base: Base = {
        k,
        col,
        md: quantile(closed, 0.5),
        n: closed.length,
        openN,
        min: closed[0] ?? 0,
        max: closed[closed.length - 1] ?? 0,
      };
      if (closed.length === 0) return { ...base, mode: "empty" };
      if (closed.length < 3) return { ...base, mode: "sparse", vals: closed };
      const q1 = quantile(closed, 0.25),
        q3 = quantile(closed, 0.75);
      const iqr = q3 - q1,
        lf = q1 - 1.5 * iqr,
        uf = q3 + 1.5 * iqr;
      const inl = closed.filter((v) => v >= lf && v <= uf);
      const wlo = inl.length ? inl[0] : closed[0],
        whi = inl.length ? inl[inl.length - 1] : closed[closed.length - 1];
      const outs = closed.filter((v) => v < lf || v > uf);
      return { ...base, mode: "box", q1, q3, iqr, wlo, whi, outs };
    })
    .filter((g): g is Group => g.mode !== "empty")
    .sort((a, b) => b.md - a.md);

  const allClosed = data
    .filter((i) => !i.isOpen)
    .map((i) => i.linger)
    .sort((a, b) => a - b);
  let cap = quantile(allClosed, 0.96);
  // Only whiskers set the axis span — sparse points (like box outliers) clamp to the
  // right edge via P() rather than stretching the scale.
  groups.forEach((g) => {
    if (g.mode === "box") cap = Math.max(cap, g.whi);
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
      fontSize: "11px",
      color: rgb(T.mutedSoft),
      fontFamily: MONO,
    },
  }));
  const P = (v: number) => Math.max(0, Math.min(100, (v / boxMax) * 100));
  const boxTrackStyle: CSSProperties = {
    position: "relative",
    height: "30px",
    borderRadius: "4px",
    backgroundImage: `linear-gradient(90deg, ${rgba(T.ink, 0.06)} 1px, transparent 1px)`,
    backgroundSize: bStepPct + "% 100%",
  };

  // A single plotted point (box outlier, or one of a sparse group's raw values).
  const dotAt = (v: number, col: string): { style: CSSProperties } => ({
    style: {
      position: "absolute",
      top: "50%",
      transform: "translate(-50%,-50%)",
      left: P(v) + "%",
      width: "5px",
      height: "5px",
      borderRadius: "50%",
      background: rgba(col, 0.85),
    },
  });
  const groupsOut: GroupOut[] = groups.map((g) => {
    const dotStyle: CSSProperties = {
      width: "9px",
      height: "9px",
      borderRadius: "2px",
      background: rgb(g.col),
      flex: "0 0 auto",
    };
    const medianStyle: CSSProperties = {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      left: P(g.md) + "%",
      width: "2.5px",
      height: "18px",
      borderRadius: "1px",
      background: rgb(g.col),
    };
    const rowStyle: CSSProperties = {
      display: "grid",
      gridTemplateColumns: "150px minmax(0,1fr)",
      alignItems: "center",
      gap: "12px",
      padding: "7px 0",
      borderBottom: "1px solid " + rgb(T.hairline),
      cursor: "pointer",
      background: st.hovered === g.k ? rgba(g.col, 0.06) : "transparent",
      transition: "background .15s",
    };
    const onEnter = () => patch({ hovered: g.k });

    // Too few closed issues for a box: show the raw points + median tick, no box.
    if (g.mode === "sparse") {
      const hidden: CSSProperties = { display: "none" };
      return {
        name: g.k,
        sub: "n=" + g.n + " · 中央 " + Math.round(g.md) + "日 · データ少",
        dotStyle,
        whiskerStyle: hidden,
        capLoStyle: hidden,
        capHiStyle: hidden,
        rectStyle: hidden,
        medianStyle,
        outliers: g.vals.map((v) => dotAt(v, g.col)),
        rowStyle,
        onEnter,
      };
    }

    return {
      name: g.k,
      sub: "n=" + g.n + " · 中央 " + Math.round(g.md) + "日",
      dotStyle,
      whiskerStyle: {
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        left: P(g.wlo) + "%",
        width: P(g.whi) - P(g.wlo) + "%",
        height: "1.5px",
        background: rgba(g.col, 0.85),
      },
      capLoStyle: {
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        left: P(g.wlo) + "%",
        width: "1.5px",
        height: "10px",
        background: rgba(g.col, 0.85),
      },
      capHiStyle: {
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        left: P(g.whi) + "%",
        width: "1.5px",
        height: "10px",
        background: rgba(g.col, 0.85),
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
        border: "1px solid " + rgba(g.col, 0.8),
        boxSizing: "border-box",
      },
      medianStyle,
      outliers: g.outs.slice(0, 40).map((v) => dotAt(v, g.col)),
      rowStyle,
      onEnter,
    };
  });

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
        // Sparse groups (1–2 closed) have no quartiles/whiskers/outliers — show only
        // the stats that exist so the panel never renders "NaN日".
        cells: [
          { k: "件数", v: hg.n, vStyle: cellStyle(false) },
          { k: "未解決", v: hg.openN + "件", vStyle: cellStyle(false) },
          { k: "最小", v: Math.round(hg.min) + "日", vStyle: cellStyle(false) },
          ...(hg.mode === "box"
            ? [{ k: "Q1", v: Math.round(hg.q1) + "日", vStyle: cellStyle(false) }]
            : []),
          { k: "中央値", v: Math.round(hg.md) + "日", vStyle: cellStyle(true) },
          ...(hg.mode === "box"
            ? [{ k: "Q3", v: Math.round(hg.q3) + "日", vStyle: cellStyle(false) }]
            : []),
          { k: "最大", v: Math.round(hg.max) + "日", vStyle: cellStyle(false) },
          ...(hg.mode === "box"
            ? [
                { k: "IQR", v: Math.round(hg.iqr) + "日", vStyle: cellStyle(false) },
                { k: "外れ値", v: hg.outs.length + "件", vStyle: cellStyle(false) },
              ]
            : []),
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
  const milestoneOptions: FilterOption[] = deriveMilestones(data, meta.milestones).map((ms) => ({
    name: ms.name,
    count: ms.count,
    active: st.milestones.includes(ms.name),
    onToggle: () =>
      patch((s) => ({
        milestones: s.milestones.includes(ms.name)
          ? s.milestones.filter((x) => x !== ms.name)
          : s.milestones.concat(ms.name),
      })),
  }));

  return {
    repo: meta.repo,
    project: meta.project,
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
    showSchedule,
    showRoadmap,
    showTeam,
    panelTabs: {
      ranking: { style: seg(st.panel === "ranking"), onClick: setS({ panel: "ranking" }) },
      dist: { style: seg(st.panel === "dist"), onClick: setS({ panel: "dist" }) },
      calendar: { style: seg(st.panel === "calendar"), onClick: setS({ panel: "calendar" }) },
      schedule: { style: seg(st.panel === "schedule"), onClick: setS({ panel: "schedule" }) },
      roadmap: { style: seg(st.panel === "roadmap"), onClick: setS({ panel: "roadmap" }) },
      team: { style: seg(st.panel === "team"), onClick: setS({ panel: "team" }) },
    },
    calendar,
    schedule,
    roadmap,
    team,
    labelOptions,
    assigneeOptions,
    milestoneOptions,
    totalCount: data.length,
    clearBtn: { onClick: () => patch({ labels: [] }) },
    clearAssigneeBtn: { onClick: () => patch({ assignees: [] }) },
    clearMilestoneBtn: { onClick: () => patch({ milestones: [] }) },
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
export const MILESTONE_COLOR = "124 58 237"; // #7c3aed deep violet for milestone bars
export const CHECKPOINT_STAR = "217 119 6"; // #d97706 amber ★ for checkpoint deadlines
/** Max issue lanes drawn per week before the surplus collapses into a per-day
 *  "+N 件" overflow chip. Milestones are exempt (few, always shown up top). */
const MAX_LANES = 3;
/** Calendar bar/lane geometry (px) — sized so a TS_SM label fits in the bar. */
const BAR_H = 22;
const LANE_H = BAR_H + 3; // grid row height; rowGap adds the rest of the pitch
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
  variance: ScheduleVariance; // milestones: NO_VARIANCE
  dueDay: number | null; // due_date day-index (overrun hatch/tick); null if none
  // relations (tooltip/popover listing) — issue fields; milestones keep defaults
  parentIid: number | null;
  childIids: number[];
  related: RelatedRef[];
  memberIids: number[]; // milestone only: iids of the filtered issues under it
}

export const fmtMD = (idx: number): string => {
  const d = new Date(idx * DAY);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
/** "2026-07-08" — day-index to the machine-readable date used by <time>. */
const fmtISODate = (idx: number): string => new Date(idx * DAY).toISOString().slice(0, 10);
/** "2026/7/8" — day-index to a full year/month/day label (roadmap span). */
export const fmtYMD = (idx: number): string => {
  const d = new Date(idx * DAY);
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
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

/** "#11, #13" capped at 6 entries with an "…他N件" tail. */
const iidList = (iids: number[]): string => {
  const shown = iids.slice(0, 6).map((n) => `#${n}`).join(", ");
  return iids.length > 6 ? `${shown} …他${iids.length - 6}件` : shown;
};

/** Relation display pairs for an item: ["子", "#11, #13"]…. Lists the data as
 *  fetched — iids hidden by the current filter still show up here (the bars
 *  only highlight what's visible; the listing states the full relations). */
function relPairs(it: CalItem): [string, string][] {
  const out: [string, string][] = [];
  if (it.track === "issue") {
    if (it.parentIid !== null) out.push(["親", `#${it.parentIid}`]);
    if (it.childIids.length) out.push(["子", iidList(it.childIids)]);
    const byType = [
      ["relates_to", "関連"],
      ["blocks", "ブロック"],
      ["is_blocked_by", "被ブロック"],
    ] as const;
    for (const [type, label] of byType) {
      const iids = it.related.filter((r) => r.linkType === type).map((r) => r.iid);
      if (iids.length) out.push([label, iidList(iids)]);
    }
  } else if (it.memberIids.length) {
    out.push(["配下", iidList(it.memberIids)]);
  }
  return out;
}

/** One-line relation summary for the day popover ("" when unrelated). */
const relSummary = (it: CalItem): string =>
  relPairs(it)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");

/** Rich hover tooltip for a bar. */
function buildTip(it: CalItem): CalTip {
  const st = itemStatus(it);
  const rows: { k: string; v: string; tone?: VarianceTone }[] = [];
  if (it.track === "issue") rows.push({ k: "担当者", v: it.assignee || "—" });
  rows.push({ k: "状態", v: st.label });
  rows.push({ k: "期間", v: calRange(it.startDay, it.endDay) });
  if (it.track === "issue" && it.dueDay !== null) rows.push({ k: "期限", v: fmtMD(it.dueDay) });
  if (it.variance.status !== "none")
    rows.push({ k: "予実", v: it.variance.label, tone: it.variance.tone });
  for (const [k, v] of relPairs(it)) rows.push({ k, v });
  return {
    title: it.track === "issue" ? `#${it.id} ${it.label}` : it.label,
    labelName: it.track === "issue" ? it.labelName : null,
    color: it.color,
    rows,
  };
}

/** One item as it appears in the day-overflow popover. */
function toDayItem(it: CalItem, hidden: boolean): CalDayItem {
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
    varianceLabel: it.variance.label,
    varianceTone: it.variance.tone,
    relLine: relSummary(it),
    hidden,
  };
}

/** Style for a per-day "+N 件" overflow chip (single column, overflow row). */
function overflowStyle(
  colStart: number,
  gridRowStart: number,
  barHeight = BAR_H,
  fontSize = TS_SM,
): CSSProperties {
  return {
    gridColumn: `${colStart + 1} / span 1`,
    gridRow: String(gridRowStart),
    alignSelf: "center",
    height: barHeight + "px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
    boxSizing: "border-box",
    borderRadius: "5px",
    fontSize: fontSize + "px",
    fontFamily: SANS,
    fontWeight: 700,
    lineHeight: 1,
    color: rgb(T.ink),
    background: rgb(T.strong),
    border: "1px solid " + rgb(T.hairline),
    cursor: "pointer",
    whiteSpace: "nowrap",
    overflow: "hidden",
  };
}

/** Issue -> inclusive [startDay, endDay] day-index interval.
 *  start = start_date || created_at.
 *  end   = closed_at (if closed) || due_date, except an *open, past-due* issue
 *          extends to today so its [due..today] schedule overrun is drawn.
 *  Exported for unit tests. */
export function issueInterval(it: Issue, todayIndex: number): { startDay: number; endDay: number } {
  const startDay = it.startDate ? dayIndex(it.startDate) : dayIndex(it.createdAt);
  let endDay: number;
  if (!it.isOpen && it.closedAt) endDay = dayIndex(it.closedAt);
  else if (it.dueDate) {
    // Open & overdue bars run to today so the overrun is visible; a future due
    // date still ends the (planned) bar at the due date.
    const due = dayIndex(it.dueDate);
    endDay = it.isOpen && !Number.isNaN(due) ? Math.max(due, todayIndex) : due;
  } else endDay = todayIndex;
  if (Number.isNaN(endDay)) endDay = startDay;
  return { startDay, endDay: Math.max(endDay, startDay) };
}

/* ------------------------------------------------------------------ *
 *  Schedule variance (納期予実) — plan (due_date) vs actual (closed_at)
 * ------------------------------------------------------------------ */
export type VarianceStatus =
  | "none" // no due date -> not measurable
  | "onTimeClosed" // closed on/before due (0 = on time, else early)
  | "lateClosed" // closed after due
  | "onTimeOpen" // open, due today or later
  | "overdueOpen"; // open, past due
export type VarianceTone = "neutral" | "ok" | "warn" | "err";

/** Plan-vs-actual result for one issue. `days` is a non-negative magnitude
 *  (early / late / remaining / overrun days); `label` is the display string. */
export interface ScheduleVariance {
  status: VarianceStatus;
  days: number;
  label: string;
  tone: VarianceTone;
}
export const NO_VARIANCE: ScheduleVariance = { status: "none", days: 0, label: "", tone: "neutral" };

/** VarianceTone -> "R G B" theme token (for both bars and tooltip values). */
export const toneColor = (t: VarianceTone): string =>
  t === "ok" ? T.ok : t === "err" ? T.err : t === "warn" ? T.warn : T.body;

/** Classify an issue's schedule adherence: due_date (plan) vs closed_at
 *  (actual, closed) or today (still open). Exported for unit tests. */
export function scheduleVariance(it: Issue, todayIndex: number): ScheduleVariance {
  if (!it.dueDate) return NO_VARIANCE;
  const dueDay = dayIndex(it.dueDate);
  if (Number.isNaN(dueDay)) return NO_VARIANCE;
  if (!it.isOpen && it.closedAt) {
    const delta = dayIndex(it.closedAt) - dueDay;
    if (delta <= 0)
      return { status: "onTimeClosed", days: Math.abs(delta), tone: "ok", label: delta === 0 ? "期限どおり" : `${-delta}日前倒し` };
    return { status: "lateClosed", days: delta, tone: "err", label: `${delta}日遅延` };
  }
  // open (or the abnormal closed-without-closedAt case): measure against today
  const delta = todayIndex - dueDay;
  if (delta > 0) return { status: "overdueOpen", days: delta, tone: "warn", label: `${delta}日超過（進行中）` };
  return { status: "onTimeOpen", days: Math.abs(delta), tone: "neutral", label: delta === 0 ? "本日期限" : `残${-delta}日` };
}

/** Portfolio-level schedule KPIs over a set of issues (adherence excludes
 *  open issues; only closed-with-due count toward the rate). */
export interface ScheduleSummary {
  closedWithDue: number; // rate denominator
  onTime: number;
  late: number;
  overdue: number; // open & past due
  adherenceRate: number | null; // onTime / closedWithDue (percent); null if denom 0
  avgLateDays: number | null; // mean overrun of late-closed; null if none
}
export function scheduleSummary(issues: Issue[], todayIndex: number): ScheduleSummary {
  let closedWithDue = 0,
    onTime = 0,
    late = 0,
    overdue = 0,
    lateSum = 0;
  for (const it of issues) {
    const v = scheduleVariance(it, todayIndex);
    if (v.status === "onTimeClosed") {
      closedWithDue++;
      onTime++;
    } else if (v.status === "lateClosed") {
      closedWithDue++;
      late++;
      lateSum += v.days;
    } else if (v.status === "overdueOpen") {
      overdue++;
    }
  }
  return {
    closedWithDue,
    onTime,
    late,
    overdue,
    adherenceRate: closedWithDue ? Math.round((onTime / closedWithDue) * 100) : null,
    avgLateDays: late ? Math.round((lateSum / late) * 10) / 10 : null,
  };
}

/** Open work grouped by assignee for the dedicated team view. Items are
 * risk-sorted so a two-line glance shows overdue work before routine work. */
export function buildTeamOverview(issues: Issue[], todayIndex: number): TeamOverview {
  const open = issues.filter((it) => it.isOpen);
  const grouped = new Map<string, Issue[]>();
  for (const it of open) {
    const name = it.assignee || "未割当";
    const current = grouped.get(name);
    if (current) current.push(it);
    else grouped.set(name, [it]);
  }

  const classify = (it: Issue): TeamFocusItem["risk"] => {
    if (!it.dueDate) return "normal";
    const due = dayIndex(it.dueDate);
    if (Number.isNaN(due)) return "normal";
    if (due < todayIndex) return "overdue";
    if (due <= todayIndex + 7) return "soon";
    return "normal";
  };
  const dueIndex = (it: Issue): number => {
    if (!it.dueDate) return Number.POSITIVE_INFINITY;
    const due = dayIndex(it.dueDate);
    return Number.isNaN(due) ? Number.POSITIVE_INFINITY : due;
  };
  const riskRank = (it: Issue): number => {
    const risk = classify(it);
    return risk === "overdue" ? 0 : it.isCheckpoint ? 1 : risk === "soon" ? 2 : 3;
  };
  const toFocus = (it: Issue): TeamFocusItem => {
    const due = dueIndex(it);
    const risk = classify(it);
    const dueLabel =
      due === Number.POSITIVE_INFINITY
        ? "期限なし"
        : risk === "overdue"
          ? `${todayIndex - due}日超過`
          : due === todayIndex
            ? "本日期限"
            : `${fmtMD(due)}期限`;
    return {
      id: it.id,
      title: it.title,
      milestone: it.milestone,
      dueLabel,
      risk,
      isCheckpoint: it.isCheckpoint,
    };
  };

  const members: TeamMemberOverview[] = [...grouped.entries()].map(([name, memberIssues]) => {
    const ordered = memberIssues.slice().sort((a, b) => {
      return (
        riskRank(a) - riskRank(b) ||
        dueIndex(a) - dueIndex(b) ||
        b.linger - a.linger ||
        a.id - b.id
      );
    });
    const overdue = memberIssues.filter((it) => classify(it) === "overdue").length;
    const dueSoon = memberIssues.filter((it) => classify(it) === "soon").length;
    return {
      name,
      open: memberIssues.length,
      overdue,
      dueSoon,
      focus: ordered.slice(0, 3).map(toFocus),
    };
  });

  members.sort(
    (a, b) =>
      b.overdue - a.overdue || b.dueSoon - a.dueSoon || b.open - a.open || a.name.localeCompare(b.name),
  );
  return {
    members,
    open: open.length,
    overdue: members.reduce((sum, m) => sum + m.overdue, 0),
    dueSoon: members.reduce((sum, m) => sum + m.dueSoon, 0),
  };
}

/** Management-scale calendar: Open work is grouped by assignee, then by its
 * official GitLab milestone. Milestone dates are never inferred from issue
 * history here; incomplete plans stay visible in the unscheduled section. */
export function buildExecutiveSchedule(
  issues: Issue[],
  milestones: Milestone[],
  todayIndex: number,
  rangeStart: number,
  rangeEnd: number,
): ExecutiveScheduleVals {
  const start = Math.min(rangeStart, rangeEnd);
  const end = Math.max(rangeStart, rangeEnd);
  const rangeDays = end - start + 1;
  const denom = Math.max(1, rangeDays);
  const xOf = (day: number) => Math.max(0, Math.min(100, ((day - start) / denom) * 100));
  const milestoneByTitle = new Map(milestones.map((m) => [m.title, m]));
  const open = issues.filter((it) => it.isOpen);

  const dueDay = (it: Issue): number | null => {
    if (!it.dueDate) return null;
    const parsed = dayIndex(it.dueDate);
    return Number.isNaN(parsed) ? null : parsed;
  };
  const riskOf = (it: Issue): ExecutiveScheduleIssue["risk"] => {
    const due = dueDay(it);
    if (due === null) return "normal";
    if (due < todayIndex) return "overdue";
    if (due <= todayIndex + 7) return "soon";
    return "normal";
  };
  const riskRank = (it: Issue): number => {
    const risk = riskOf(it);
    return risk === "overdue" ? 0 : it.isCheckpoint ? 1 : risk === "soon" ? 2 : 3;
  };
  const toIssue = (it: Issue): ExecutiveScheduleIssue => {
    const due = dueDay(it);
    const risk = riskOf(it);
    return {
      id: it.id,
      title: it.title,
      dueLabel:
        due === null
          ? "期限なし"
          : risk === "overdue"
            ? `${todayIndex - due}日超過`
            : due === todayIndex
              ? "本日期限"
              : `${fmtMD(due)}期限`,
      label: it.label.name,
      risk,
      isCheckpoint: it.isCheckpoint,
    };
  };
  const orderIssues = (arr: Issue[]): Issue[] =>
    arr.slice().sort((a, b) => {
      const ad = dueDay(a) ?? Number.POSITIVE_INFINITY;
      const bd = dueDay(b) ?? Number.POSITIVE_INFINITY;
      return riskRank(a) - riskRank(b) || ad - bd || b.linger - a.linger || a.id - b.id;
    });

  const groupIssues = (source: Issue[]): Map<string, Map<string, Issue[]>> => {
    const result = new Map<string, Map<string, Issue[]>>();
    for (const it of source) {
      const owner = it.assignee || "未割当";
      let byMilestone = result.get(owner);
      if (!byMilestone) result.set(owner, (byMilestone = new Map()));
      const bucket = byMilestone.get(it.milestone);
      if (bucket) bucket.push(it);
      else byMilestone.set(it.milestone, [it]);
    }
    return result;
  };
  const grouped = groupIssues(open);
  const allGrouped = groupIssues(issues);

  const lanes: ExecutiveScheduleLane[] = [];
  const unscheduled: ExecutiveUnscheduledGroup[] = [];
  const visibleMilestones = new Set<string>();
  const allMilestones = new Set<string>();
  const outOfRangeMilestones = new Set<string>();

  for (const [name, byMilestone] of grouped) {
    const rawBars: Omit<ExecutiveScheduleBar, "sublane">[] = [];
    const missing: ExecutiveUnscheduledItem[] = [];
    let ownerOverdue = 0;
    let ownerOpen = 0;

    for (const [title, memberIssues] of byMilestone) {
      const allMemberIssues = allGrouped.get(name)?.get(title) ?? memberIssues;
      const doneCount = allMemberIssues.filter((it) => !it.isOpen).length;
      const totalCount = allMemberIssues.length;
      ownerOpen += memberIssues.length;
      ownerOverdue += memberIssues.filter((it) => riskOf(it) === "overdue").length;
      allMilestones.add(title);
      const ordered = orderIssues(memberIssues);
      const refs = ordered.map(toIssue);
      const milestone = milestoneByTitle.get(title);
      const milestoneStart = milestone?.startDate ? dayIndex(milestone.startDate) : NaN;
      const milestoneEnd = milestone?.dueDate ? dayIndex(milestone.dueDate) : NaN;
      const hasDates =
        !!milestone &&
        Number.isFinite(milestoneStart) &&
        Number.isFinite(milestoneEnd) &&
        milestoneEnd >= milestoneStart;

      if (!hasDates) {
        missing.push({
          milestoneId: milestone?.id ?? null,
          title,
          openCount: memberIssues.length,
          issues: refs,
        });
        continue;
      }
      if (milestoneEnd < start || milestoneStart > end) {
        outOfRangeMilestones.add(title);
        continue;
      }

      visibleMilestones.add(title);
      const clipStart = Math.max(start, milestoneStart);
      const clipEnd = Math.min(end, milestoneEnd);
      const phase: ExecutiveSchedulePhase =
        todayIndex > milestoneEnd
          ? "overdue"
          : todayIndex >= milestoneStart
            ? "active"
            : "future";
      rawBars.push({
        key: `${name}:${milestone.id}`,
        milestoneId: milestone.id,
        title,
        startDay: milestoneStart,
        endDay: milestoneEnd,
        left: xOf(clipStart),
        width: Math.max(0.65, ((clipEnd - clipStart + 1) / denom) * 100),
        continuesBefore: milestoneStart < start,
        continuesAfter: milestoneEnd > end,
        phase,
        openCount: memberIssues.length,
        doneCount,
        totalCount,
        progress: totalCount ? Math.round((doneCount / totalCount) * 100) : 0,
        overdue: refs.filter((it) => it.risk === "overdue").length,
        focusTitle: ordered[0]?.title ?? "",
        issues: refs,
      });
    }

    rawBars.sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay || a.title.localeCompare(b.title));
    const sublaneEnds: number[] = [];
    const bars: ExecutiveScheduleBar[] = rawBars.map((bar) => {
      let sublane = sublaneEnds.findIndex((lastEnd) => bar.startDay > lastEnd);
      if (sublane < 0) sublane = sublaneEnds.length;
      sublaneEnds[sublane] = bar.endDay;
      return { ...bar, sublane };
    });

    if (bars.length) {
      lanes.push({
        name,
        open: ownerOpen,
        milestoneCount: byMilestone.size,
        overdue: ownerOverdue,
        sublaneCount: Math.max(1, sublaneEnds.length),
        bars,
      });
    }
    if (missing.length) {
      missing.sort((a, b) => b.openCount - a.openCount || a.title.localeCompare(b.title));
      unscheduled.push({ name, items: missing });
    }
  }

  lanes.sort(
    (a, b) =>
      b.overdue - a.overdue || b.open - a.open || b.milestoneCount - a.milestoneCount || a.name.localeCompare(b.name),
  );
  unscheduled.sort((a, b) => a.name.localeCompare(b.name));

  const axisMarks: ExecutiveAxisMark[] = [];
  const first = new Date(start * DAY);
  let month = Math.floor(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1) / DAY);
  if (month < start) month = Math.floor(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1) / DAY);
  while (month <= end) {
    const d = new Date(month * DAY);
    axisMarks.push({
      x: xOf(month),
      label: d.getUTCMonth() === 0 ? `${d.getUTCFullYear()}/1月` : `${d.getUTCMonth() + 1}月`,
      date: new Date(month * DAY).toISOString().slice(0, 10),
      kind: "month",
    });
    month = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY);
  }
  if (rangeDays <= 120) {
    let week = weekStartOnOrBefore(start);
    if (week < start) week += 7;
    while (week <= end) {
      axisMarks.push({
        x: xOf(week),
        label: fmtMD(week),
        date: new Date(week * DAY).toISOString().slice(0, 10),
        kind: "week",
      });
      week += 7;
    }
  }

  const overdue = open.filter((it) => riskOf(it) === "overdue").length;
  const milestoneCount = new Set([...visibleMilestones, ...allMilestones]).size;
  return {
    lanes,
    unscheduled,
    axisMarks,
    todayX: todayIndex >= start && todayIndex <= end ? xOf(todayIndex) : null,
    rangeDays,
    rangeLabel: `${fmtYMD(start)} 〜 ${fmtYMD(end)}`,
    open: open.length,
    people: grouped.size,
    milestones: milestoneCount,
    overdue,
    outOfRange: outOfRangeMilestones.size,
    empty: lanes.length === 0 && unscheduled.length === 0,
    filterSummary: `稼働 ${grouped.size} 名 / 進行中 ${open.length} 件 / マイルストーン ${milestoneCount} 件`,
  };
}

/* ------------------------------------------------------------------ *
 *  Click-focus relations — clicking a bar highlights its parent/children/
 *  linked issues/milestone and dims the rest. The index is built once per
 *  buildCalendar; selection itself is CalendarView-local state, so focusing
 *  never re-runs layout (styles are overlaid per render via selectionOverlay).
 * ------------------------------------------------------------------ */
export type CalRelKind = "parent" | "child" | "related" | "milestone" | "member";
/** selected bar key -> related bar key -> how the target relates to the selection. */
export type CalRelIndex = Record<string, Record<string, CalRelKind>>;
/** Bar identity across tracks — milestone ids and issue iids can collide. */
export const calBarKey = (track: "milestone" | "issue", id: number): string => `${track}:${id}`;

/** Relation index over the *filtered* issue set + calendar milestones.
 *  parent/child pairs are completed bidirectionally (either side's data
 *  suffices) and related links are symmetrized; hierarchy outranks "related"
 *  when both claim the same pair. Only issues present in the set are indexed —
 *  relations pointing outside the current filter highlight nothing. */
export function buildRelationIndex(issues: Issue[], milestones: Milestone[]): CalRelIndex {
  const idx: CalRelIndex = {};
  const present = new Set(issues.map((i) => i.id));
  const add = (fromKey: string, toKey: string, kind: CalRelKind) => {
    const row = (idx[fromKey] ??= {});
    const prev = row[toKey];
    if (prev === "parent" || prev === "child") return; // hierarchy wins over "related"
    row[toKey] = kind;
  };
  const msByTitle = new Map<string, number>();
  for (const m of milestones) msByTitle.set(m.title, m.id);
  for (const it of issues) {
    const iKey = calBarKey("issue", it.id);
    const msId = msByTitle.get(it.milestone); // "Backlog" has no bar -> undefined
    if (msId !== undefined) {
      const mKey = calBarKey("milestone", msId);
      add(iKey, mKey, "milestone");
      add(mKey, iKey, "member");
    }
    if (it.parentIid !== null && present.has(it.parentIid)) {
      add(iKey, calBarKey("issue", it.parentIid), "parent");
      add(calBarKey("issue", it.parentIid), iKey, "child");
    }
    for (const c of it.childIids) {
      if (!present.has(c)) continue;
      add(iKey, calBarKey("issue", c), "child");
      add(calBarKey("issue", c), iKey, "parent");
    }
    for (const r of it.related) {
      if (!present.has(r.iid)) continue;
      add(iKey, calBarKey("issue", r.iid), "related");
      add(calBarKey("issue", r.iid), iKey, "related");
    }
  }
  return idx;
}

/** A bar's role under the current selection: the selection itself, one of its
 *  relations, or dimmed. null = no selection (bar renders exactly as today). */
export type CalRole = CalRelKind | "self" | "dim" | null;
export function selectionRole(
  selected: string | null,
  rel: CalRelIndex,
  track: "milestone" | "issue",
  id: number,
): CalRole {
  if (!selected) return null;
  const key = calBarKey(track, id);
  if (key === selected) return "self";
  return rel[selected]?.[key] ?? "dim";
}

/** Focus role for a "+N件" overflow chip: ring when the chip is the only
 *  stand-in for the selection or one of its relations — i.e. a *hidden* item
 *  matches. Visible covering items (the popover lists those too) don't count:
 *  the milestone bar alone would otherwise ring every chip under it. */
export function chipSelectionRole(
  selected: string | null,
  rel: CalRelIndex,
  items: { track: "milestone" | "issue"; id: number; hidden: boolean }[],
): CalRole {
  if (!selected) return null;
  return items.some((it) => it.hidden && selectionRole(selected, rel, it.track, it.id) !== "dim")
    ? "related"
    : "dim";
}

const FOCUS_TRANSITION = "opacity .18s ease, box-shadow .18s ease";
/** Style overlaid on a bar's precomputed style for its selection role.
 *  {} when there is no selection — the default rendering stays byte-identical.
 *  Rings are *prepended* to the base boxShadow so the checkpoint gold ring
 *  survives underneath. Fade-in comes from the transition (box-shadow/opacity
 *  animate from their previous computed values); deselect snaps back. */
export function selectionOverlay(role: CalRole, baseBoxShadow?: string): CSSProperties {
  if (role === null) return {};
  if (role === "dim") return { transition: FOCUS_TRANSITION, opacity: 0.22 };
  const ring =
    role === "self"
      ? `0 0 0 2px ${rgb(T.primary)}`
      : `0 0 0 1.5px ${rgba(T.primary, 0.55)}`;
  return {
    transition: FOCUS_TRANSITION,
    boxShadow: baseBoxShadow ? `${ring}, ${baseBoxShadow}` : ring,
  };
}

/** Badge text shown on highlighted bars while something is selected. */
export function relBadgeText(role: CalRole): string | null {
  switch (role) {
    case "parent":
      return "親";
    case "child":
      return "子";
    case "related":
      return "関連";
    case "milestone":
      return "MS";
    case "member":
      return "配下";
    default:
      return null;
  }
}
/** position/z-index lift matches the bar label (above the overrun hatch). */
export const relBadgeStyle: CSSProperties = {
  flex: "0 0 auto",
  padding: "2px 5px",
  borderRadius: "4px",
  fontSize: TS_XS + "px",
  fontWeight: 700,
  lineHeight: 1,
  background: rgb(T.strong),
  color: rgb(T.ink),
  border: "1px solid " + rgb(T.hairline),
  position: "relative",
  zIndex: 1,
};

/** Precomputed bar style. Left/right corners round only on the true start/end
 *  row so a wrapped bar reads as one continuous span. */
function barStyle(
  it: CalItem,
  isStart: boolean,
  isEnd: boolean,
  colStart: number,
  colSpan: number,
  gridRowStart: number,
  barHeight = BAR_H,
  fontSize = TS_SM,
): CSSProperties {
  const c = it.color;
  const rL = isStart ? "5px" : "1px";
  const rR = isEnd ? "5px" : "1px";
  const s: CSSProperties = {
    gridColumn: `${colStart + 1} / span ${colSpan}`,
    gridRow: String(gridRowStart),
    alignSelf: "center",
    height: barHeight + "px",
    display: "flex",
    alignItems: "center",
    gap: "3px",
    padding: "0 6px",
    boxSizing: "border-box",
    overflow: "hidden",
    whiteSpace: "nowrap",
    fontSize: fontSize + "px",
    fontFamily: SANS,
    fontWeight: 600,
    lineHeight: 1,
    borderRadius: `${rL} ${rR} ${rR} ${rL}`,
    color: rgb(T.ink),
    cursor: "pointer", // click-focus: highlight relations, dim the rest
  };
  // Notion-tag scheme: ink text on a light tint of the item color; the color
  // itself carries only via the tint, border and the solid start edge.
  if (it.track === "milestone") {
    s.background = rgba(c, 0.12);
    s.border = "1px solid " + rgba(c, 0.45);
  } else if (it.isOpen) {
    // hatched = still open (mirrors the ranking gantt)
    s.background =
      "repeating-linear-gradient(45deg," +
      rgba(c, 0.2) +
      " 0 5px," +
      rgba(c, 0.06) +
      " 5px 10px)";
    s.border = "1px solid " + rgba(c, 0.4);
  } else {
    s.background = rgba(c, 0.22);
    s.border = "1px solid " + rgba(c, 0.5);
  }
  // Solid accent edge only on the true start row, so a wrapped bar still
  // reads as one continuous span (continuation rows keep the 1px border).
  if (isStart) s.borderLeft = "3px solid " + rgb(c);
  // Checkpoints are always drawn (never collapsed) and stand out with an
  // amber ring so deadlines are impossible to miss. Must match the 0%/100%
  // frames of gi-checkpoint-glow in globals.css (the burst settles onto it).
  if (it.track === "issue" && it.isCheckpoint) {
    s.border = "1px solid " + rgb(CHECKPOINT_STAR);
    if (isStart) s.borderLeft = "3px solid " + rgb(CHECKPOINT_STAR);
    s.boxShadow = "0 0 0 1px " + rgba(CHECKPOINT_STAR, 0.45);
  }
  return s;
}

/** Red hatched overlay for a schedule overrun `[due+1 .. end]`, layered on the
 *  base bar's own lane row. `roundRight` only on the row holding the true end. */
function overrunStyle(
  colStart: number,
  colSpan: number,
  gridRowStart: number,
  roundRight: boolean,
  barHeight = BAR_H,
): CSSProperties {
  return {
    gridColumn: `${colStart + 1} / span ${colSpan}`,
    gridRow: String(gridRowStart),
    alignSelf: "center",
    height: barHeight + "px",
    boxSizing: "border-box",
    borderRadius: roundRight ? "0 5px 5px 0" : "0",
    background:
      "repeating-linear-gradient(45deg," +
      rgba(T.err, 0.3) +
      " 0 5px," +
      rgba(T.err, 0.1) +
      " 5px 10px)",
    border: "1px solid " + rgba(T.err, 0.55),
    borderLeft: "none",
    pointerEvents: "none",
  };
}

/** Thin "予定線" tick at the plan/actual boundary (right edge of the due day). */
function dueTickStyle(colStart: number, gridRowStart: number, barHeight = BAR_H): CSSProperties {
  return {
    gridColumn: `${colStart + 1} / span 1`,
    gridRow: String(gridRowStart),
    alignSelf: "center",
    height: barHeight + 2 + "px",
    boxSizing: "border-box",
    borderRight: "2px solid " + rgb(T.ink),
    pointerEvents: "none",
  };
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

  // ── non-working weekday compression ──
  // Every row starts on WEEK_START, so the visible-offset pattern is identical
  // across rows and one map serves the whole window. Date math elsewhere stays
  // 7-day-based; only rendering coordinates are compressed.
  const hiddenSet = new Set(sanitizeHiddenDows(st.hiddenDows));
  const visOffsets: number[] = [];
  for (let o = 0; o < 7; o++) if (!hiddenSet.has((WEEK_START + o) % 7)) visOffsets.push(o);
  const nCols = visOffsets.length; // >= 1 — sanitizeHiddenDows never hides all 7
  const colFor: number[] = new Array(7).fill(-1); // raw in-week offset -> compressed column
  visOffsets.forEach((o, i) => (colFor[o] = i));
  const visBefore = [0]; // visBefore[o] = visible columns before offset o (length 8)
  for (let o = 0; o < 7; o++) visBefore.push(visBefore[o] + (colFor[o] >= 0 ? 1 : 0));
  /** In-row offset range [a..b] -> compressed {colStart,colSpan}; null when the
   *  whole range falls on hidden weekdays. Hidden days inside the range leave
   *  no gap in compressed space, so one contiguous span always suffices. */
  const compress = (a: number, b: number): { colStart: number; colSpan: number } | null => {
    const colSpan = visBefore[b + 1] - visBefore[a];
    return colSpan > 0 ? { colStart: visBefore[a], colSpan } : null;
  };
  const isVis = (d: number) => !hiddenSet.has(dowOf(d));
  /** First/last visible day in [from..to], or null. The weekday pattern repeats
   *  every 7 days, so 7 probes suffice for any range length. */
  const firstVisibleDay = (from: number, to: number): number | null => {
    for (let d = from; d <= to && d < from + 7; d++) if (isVis(d)) return d;
    return null;
  };
  const lastVisibleDay = (from: number, to: number): number | null => {
    for (let d = to; d >= from && d > to - 7; d--) if (isVis(d)) return d;
    return null;
  };

  // ── milestones -> intervals ──
  const membersByTitle = new Map<string, number[]>(); // milestone title -> filtered issue iids
  for (const it of issues) {
    const arr = membersByTitle.get(it.milestone);
    if (arr) arr.push(it.id);
    else membersByTitle.set(it.milestone, [it.id]);
  }
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
      variance: NO_VARIANCE,
      dueDay: null,
      parentIid: null,
      childIids: [],
      related: [],
      memberIids: membersByTitle.get(m.title) ?? [],
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
      variance: scheduleVariance(it, todayIndex),
      dueDay: it.dueDate ? dayIndex(it.dueDate) : null,
      parentIid: it.parentIid,
      childIids: it.childIids,
      related: it.related,
      memberIids: [],
    });
  }

  // ── clip to the visible window, then assign lanes per band ──
  // Bands stack top-to-bottom: milestones, checkpoints (always shown), then
  // regular issues (the only band subject to the lane cap / overflow).
  // An item must overlap the window AND have at least one visible day in it —
  // otherwise it would consume a lane (pushing others into "+N件" chips) while
  // rendering nothing.
  const inWin = (it: CalItem) =>
    it.endDay >= winStart &&
    it.startDay <= winEnd &&
    firstVisibleDay(Math.max(it.startDay, winStart), Math.min(it.endDay, winEnd)) !== null;
  const mItems = mItemsAll.filter(inWin);
  const iItems = iItemsAll.filter(inWin);
  const cpItems = iItems.filter((it) => it.isCheckpoint);
  const regItems = iItems.filter((it) => !it.isCheckpoint);
  const mLaneCount = assignLanes(mItems);
  const cpLaneCount = assignLanes(cpItems);
  assignLanes(regItems);
  const issueOffset = mLaneCount + cpLaneCount;
  // twoweek shows only 2 rows, so there is room for twice as many issue lanes
  // before collapsing into overflow chips. Fullscreen doubles the cap again —
  // the viewport overlay frees up the vertical room the page chrome used.
  const laneScale = st.fullscreen ? 2 : 1;
  const maxLanes = (st.calMode === "twoweek" ? MAX_LANES * 2 : MAX_LANES) * laneScale;

  const barHeight = st.fullscreen ? 32 : BAR_H;
  const laneFontSize = st.fullscreen ? 16 : TS_SM;
  const laneHeight = st.fullscreen ? barHeight + 5 : LANE_H;

  // ── per-week rows ──
  const weeksOut: CalWeek[] = [];
  for (let r = 0; r < weeks; r++) {
    const rowStart = weekStart + r * 7;
    const rowEnd = rowStart + 6;

    const days: CalDay[] = []; // visible days only (length nCols)
    for (const c of visOffsets) {
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
          borderLeft: "1px solid " + rgb(T.hairline),
          borderTop: isToday ? "2px solid " + rgb(T.primary) : "2px solid transparent",
          // weekend tint matches the lane-area weekendStrips so the two rows
          // read as one continuous column band
          background: isToday
            ? rgba(T.primary, 0.07)
            : isWeekend
              ? rgba(T.ink, 0.03)
              : "transparent",
          boxSizing: "border-box",
        },
        numStyle: {
          fontFamily: MONO,
          fontSize: TS_MD + "px",
          fontWeight: isToday ? 700 : 500,
          color: isToday
            ? rgb(T.primary)
            : isOtherMonth
              ? rgb(T.mutedSoft)
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
      const cc = compress(segStart - rowStart, segEnd - rowStart);
      if (!cc) return; // this row's slice falls entirely on hidden weekdays
      // Visual bar ends: the first/last *visible* day of the whole bar decides
      // rounding and the ★ position (a Sunday end renders on Friday when
      // weekends are hidden). Non-null for inWin items: any 7-day span
      // contains a visible day, and shorter bars passed the inWin probe.
      const barVisStart = firstVisibleDay(it.startDay, it.endDay) as number;
      const barVisEnd = lastVisibleDay(it.startDay, it.endDay) as number;
      const isStart = barVisStart >= rowStart;
      const isEnd = barVisEnd <= rowEnd;
      // Label goes on the row holding the first day actually rendered inside
      // the window. "…" marks any bar whose true start is not that day —
      // clipped by the window edge or by a hidden weekday alike.
      const labelAnchor = firstVisibleDay(
        Math.max(it.startDay, winStart),
        Math.min(it.endDay, winEnd),
      ) as number; // non-null by inWin
      const labelHere = labelAnchor >= rowStart && labelAnchor <= rowEnd;
      const gridRowStart = laneOffset + it.lane + 1;
      laneCount = Math.max(laneCount, gridRowStart);
      const s: CalSegment = {
        key: `${it.track}-${it.id}-r${r}`,
        kind: "bar",
        track: it.track,
        id: it.id,
        label: labelHere && labelAnchor !== it.startDay ? `…${it.label}` : it.label,
        showLabel: labelHere,
        meta: it.meta,
        colStart: cc.colStart,
        colSpan: cc.colSpan,
        gridRowStart,
        style: barStyle(
          it,
          isStart,
          isEnd,
          cc.colStart,
          cc.colSpan,
          gridRowStart,
          barHeight,
          laneFontSize,
        ),
        isCheckpoint: it.track === "issue" && it.isCheckpoint,
        tip: buildTip(it),
      };
      if (it.isCheckpoint && isEnd) {
        s.starStyle = {
          marginLeft: "auto",
          flex: "0 0 auto",
          fontSize: "14px",
          lineHeight: 1,
          color: rgb(CHECKPOINT_STAR),
          // above the overrun hatch overlay (same grid cell, later sibling)
          position: "relative",
          zIndex: 1,
        };
      }
      segments.push(s);

      // Schedule overrun (納期予実): a red hatch over [due+1 .. end] plus a plan
      // tick at the due boundary. Only late-closed / overdue-open have overrun;
      // both are layered on the same lane row, above the base bar just pushed.
      const vStatus = it.variance.status;
      if (it.dueDay !== null && (vStatus === "lateClosed" || vStatus === "overdueOpen")) {
        const os = Math.max(it.dueDay + 1, it.startDay, rowStart);
        const oe = Math.min(it.endDay, rowEnd);
        const oc = oe >= os ? compress(os - rowStart, oe - rowStart) : null;
        if (oc) {
          segments.push({
            key: `${it.track}-${it.id}-overrun-r${r}`,
            kind: "overrun",
            track: it.track,
            id: it.id,
            label: "",
            showLabel: false,
            meta: "",
            colStart: oc.colStart,
            colSpan: oc.colSpan,
            gridRowStart,
            style: overrunStyle(oc.colStart, oc.colSpan, gridRowStart, isEnd, barHeight),
          });
        }
        // The plan tick snaps back to the last visible day <= due, so it keeps
        // marking the plan/actual boundary when the due day itself is hidden
        // (Saturday due, weekends hidden -> tick on Friday's right edge).
        const tickDay = it.dueDay >= it.startDay ? lastVisibleDay(it.startDay, it.dueDay) : null;
        if (tickDay !== null && tickDay >= rowStart && tickDay <= rowEnd) {
          const tCol = colFor[tickDay - rowStart];
          segments.push({
            key: `${it.track}-${it.id}-duetick-r${r}`,
            kind: "duetick",
            track: it.track,
            id: it.id,
            label: "",
            showLabel: false,
            meta: "",
            colStart: tCol,
            colSpan: 1,
            gridRowStart,
            style: dueTickStyle(tCol, gridRowStart, barHeight),
          });
        }
      }
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
    for (const c of visOffsets) {
      const d = rowStart + c;
      const hidden = regItems.filter((it) => it.lane >= maxLanes && covers(it, d)).length;
      if (hidden === 0) continue;
      const items: CalDayItem[] = [
        ...mItems.filter((it) => covers(it, d)).map((it) => toDayItem(it, false)),
        ...cpItems.filter((it) => covers(it, d)).map((it) => toDayItem(it, false)),
        ...regItems
          .filter((it) => covers(it, d))
          .sort((a, b) => a.lane - b.lane)
          .map((it) => toDayItem(it, it.lane >= maxLanes)),
      ];
      laneCount = Math.max(laneCount, overflowRow);
      segments.push({
        key: `overflow-${d}-r${r}`,
        kind: "overflow",
        track: "issue",
        id: -d - 1, // synthetic, negative to avoid colliding with real ids
        label: `+${hidden}`,
        showLabel: true,
        meta: "",
        colStart: colFor[c],
        colSpan: 1,
        gridRowStart: overflowRow,
        style: overflowStyle(colFor[c], overflowRow, barHeight, laneFontSize),
        overflowLabel: `+${hidden} 件`,
        dayLabel: dayLabelOf(d),
        items,
      });
    }

    // Compressed column of today; null when today is out of row or on a
    // hidden weekday (then no strip and no header highlight).
    const todayOff = todayIndex >= rowStart && todayIndex <= rowEnd ? todayIndex - rowStart : -1;
    const todayCol = todayOff >= 0 && colFor[todayOff] >= 0 ? colFor[todayOff] : null;
    // Weekend bands behind the lane area. Translucent (not opaque) so the
    // gridStyle backgroundImage column lines stay visible underneath; the
    // tint value matches headStyle's weekend background above.
    const weekendStrips: CSSProperties[] = [];
    days.forEach((d, col) => {
      if (!d.isWeekend) return;
      weekendStrips.push({
        position: "absolute",
        top: 0,
        bottom: 0,
        left: (col / nCols) * 100 + "%",
        width: 100 / nCols + "%",
        background: rgba(T.ink, 0.03),
        pointerEvents: "none",
      });
    });
    weeksOut.push({
      key: "w" + rowStart,
      days,
      segments,
      laneCount,
      todayCol,
      headStyle: { display: "grid", gridTemplateColumns: `repeat(${nCols},minmax(0,1fr))` },
      gridStyle: {
        position: "relative",
        display: "grid",
        gridTemplateColumns: `repeat(${nCols},minmax(0,1fr))`,
        gridAutoRows: laneHeight + "px",
        rowGap: st.fullscreen ? "4px" : "3px",
        padding: st.fullscreen ? "8px 0 10px" : "5px 0 7px",
        minHeight: laneHeight + "px",
        borderTop: "1px solid " + rgb(T.hairline),
        // vertical day-boundary hairlines through the whole lane area — the
        // day-number row's borderLeft alone leaves the lanes boundary-less
        backgroundImage: `linear-gradient(90deg, ${rgb(T.hairline)} 1px, transparent 1px)`,
        backgroundSize: `calc(100% / ${nCols}) 100%`,
        // close the grid under the last week (other weeks are closed by the
        // next week's borderTop)
        borderBottom: r === weeks - 1 ? "1px solid " + rgb(T.hairline) : undefined,
      },
      weekendStrips,
      todayStripStyle:
        todayCol !== null
          ? {
              position: "absolute",
              top: 0,
              bottom: 0,
              left: (todayCol / nCols) * 100 + "%",
              width: 100 / nCols + "%",
              background: rgba(T.primary, 0.06),
              pointerEvents: "none",
            }
          : null,
    });
  }

  const weekdayLabels = visOffsets.map((o) => JP_WEEKDAY[(WEEK_START + o) % 7]);

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

  // Non-working-day chips (表示曜日), Monday-first. `toggleDow` guards the
  // last visible column on the state side; `disabled` mirrors it in the UI.
  const dowToggles: DowToggle[] = Array.from({ length: 7 }, (_, i) => {
    const dw = (WEEK_START + i) % 7;
    const active = !hiddenSet.has(dw);
    const disabled = active && nCols <= 1;
    return {
      label: JP_WEEKDAY[dw],
      active,
      disabled,
      style: {
        ...seg(active),
        padding: "4px 9px",
        fontSize: TS_SM + "px",
        opacity: disabled ? 0.35 : active ? 1 : 0.55,
        cursor: disabled ? "default" : "pointer",
      },
      onClick: () => patch((s) => ({ hiddenDows: toggleDow(s.hiddenDows, dw) })),
    };
  });

  return {
    weeks: weeksOut,
    weekdayLabels,
    weekdayRowStyle: {
      display: "grid",
      gridTemplateColumns: `repeat(${nCols},minmax(0,1fr))`,
      marginTop: "4px",
      background: rgb(T.canvas),
      borderRadius: "6px 6px 0 0",
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
    dowToggles,
    laneHeight,
    empty: mItems.length === 0 && iItems.length === 0,
    legend: { checkpointLabel },
    summary: scheduleSummary(issues, todayIndex),
    relations: buildRelationIndex(issues, milestones),
  };
}

/* ------------------------------------------------------------------ *
 *  buildMilestoneCalendar — the roadmap view model
 *
 *  One lane per milestone on a continuous real-date axis (unlike the week-grid
 *  calendar). Progress lives in the left KPI column; the track shows timing +
 *  which issues are still unfinished; a per-milestone burndown (reconstructed
 *  from created_at/closed_at — no stored snapshots) answers "on pace?".
 * ------------------------------------------------------------------ */
const NEAR_DAYS = 14; // an open issue due within ±this many days is labeled individually
// mini sparkline (left column) + expanded chart geometry (viewBox units)
const SPARK_W = 120,
  SPARK_H = 32,
  SPARK_PAD = 3;
const CHART_W = 680,
  CHART_H = 200,
  CHART_PADL = 34,
  CHART_PADR = 12,
  CHART_PADT = 12,
  CHART_PADB = 24;

export interface RoadmapGridLine {
  x: number; // 0..100
  label: string | null;
}
export interface RoadmapWeekLine {
  x: number; // 0..100
  label: string; // "7/6"
  date: string; // ISO date for semantic <time dateTime>
}
export interface RoadmapTick {
  id: number;
  x: number; // 0..100
  color: string; // "R G B"
  isCheckpoint: boolean;
  title: string;
  dueLabel: string;
  tip: CalTip; // rich hover content (HoverTip)
}
export interface RoadmapIssueRef {
  id: number;
  title: string;
  dueLabel: string; // "7/8" or "期限なし"
  tone: VarianceTone;
  isCheckpoint: boolean;
}
export interface RoadmapMoreChip {
  x: number; // 0..100 (median of the collapsed ticks)
  count: number;
  label: string; // "+N"
  refs: RoadmapIssueRef[];
  tip: CalTip; // rich hover content (HoverTip)
}
export interface RoadmapBuckets {
  overdue: RoadmapIssueRef[]; // due before today
  thisWeek: RoadmapIssueRef[]; // due today .. today+7
  later: RoadmapIssueRef[]; // due later, or no due date
}
export interface RoadmapSpark {
  hasData: boolean;
  actual: string; // polyline points "x,y x,y …"
  ideal: string;
}
export interface RoadmapBurndown {
  hasData: boolean;
  actualPoints: string;
  idealPoints: string;
  scopePoints: string; // total(d) — rises on scope creep
  yMax: number;
  xLabels: { x: number; label: string }[];
  yLabels: { y: number; label: string }[];
}
export interface RoadmapBar {
  left: number; // 0..100
  width: number; // 0..100
  elapsedPct: number; // today's position within [start,end] as 0..100 (today-split fill)
}
export interface RoadmapRow {
  key: string; // calBarKey("milestone", id)
  id: number;
  title: string;
  state: string;
  hasSchedule: boolean; // milestone carries a start or due date
  // KPIs (progress lives here, never on the date-axis track)
  done: number;
  total: number;
  pct: number;
  remaining: number;
  overdue: number;
  remainLabel: string; // "残N日" / "超過N日" / "本日期限" / "—"
  healthTone: VarianceTone;
  tip: CalTip; // shared hover tip (lane bar / due marker / KPI title)
  // track
  bar: RoadmapBar | null; // null for a dateless, issue-less milestone
  dueX: number | null; // due-date marker on the track
  ticks: RoadmapTick[]; // unfinished issues (individually labeled)
  moreChip: RoadmapMoreChip | null; // collapsed bulk of safe-future open issues
  // burndown
  spark: RoadmapSpark;
  burndown: RoadmapBurndown;
  // remaining-work panel
  buckets: RoadmapBuckets;
  memberIids: number[];
}
export interface RoadmapVals {
  rows: RoadmapRow[];
  gridLines: RoadmapGridLine[]; // month lines
  weekLines: RoadmapWeekLine[]; // Monday guide lines with visible dates
  todayX: number | null; // 0..100, null when out of span
  spanLabel: string;
  summary: ScheduleSummary;
  relations: CalRelIndex; // reused for relation badges in the panel
  filterSummary: string;
  empty: boolean;
  legend: { checkpointLabel: string };
}

export interface BurndownPoint {
  day: number;
  remaining: number; // open issues that already existed at day d
  total: number; // scope at day d (issues created on/before d)
  ideal: number; // linear scope→0 across the domain
}

/** Reconstruct a burndown purely from created_at/closed_at — no stored daily
 *  snapshots. `remaining(d)` counts issues that existed by day d and were still
 *  open then; `total(d)` is the scope at d (rises mid-domain on scope creep —
 *  an issue created after the start). `ideal` is the straight scope→0 line.
 *  Open issues without a due date still count toward remaining/total. */
export function reconstructBurndown(
  issues: Issue[],
  domainStart: number,
  domainEnd: number,
): BurndownPoint[] {
  const span = Math.max(1, domainEnd - domainStart);
  const scope = issues.length;
  const created = issues.map((i) => dayIndex(i.createdAt));
  const closed = issues.map((i) => (!i.isOpen && i.closedAt ? dayIndex(i.closedAt) : null));
  const out: BurndownPoint[] = [];
  for (let d = domainStart; d <= domainEnd; d++) {
    let remaining = 0,
      total = 0;
    for (let k = 0; k < issues.length; k++) {
      if (created[k] <= d) {
        total++;
        const c = closed[k];
        if (c === null || c > d) remaining++;
      }
    }
    out.push({ day: d, remaining, total, ideal: Math.max(0, (scope * (domainEnd - d)) / span) });
  }
  return out;
}

/** Milestone health from the existing variance primitives. err = has overdue
 *  open issues, or the due date passed with work remaining; warn = behind the
 *  ideal pace (needs a due date) or has late-closed issues; else ok. */
export function milestoneHealth(
  subset: Issue[],
  dueDay: number | null,
  today: number,
  remainingNow: number,
  idealNow: number,
): VarianceTone {
  const s = scheduleSummary(subset, today);
  if (s.overdue > 0) return "err";
  if (dueDay !== null && today > dueDay && remainingNow > 0) return "err";
  if (dueDay !== null && remainingNow > idealNow + 1e-9) return "warn";
  if (s.late > 0) return "warn";
  return "ok";
}

const roundHalf = (n: number): number => Math.round(n * 100) / 100;
/** Sample points → an SVG polyline string, scaled into the padded viewBox. */
function toPolyline(
  pts: BurndownPoint[],
  getY: (p: BurndownPoint) => number,
  yMax: number,
  w: number,
  h: number,
  padL: number,
  padR: number,
  padT: number,
  padB: number,
): string {
  const n = pts.length;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const ymax = Math.max(1, yMax);
  return pts
    .map((p, i) => {
      const x = padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
      const y = padT + innerH - (getY(p) / ymax) * innerH;
      return `${roundHalf(x)},${roundHalf(y)}`;
    })
    .join(" ");
}

/** Hover tip for an unfinished-issue tick (mirrors buildTip's row layout). */
function roadmapTickTip(it: Issue, due: number, v: ScheduleVariance): CalTip {
  const rows: CalTip["rows"] = [
    { k: "担当者", v: it.assignee || "—" },
    { k: "状態", v: "進行中" },
    { k: "期限", v: fmtMD(due) },
  ];
  if (v.status !== "none") rows.push({ k: "予実", v: v.label, tone: v.tone });
  return { title: `#${it.id} ${it.title}`, labelName: it.label.name, color: it.label.color, rows };
}

/** Hover tip for the "+N" chip: the collapsed refs, capped like iidList. */
function moreChipTip(refs: RoadmapIssueRef[]): CalTip {
  const rows: CalTip["rows"] = refs
    .slice(0, 6)
    .map((r) => ({ k: `#${r.id}`, v: `${r.title} · ${r.dueLabel}` }));
  if (refs.length > 6) rows.push({ k: "", v: `…他${refs.length - 6}件` });
  return { title: `+${refs.length} 件（期限が先の未完）`, labelName: null, color: MILESTONE_COLOR, rows };
}

const midX = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Issues (label/assignee/milestone-filtered, NOT status-filtered) + milestones
 *  → the roadmap view model. Pure; no `st`/`patch` (axis auto-fits, selection is
 *  component-local). */
export function buildMilestoneCalendar(
  issues: Issue[],
  milestones: Milestone[],
  todayIndex: number,
  checkpointLabel: string,
): RoadmapVals {
  // bucket issues by milestone title (same match as deriveMilestones)
  const byTitle = new Map<string, Issue[]>();
  for (const it of issues) {
    const arr = byTitle.get(it.milestone);
    if (arr) arr.push(it);
    else byTitle.set(it.milestone, [it]);
  }

  interface Pre {
    m: Milestone;
    subset: Issue[];
    start: number | null;
    end: number | null;
    dueDay: number | null;
    hasSchedule: boolean;
  }
  const pre: Pre[] = milestones.map((m) => {
    const subset = byTitle.get(m.title) ?? [];
    const mStart = m.startDate ? dayIndex(m.startDate) : null;
    const mDue = m.dueDate ? dayIndex(m.dueDate) : null;
    const dueDay = mDue !== null && !Number.isNaN(mDue) ? mDue : null;
    const hasSchedule = mStart !== null || mDue !== null;
    const createds = subset.map((i) => dayIndex(i.createdAt)).filter((d) => !Number.isNaN(d));
    const dues = subset
      .map((i) => (i.dueDate ? dayIndex(i.dueDate) : NaN))
      .filter((d) => !Number.isNaN(d));
    const closeds = subset
      .map((i) => (!i.isOpen && i.closedAt ? dayIndex(i.closedAt) : NaN))
      .filter((d) => !Number.isNaN(d));
    let start: number | null = mStart ?? (createds.length ? Math.min(...createds) : dueDay);
    let end: number | null = dueDay ?? (dues.length ? Math.max(...dues) : mStart);
    if (start === null && end === null) {
      return { m, subset, start: null, end: null, dueDay, hasSchedule };
    }
    start = start ?? (end as number);
    end = end ?? start;
    // extend to cover the earliest scope (created before start) and today/latest
    // activity, so the today line and full burndown always fit in the domain.
    if (createds.length) start = Math.min(start, ...createds);
    end = Math.max(end, todayIndex, ...dues, ...closeds);
    if (end < start) end = start;
    return { m, subset, start, end, dueDay, hasSchedule };
  });

  const withDomain = pre.filter((p) => p.start !== null && p.end !== null);
  const spanStart = withDomain.length ? Math.min(...withDomain.map((p) => p.start as number)) : todayIndex;
  const spanEnd = withDomain.length ? Math.max(...withDomain.map((p) => p.end as number)) : todayIndex;
  const denom = Math.max(1, spanEnd - spanStart);
  const xOf = (d: number): number => Math.max(0, Math.min(100, ((d - spanStart) / denom) * 100));

  // month gridlines (labeled), starting at the first month boundary >= spanStart
  const gridLines: RoadmapGridLine[] = [];
  {
    const ds = new Date(spanStart * DAY);
    let idx = Math.floor(Date.UTC(ds.getUTCFullYear(), ds.getUTCMonth(), 1) / DAY);
    if (idx < spanStart) idx = Math.floor(Date.UTC(ds.getUTCFullYear(), ds.getUTCMonth() + 1, 1) / DAY);
    while (idx <= spanEnd) {
      const dd = new Date(idx * DAY);
      const mo = dd.getUTCMonth();
      gridLines.push({ x: xOf(idx), label: mo === 0 ? `${dd.getUTCFullYear()}/1月` : `${mo + 1}月` });
      idx = Math.floor(Date.UTC(dd.getUTCFullYear(), mo + 1, 1) / DAY);
    }
  }

  // Weekly guide lines are aligned to Monday so their meaning stays stable
  // when the auto-fit domain changes. The visible date labels in RoadmapView
  // make the guide interval explicit instead of leaving it as an unlabeled
  // repeating background.
  const weekLines: RoadmapWeekLine[] = [];
  {
    let idx = weekStartOnOrBefore(spanStart);
    if (idx < spanStart) idx += 7;
    while (idx <= spanEnd) {
      weekLines.push({ x: xOf(idx), label: fmtMD(idx), date: fmtISODate(idx) });
      idx += 7;
    }
  }
  const todayX = todayIndex >= spanStart && todayIndex <= spanEnd ? xOf(todayIndex) : null;

  const toRef = (it: Issue): RoadmapIssueRef => {
    const due = it.dueDate ? dayIndex(it.dueDate) : NaN;
    const v = scheduleVariance(it, todayIndex);
    return {
      id: it.id,
      title: it.title,
      dueLabel: Number.isNaN(due) ? "期限なし" : fmtMD(due),
      tone: v.tone,
      isCheckpoint: it.isCheckpoint,
    };
  };

  const rows: RoadmapRow[] = pre.map((p) => {
    const { m, subset, start, end, dueDay, hasSchedule } = p;
    const done = subset.filter((i) => !i.isOpen).length;
    const total = subset.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const remaining = total - done;
    const overdue = scheduleSummary(subset, todayIndex).overdue;
    const remainLabel =
      dueDay === null
        ? "—"
        : dueDay - todayIndex > 0
          ? `残${dueDay - todayIndex}日`
          : dueDay - todayIndex < 0
            ? `超過${todayIndex - dueDay}日`
            : "本日期限";
    const scope = total;
    const idealNow =
      dueDay === null || start === null || end === null
        ? 0
        : todayIndex <= start
          ? scope
          : todayIndex >= end
            ? 0
            : (scope * (end - todayIndex)) / Math.max(1, end - start);
    const healthTone = milestoneHealth(subset, dueDay, todayIndex, remaining, idealNow);

    const bar: RoadmapBar | null =
      start !== null && end !== null
        ? {
            left: xOf(start),
            width: Math.max(0.4, xOf(end) - xOf(start)),
            elapsedPct:
              end === start ? 100 : Math.max(0, Math.min(100, ((todayIndex - start) / (end - start)) * 100)),
          }
        : null;
    const dueX = dueDay !== null ? xOf(dueDay) : null;

    // unfinished ticks: open issues with a due date. Overdue / checkpoint / due
    // within NEAR_DAYS are labeled individually; the safe-future rest collapse.
    const ticks: RoadmapTick[] = [];
    const collapsed: { ref: RoadmapIssueRef; x: number }[] = [];
    for (const it of subset) {
      if (!it.isOpen || !it.dueDate) continue;
      const due = dayIndex(it.dueDate);
      if (Number.isNaN(due)) continue;
      const v = scheduleVariance(it, todayIndex);
      const labeled = v.status === "overdueOpen" || it.isCheckpoint || Math.abs(due - todayIndex) <= NEAR_DAYS;
      if (labeled) {
        ticks.push({
          id: it.id,
          x: xOf(due),
          color: toneColor(v.tone),
          isCheckpoint: it.isCheckpoint,
          title: it.title,
          dueLabel: fmtMD(due),
          tip: roadmapTickTip(it, due, v),
        });
      } else {
        collapsed.push({ ref: toRef(it), x: xOf(due) });
      }
    }
    const chipRefs = collapsed.map((c) => c.ref);
    const moreChip: RoadmapMoreChip | null = collapsed.length
      ? {
          x: midX(collapsed.map((c) => c.x)),
          count: collapsed.length,
          label: `+${collapsed.length}`,
          refs: chipRefs,
          tip: moreChipTip(chipRefs),
        }
      : null;

    // remaining-work buckets (all open issues, incl. those with no due date)
    const buckets: RoadmapBuckets = { overdue: [], thisWeek: [], later: [] };
    for (const it of subset) {
      if (!it.isOpen) continue;
      const due = it.dueDate ? dayIndex(it.dueDate) : NaN;
      if (!Number.isNaN(due) && due < todayIndex) buckets.overdue.push(toRef(it));
      else if (!Number.isNaN(due) && due <= todayIndex + 7) buckets.thisWeek.push(toRef(it));
      else buckets.later.push(toRef(it));
    }
    const byId = (a: RoadmapIssueRef, b: RoadmapIssueRef) => a.id - b.id;
    buckets.overdue.sort(byId);
    buckets.thisWeek.sort(byId);
    buckets.later.sort(byId);

    // burndown (reconstructed) — mini sparkline + expanded chart geometry
    // shared milestone tip — the lane bar, due marker and KPI title all show it
    const memberIids = subset.map((i) => i.id);
    const tipRows: CalTip["rows"] = [{ k: "状態", v: m.state === "closed" ? "完了" : "進行中" }];
    if (start !== null && end !== null) tipRows.push({ k: "期間", v: calRange(start, end) });
    if (dueDay !== null)
      tipRows.push({
        k: "期限",
        v: fmtMD(dueDay) + (remainLabel !== "—" ? `（${remainLabel}）` : ""),
        tone: healthTone,
      });
    if (total > 0) tipRows.push({ k: "進捗", v: `${done}/${total} 件（${pct}%）` });
    if (remaining > 0)
      tipRows.push({ k: "残作業", v: `${remaining} 件` + (overdue > 0 ? `（超過 ${overdue}）` : "") });
    if (memberIids.length) tipRows.push({ k: "配下", v: iidList(memberIids) });
    const tip: CalTip = { title: m.title, labelName: null, color: MILESTONE_COLOR, rows: tipRows };

    const bd = start !== null && end !== null ? reconstructBurndown(subset, start, end) : [];
    const sparkYMax = Math.max(1, ...bd.map((q) => q.total));
    const spark: RoadmapSpark = {
      hasData: bd.length > 1 && total > 0,
      actual: toPolyline(bd, (q) => q.remaining, sparkYMax, SPARK_W, SPARK_H, SPARK_PAD, SPARK_PAD, SPARK_PAD, SPARK_PAD),
      ideal: toPolyline(bd, (q) => q.ideal, sparkYMax, SPARK_W, SPARK_H, SPARK_PAD, SPARK_PAD, SPARK_PAD, SPARK_PAD),
    };
    const burndown = buildBurndownChart(bd, total > 0, start, end);

    return {
      key: calBarKey("milestone", m.id),
      id: m.id,
      title: m.title,
      state: m.state,
      hasSchedule,
      done,
      total,
      pct,
      remaining,
      overdue,
      remainLabel,
      healthTone,
      tip,
      bar,
      dueX,
      ticks,
      moreChip,
      spark,
      burndown,
      buckets,
      memberIids,
    };
  });

  // scheduled rows first, ordered by due (then bar start); dateless rows last.
  rows.sort((a, b) => {
    const as = a.bar !== null,
      bs = b.bar !== null;
    if (as !== bs) return as ? -1 : 1;
    return (
      (a.dueX ?? a.bar?.left ?? 0) - (b.dueX ?? b.bar?.left ?? 0) || a.title.localeCompare(b.title)
    );
  });

  return {
    rows,
    gridLines,
    weekLines,
    todayX,
    spanLabel: `${fmtYMD(spanStart)} 〜 ${fmtYMD(spanEnd)}`,
    summary: scheduleSummary(issues, todayIndex),
    relations: buildRelationIndex(issues, milestones),
    filterSummary: `${milestones.length} マイルストーン / イシュー ${issues.length} 件`,
    empty: pre.length === 0,
    legend: { checkpointLabel },
  };
}

/** Expanded burndown chart geometry (actual/ideal/scope polylines + axis
 *  labels), scaled to the padded chart viewBox. Empty when < 2 sample days. */
function buildBurndownChart(
  bd: BurndownPoint[],
  hasIssues: boolean,
  start: number | null,
  end: number | null,
): RoadmapBurndown {
  if (bd.length < 2 || !hasIssues || start === null || end === null) {
    return { hasData: false, actualPoints: "", idealPoints: "", scopePoints: "", yMax: 1, xLabels: [], yLabels: [] };
  }
  const rawMax = Math.max(1, ...bd.map((p) => Math.max(p.total, p.remaining, p.ideal)));
  const nice = makeTicks(rawMax);
  const yMax = nice.niceMax;
  const geom = (getY: (p: BurndownPoint) => number) =>
    toPolyline(bd, getY, yMax, CHART_W, CHART_H, CHART_PADL, CHART_PADR, CHART_PADT, CHART_PADB);
  const innerW = CHART_W - CHART_PADL - CHART_PADR;
  const innerH = CHART_H - CHART_PADT - CHART_PADB;
  const xLabels = [0, 0.5, 1].map((f) => ({
    x: CHART_PADL + f * innerW,
    label: fmtMD(Math.round(start + f * (end - start))),
  }));
  const yLabels = nice.ticks.map((v) => ({
    y: CHART_PADT + innerH - (v / yMax) * innerH,
    label: `${v}`,
  }));
  return {
    hasData: true,
    actualPoints: geom((p) => p.remaining),
    idealPoints: geom((p) => p.ideal),
    scopePoints: geom((p) => p.total),
    yMax,
    xLabels,
    yLabels,
  };
}

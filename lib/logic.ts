// Presentation + analytics logic, ported from the imported design component
// (the `class Component extends DCLogic` in design/GitlabIssueDashboard.dc.html).
// Pure functions: given the fetched issues and the current UI state, produce
// every value/style the view binds to. No framework coupling beyond CSSProperties.

import type { CSSProperties } from "react";
import type { DashState, Issue, LabelDef } from "./types";

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
interface Chip {
  name: string;
  onClick: () => void;
  dotStyle: CSSProperties;
  style: CSSProperties;
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
  panelTabs: { ranking: Btn; dist: Btn };
  labelChips: Chip[];
  clearBtn: { onClick: () => void };
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

/* ------------------------------------------------------------------ *
 *  renderVals — the whole view model
 * ------------------------------------------------------------------ */
export function renderVals(
  data: Issue[],
  st: DashState,
  patch: Patch,
  meta: { repo: string; asOf: string },
): Vals {
  const showRank = st.panel === "ranking";
  const showDist = st.panel === "dist";
  const seg = (active: boolean): CSSProperties => ({
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
  const setS = (p: Partial<DashState>) => () => patch(p);

  // ── filtering ──
  const pass = (it: Issue) =>
    (st.status === "all" || (st.status === "open" ? it.isOpen : !it.isOpen)) &&
    (st.labels.length === 0 || st.labels.includes(it.label.name));
  const filtered = data.filter(pass);
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
        }
      : {
          width: pct + "%",
          height: "12px",
          borderRadius: "4px",
          background: rgb(c),
          transition: "width .45s cubic-bezier(.4,0,.2,1)",
          flex: "0 0 auto",
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

  const chip = (active: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 10px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
    fontFamily: SANS,
    transition: "all .15s",
    border: "1px solid " + (active ? rgba(T.primary, 0.5) : rgb(T.hairline)),
    background: active ? rgba(T.primary, 0.12) : rgb(T.canvasSoft),
    color: active ? rgb(T.ink) : rgb(T.body),
  });
  const labelChips: Chip[] = deriveLabelDefs(data).map((l) => ({
    name: l.n,
    onClick: () =>
      patch((s) => ({
        labels: s.labels.includes(l.n)
          ? s.labels.filter((x) => x !== l.n)
          : s.labels.concat(l.n),
      })),
    dotStyle: {
      display: "inline-block",
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: rgb(l.c),
      flex: "0 0 auto",
    },
    style: chip(st.labels.includes(l.n)),
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
    panelTabs: {
      ranking: { style: seg(st.panel === "ranking"), onClick: setS({ panel: "ranking" }) },
      dist: { style: seg(st.panel === "dist"), onClick: setS({ panel: "dist" }) },
    },
    labelChips,
    clearBtn: { onClick: () => patch({ labels: [] }) },
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

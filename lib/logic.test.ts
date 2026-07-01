import { describe, it, expect } from "vitest";
import {
  assignLanes,
  buildCalendar,
  colOf,
  dayIndex,
  dowOf,
  issueInterval,
  renderVals,
  windowFor,
  type Patch,
} from "./logic";
import type { DashState, Issue, Milestone } from "./types";

const noop: Patch = () => {};
const TODAY = dayIndex("2026-07-01"); // a Wednesday

function twoWeekState(anchor: number): DashState {
  return {
    status: "all",
    sort: "linger",
    labels: [],
    assignees: [],
    groupBy: "label",
    hovered: null,
    panel: "calendar",
    calMode: "twoweek",
    calAnchor: anchor,
  };
}

function mkIssue(p: Partial<Issue>): Issue {
  return {
    id: 1,
    title: "t",
    isOpen: true,
    linger: 0,
    openedAgo: 0,
    closedAgo: null,
    assignee: "x",
    milestone: "Backlog",
    label: { name: "l", color: "0 217 146" },
    createdAt: "2026-07-01",
    closedAt: null,
    dueDate: null,
    startDate: null,
    labelNames: [],
    isCheckpoint: false,
    ...p,
  };
}

describe("date helpers", () => {
  it("dowOf: 1970-01-01 is Thursday (idx 0)", () => {
    expect(dowOf(0)).toBe(4);
    expect(dowOf(TODAY)).toBe(3); // 2026-07-01 is a Wednesday
  });
  it("colOf: Monday-first columns", () => {
    expect(colOf(TODAY)).toBe(2); // Wed = column 2 (Mon=0)
    expect(colOf(dayIndex("2026-07-06"))).toBe(0); // Monday = column 0
    expect(colOf(dayIndex("2026-07-05"))).toBe(6); // Sunday = last column
  });
});

describe("windowFor", () => {
  it("twoweek is exactly 2 rows aligned to the week start", () => {
    const w = windowFor("twoweek", dayIndex("2026-07-15"));
    expect(w.weeks).toBe(2);
    expect(colOf(w.weekStart)).toBe(0);
  });
  it("month covers whole weeks (July 2026 = 5 rows)", () => {
    const w = windowFor("month", dayIndex("2026-07-15"));
    expect(colOf(w.weekStart)).toBe(0);
    expect(w.weeks).toBe(5);
    const first = dayIndex("2026-07-01");
    expect(first - w.weekStart).toBeGreaterThanOrEqual(0);
    expect(first - w.weekStart).toBeLessThan(7);
  });
});

describe("assignLanes", () => {
  it("gives overlapping items distinct lanes and reuses freed lanes", () => {
    const items = [
      { startDay: 0, endDay: 10, lane: 0 },
      { startDay: 5, endDay: 15, lane: 0 },
      { startDay: 8, endDay: 12, lane: 0 },
      { startDay: 20, endDay: 25, lane: 0 }, // starts after lane 0 frees up
    ];
    const n = assignLanes(items);
    expect(n).toBe(3);
    expect(items.map((i) => i.lane)).toEqual([0, 1, 2, 0]);
  });
});

describe("issueInterval", () => {
  it("open with no due date ends at today", () => {
    const it = mkIssue({ isOpen: true, createdAt: "2026-06-01", dueDate: null });
    expect(issueInterval(it, TODAY)).toEqual({ startDay: dayIndex("2026-06-01"), endDay: TODAY });
  });
  it("closed issue ends at its close date (not the due date)", () => {
    const it = mkIssue({
      isOpen: false,
      createdAt: "2026-06-01",
      closedAt: "2026-06-20",
      dueDate: "2026-07-10",
    });
    expect(issueInterval(it, TODAY).endDay).toBe(dayIndex("2026-06-20"));
  });
  it("start_date wins over created_at", () => {
    const it = mkIssue({ startDate: "2026-06-15", createdAt: "2026-06-01", dueDate: "2026-06-30" });
    expect(issueInterval(it, TODAY).startDay).toBe(dayIndex("2026-06-15"));
  });
  it("guards due-before-start (collapses to a single day)", () => {
    const it = mkIssue({ createdAt: "2026-06-20", dueDate: "2026-06-10" });
    const iv = issueInterval(it, TODAY);
    expect(iv.endDay).toBe(iv.startDay);
  });
});

describe("buildCalendar", () => {
  const anchorMon = dayIndex("2026-07-06"); // a Monday -> window 07-06 .. 07-19

  it("splits a multi-week issue bar into one clipped segment per row", () => {
    const iss = mkIssue({ id: 7, createdAt: "2026-07-06", dueDate: "2026-07-16", isOpen: true });
    const cal = buildCalendar([iss], [], twoWeekState(anchorMon), noop, TODAY, "checkpoint");
    const segs = cal.weeks.flatMap((w) => w.segments).filter((s) => s.id === 7);
    expect(segs.length).toBe(2);

    const w1 = cal.weeks[0].segments.find((s) => s.id === 7)!;
    expect(w1.colStart).toBe(0); // Mon 07-06
    expect(w1.colSpan).toBe(7); // full first week
    expect(w1.showLabel).toBe(true); // real start row shows the title

    const w2 = cal.weeks[1].segments.find((s) => s.id === 7)!;
    expect(w2.colStart).toBe(0); // 07-13
    expect(w2.colSpan).toBe(4); // 07-13 .. 07-16
    expect(w2.showLabel).toBe(false); // continuation row
  });

  it("marks a checkpoint issue's end segment with a ★", () => {
    const iss = mkIssue({
      id: 9,
      createdAt: "2026-07-07",
      dueDate: "2026-07-09",
      isOpen: true,
      isCheckpoint: true,
    });
    const cal = buildCalendar([iss], [], twoWeekState(anchorMon), noop, TODAY, "checkpoint");
    const seg = cal.weeks.flatMap((w) => w.segments).find((s) => s.id === 9)!;
    expect(seg.starStyle).toBeDefined();
  });

  it("renders a due-only milestone as a single-day bar in the top lane", () => {
    const ms: Milestone = { id: 1, title: "rel", startDate: null, dueDate: "2026-07-08", state: "active" };
    const cal = buildCalendar([], [ms], twoWeekState(anchorMon), noop, TODAY, "checkpoint");
    const seg = cal.weeks.flatMap((w) => w.segments).find((s) => s.track === "milestone")!;
    expect(seg.colSpan).toBe(1);
    expect(seg.colStart).toBe(2); // Wed 07-08
    expect(seg.gridRowStart).toBe(1); // milestone lanes come first
  });

  it("drops items entirely outside the window and reports empty", () => {
    const iss = mkIssue({
      id: 5,
      isOpen: false,
      createdAt: "2026-01-01",
      closedAt: "2026-01-05",
    });
    const cal = buildCalendar([iss], [], twoWeekState(anchorMon), noop, TODAY, "checkpoint");
    expect(cal.weeks.flatMap((w) => w.segments).length).toBe(0);
    expect(cal.empty).toBe(true);
  });

  it("places issue lanes below milestone lanes", () => {
    const ms: Milestone = { id: 1, title: "m", startDate: "2026-07-06", dueDate: "2026-07-19", state: "active" };
    const iss = mkIssue({ id: 2, createdAt: "2026-07-07", dueDate: "2026-07-10" });
    const cal = buildCalendar([iss], [ms], twoWeekState(anchorMon), noop, TODAY, "checkpoint");
    const issueSeg = cal.weeks.flatMap((w) => w.segments).find((s) => s.id === 2 && s.track === "issue")!;
    expect(issueSeg.gridRowStart).toBeGreaterThanOrEqual(2); // below the single milestone lane
  });
});

describe("distribution box plots (renderVals)", () => {
  const distState = (): DashState => ({
    status: "all",
    sort: "linger",
    labels: [],
    assignees: [],
    groupBy: "milestone",
    hovered: null,
    panel: "dist",
    calMode: "twoweek",
    calAnchor: TODAY,
  });
  const meta = { repo: "r", project: "R", asOf: "2026-07-01", milestones: [], checkpointLabel: "checkpoint" };
  const closed = (id: number, milestone: string, linger: number): Issue =>
    mkIssue({ id, milestone, isOpen: false, linger, closedAt: "2026-07-01" });
  const names = (v: ReturnType<typeof renderVals>) => v.groups.map((g) => g.name);

  it("shows a milestone with 1–2 closed issues as a sparse group (no box), not hidden", () => {
    // "Sprint 1" has only 2 closed → previously dropped by the ≥3 filter, leaving Backlog alone.
    const data = [
      closed(1, "Sprint 1", 3),
      closed(2, "Sprint 1", 7),
      closed(3, "Backlog", 5),
      closed(4, "Backlog", 10),
      closed(5, "Backlog", 15),
    ];
    const v = renderVals(data, distState(), noop, meta);
    expect(names(v)).toContain("Sprint 1");
    expect(names(v)).toContain("Backlog");

    const sprint = v.groups.find((g) => g.name === "Sprint 1")!;
    expect(sprint.sub).toContain("データ少");
    expect(sprint.whiskerStyle.display).toBe("none"); // no box/whisker for sparse
    expect(sprint.rectStyle.display).toBe("none");
    expect(sprint.outliers.length).toBe(2); // each closed value plotted as a point

    const backlog = v.groups.find((g) => g.name === "Backlog")!;
    expect(backlog.whiskerStyle.display).toBeUndefined(); // real box rendered
    expect(backlog.sub).not.toContain("データ少");
  });

  it("excludes a milestone with zero closed issues (no Close-days to plot)", () => {
    const data = [
      mkIssue({ id: 1, milestone: "Fresh", isOpen: true }),
      closed(2, "Done", 4),
      closed(3, "Done", 6),
      closed(4, "Done", 8),
    ];
    const v = renderVals(data, distState(), noop, meta);
    expect(names(v)).toContain("Done");
    expect(names(v)).not.toContain("Fresh");
  });
});

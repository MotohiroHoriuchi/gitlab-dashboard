import { describe, it, expect } from "vitest";
import {
  assignLanes,
  buildCalendar,
  buildExecutiveSchedule,
  buildMilestoneCalendar,
  buildRelationIndex,
  buildTeamOverview,
  calBarKey,
  chipSelectionRole,
  colOf,
  dayIndex,
  DEFAULT_HIDDEN_DOWS,
  deriveLabelDefs,
  dowOf,
  issueFilterLabels,
  issueInterval,
  milestoneHealth,
  reconstructBurndown,
  relBadgeText,
  renderVals,
  sanitizeHiddenDows,
  scheduleSummary,
  scheduleVariance,
  selectionOverlay,
  selectionRole,
  toggleDow,
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
    milestones: [],
    hiddenDows: [], // all 7 days visible — compression is the identity here
    groupBy: "label",
    hovered: null,
    panel: "calendar",
    calMode: "twoweek",
    calAnchor: anchor,
    scheduleStart: dayIndex("2026-06-01"),
    scheduleEnd: dayIndex("2026-12-01"),
    fullscreen: false,
  };
}

function monthState(anchor: number): DashState {
  return { ...twoWeekState(anchor), calMode: "month" };
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
    parentIid: null,
    childIids: [],
    related: [],
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
  it("extends an open, past-due bar to today (so the overrun is visible)", () => {
    const it = mkIssue({ isOpen: true, createdAt: "2026-06-20", dueDate: "2026-06-25" });
    expect(issueInterval(it, TODAY).endDay).toBe(TODAY); // due 06-25 < today 07-01
  });
  it("leaves a future due date as the (planned) open bar end", () => {
    const it = mkIssue({ isOpen: true, createdAt: "2026-06-20", dueDate: "2026-07-10" });
    expect(issueInterval(it, TODAY).endDay).toBe(dayIndex("2026-07-10"));
  });
  it("guards end-before-start (collapses to a single day)", () => {
    // closed with a close date before the start -> clamped to the start day
    const it = mkIssue({
      isOpen: false,
      startDate: "2026-06-20",
      createdAt: "2026-06-20",
      closedAt: "2026-06-10",
    });
    const iv = issueInterval(it, TODAY);
    expect(iv.endDay).toBe(iv.startDay);
  });
});

describe("scheduleVariance", () => {
  it("returns none when there is no due date", () => {
    expect(scheduleVariance(mkIssue({ dueDate: null }), TODAY).status).toBe("none");
  });
  it("closed before due -> onTimeClosed with an early-days label", () => {
    const v = scheduleVariance(
      mkIssue({ isOpen: false, dueDate: "2026-06-20", closedAt: "2026-06-18" }),
      TODAY,
    );
    expect(v.status).toBe("onTimeClosed");
    expect(v.tone).toBe("ok");
    expect(v.days).toBe(2);
    expect(v.label).toBe("2日前倒し");
  });
  it("closed exactly on due -> onTimeClosed '期限どおり'", () => {
    const v = scheduleVariance(
      mkIssue({ isOpen: false, dueDate: "2026-06-20", closedAt: "2026-06-20" }),
      TODAY,
    );
    expect(v.status).toBe("onTimeClosed");
    expect(v.days).toBe(0);
    expect(v.label).toBe("期限どおり");
  });
  it("closed after due -> lateClosed with day count", () => {
    const v = scheduleVariance(
      mkIssue({ isOpen: false, dueDate: "2026-06-20", closedAt: "2026-06-23" }),
      TODAY,
    );
    expect(v.status).toBe("lateClosed");
    expect(v.tone).toBe("err");
    expect(v.days).toBe(3);
    expect(v.label).toBe("3日遅延");
  });
  it("open past due -> overdueOpen measured against today", () => {
    const v = scheduleVariance(mkIssue({ isOpen: true, dueDate: "2026-06-26" }), TODAY);
    expect(v.status).toBe("overdueOpen");
    expect(v.tone).toBe("warn");
    expect(v.days).toBe(5); // 06-26 -> 07-01
    expect(v.label).toBe("5日超過（進行中）");
  });
  it("open due today -> onTimeOpen '本日期限'", () => {
    const v = scheduleVariance(mkIssue({ isOpen: true, dueDate: "2026-07-01" }), TODAY);
    expect(v.status).toBe("onTimeOpen");
    expect(v.label).toBe("本日期限");
  });
  it("open due in the future -> onTimeOpen with remaining days", () => {
    const v = scheduleVariance(mkIssue({ isOpen: true, dueDate: "2026-07-04" }), TODAY);
    expect(v.status).toBe("onTimeOpen");
    expect(v.days).toBe(3);
    expect(v.label).toBe("残3日");
  });
  it("falls back to the today-based branch when closed lacks a close date", () => {
    const v = scheduleVariance(
      mkIssue({ isOpen: false, closedAt: null, dueDate: "2026-06-26" }),
      TODAY,
    );
    expect(v.status).toBe("overdueOpen");
  });
});

describe("scheduleSummary", () => {
  it("rate counts only closed-with-due; open issues are excluded from the denominator", () => {
    const s = scheduleSummary(
      [
        mkIssue({ id: 1, isOpen: false, dueDate: "2026-06-20", closedAt: "2026-06-18" }), // onTime
        mkIssue({ id: 2, isOpen: false, dueDate: "2026-06-20", closedAt: "2026-06-24" }), // late +4
        mkIssue({ id: 3, isOpen: false, dueDate: "2026-06-20", closedAt: "2026-06-26" }), // late +6
        mkIssue({ id: 4, isOpen: true, dueDate: "2026-06-25" }), // overdue (open) - excluded from rate
        mkIssue({ id: 5, isOpen: true, dueDate: null }), // no due - ignored entirely
      ],
      TODAY,
    );
    expect(s.closedWithDue).toBe(3);
    expect(s.onTime).toBe(1);
    expect(s.late).toBe(2);
    expect(s.overdue).toBe(1);
    expect(s.adherenceRate).toBe(33); // 1/3
    expect(s.avgLateDays).toBe(5); // (4 + 6) / 2
  });
  it("returns null rate/avg when there is nothing to measure", () => {
    const s = scheduleSummary([mkIssue({ isOpen: true, dueDate: null })], TODAY);
    expect(s.adherenceRate).toBeNull();
    expect(s.avgLateDays).toBeNull();
  });
});

describe("buildTeamOverview", () => {
  it("groups open work by owner and puts overdue work first", () => {
    const overview = buildTeamOverview(
      [
        mkIssue({ id: 1, title: "通常", assignee: "佐藤", dueDate: "2026-07-20" }),
        mkIssue({ id: 2, title: "超過", assignee: "佐藤", dueDate: "2026-06-29" }),
        mkIssue({ id: 3, title: "近日", assignee: "鈴木", dueDate: "2026-07-05" }),
        mkIssue({ id: 4, title: "完了", assignee: "鈴木", isOpen: false, closedAt: "2026-06-30" }),
      ],
      TODAY,
    );

    expect(overview.open).toBe(3);
    expect(overview.overdue).toBe(1);
    expect(overview.dueSoon).toBe(1);
    expect(overview.members.map((m) => m.name)).toEqual(["佐藤", "鈴木"]);
    expect(overview.members[0].focus[0]).toMatchObject({ id: 2, risk: "overdue", dueLabel: "2日超過" });
  });

  it("caps each owner's glance list at three items", () => {
    const issues = Array.from({ length: 5 }, (_, i) =>
      mkIssue({ id: i + 1, assignee: "担当", title: `作業${i + 1}` }),
    );
    const overview = buildTeamOverview(issues, TODAY);
    expect(overview.members[0].open).toBe(5);
    expect(overview.members[0].focus).toHaveLength(3);
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

  it("attaches a structured tooltip to every bar", () => {
    const iss = mkIssue({
      id: 42,
      title: "認証",
      assignee: "鈴木",
      createdAt: "2026-07-07",
      dueDate: "2026-07-09",
      isOpen: true,
      label: { name: "backend", color: "0 217 146" },
    });
    const cal = buildCalendar([iss], [], twoWeekState(anchorMon), noop, TODAY, "checkpoint");
    const seg = cal.weeks.flatMap((w) => w.segments).find((s) => s.id === 42)!;
    expect(seg.kind).toBe("bar");
    expect(seg.tip).toBeDefined();
    expect(seg.tip!.title).toBe("#42 認証");
    expect(seg.tip!.labelName).toBe("backend");
    expect(seg.tip!.rows.map((r) => r.k)).toContain("担当者");
  });

  it("draws an overrun hatch + due tick and a 予実 tooltip row for a late-closed issue", () => {
    const iss = mkIssue({
      id: 77,
      createdAt: "2026-07-06",
      dueDate: "2026-07-08",
      closedAt: "2026-07-12",
      isOpen: false,
    });
    const cal = buildCalendar([iss], [], twoWeekState(anchorMon), noop, TODAY, "checkpoint");
    const segs = cal.weeks.flatMap((w) => w.segments).filter((s) => s.id === 77);
    expect(segs.some((s) => s.kind === "overrun")).toBe(true);
    expect(segs.some((s) => s.kind === "duetick")).toBe(true);
    const bar = segs.find((s) => s.kind === "bar")!;
    const vRow = bar.tip!.rows.find((r) => r.k === "予実")!;
    expect(vRow.v).toBe("4日遅延");
    expect(vRow.tone).toBe("err");
  });

  it("emits no overrun for an on-time (future-due) open issue", () => {
    const iss = mkIssue({ id: 78, createdAt: "2026-07-06", dueDate: "2026-07-19", isOpen: true });
    const cal = buildCalendar([iss], [], twoWeekState(anchorMon), noop, TODAY, "checkpoint");
    const segs = cal.weeks.flatMap((w) => w.segments).filter((s) => s.id === 78);
    expect(segs.some((s) => s.kind === "overrun" || s.kind === "duetick")).toBe(false);
  });

  it("exposes schedule-summary KPIs over the issue set", () => {
    const cal = buildCalendar(
      [
        mkIssue({ id: 1, isOpen: false, dueDate: "2026-07-08", closedAt: "2026-07-07" }),
        mkIssue({ id: 2, isOpen: false, dueDate: "2026-07-08", closedAt: "2026-07-12" }),
      ],
      [],
      twoWeekState(anchorMon),
      noop,
      TODAY,
      "checkpoint",
    );
    expect(cal.summary.closedWithDue).toBe(2);
    expect(cal.summary.onTime).toBe(1);
    expect(cal.summary.late).toBe(1);
  });

  it("caps issue lanes at 3 in month mode and emits a per-day '+N 件' chip", () => {
    // 5 issues fully overlapping the window -> lanes 0..4; cap 3 hides 2/day.
    const issues = Array.from({ length: 5 }, (_, i) =>
      mkIssue({ id: 200 + i, createdAt: "2026-07-06", dueDate: "2026-07-19", isOpen: true }),
    );
    const cal = buildCalendar(issues, [], monthState(anchorMon), noop, TODAY, "checkpoint");
    const segs = cal.weeks.flatMap((w) => w.segments);

    const issueBars = segs.filter((s) => s.kind === "bar" && s.track === "issue");
    const lanes = new Set(issueBars.map((s) => s.gridRowStart));
    expect(lanes.size).toBe(3); // only MAX_LANES lanes drawn

    const chips = segs.filter((s) => s.kind === "overflow");
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((s) => s.overflowLabel === "+2 件")).toBe(true); // 2 hidden/day
    // the click-through popover lists ALL items covering that day (all 5 issues)
    expect(chips[0].items!.length).toBe(5);
    expect(chips[0].colSpan).toBe(1);
  });

  it("doubles the lane cap to 6 in twoweek mode", () => {
    // 6 overlap -> all fit (no overflow); 8 overlap -> 2 hidden.
    const six = Array.from({ length: 6 }, (_, i) =>
      mkIssue({ id: 210 + i, createdAt: "2026-07-06", dueDate: "2026-07-19" }),
    );
    const calSix = buildCalendar(six, [], twoWeekState(anchorMon), noop, TODAY, "checkpoint");
    const segsSix = calSix.weeks.flatMap((w) => w.segments);
    expect(segsSix.filter((s) => s.kind === "overflow").length).toBe(0);
    expect(new Set(segsSix.filter((s) => s.kind === "bar").map((s) => s.gridRowStart)).size).toBe(6);

    const eight = Array.from({ length: 8 }, (_, i) =>
      mkIssue({ id: 220 + i, createdAt: "2026-07-06", dueDate: "2026-07-19" }),
    );
    const calEight = buildCalendar(eight, [], twoWeekState(anchorMon), noop, TODAY, "checkpoint");
    const chips = calEight.weeks.flatMap((w) => w.segments).filter((s) => s.kind === "overflow");
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((s) => s.overflowLabel === "+2 件")).toBe(true);
  });

  it("doubles the lane cap again in fullscreen (month: 3 -> 6)", () => {
    // 6 overlap in one month week: capped at 3 normally, all fit fullscreen.
    const six = Array.from({ length: 6 }, (_, i) =>
      mkIssue({ id: 230 + i, createdAt: "2026-07-06", dueDate: "2026-07-10" }),
    );
    const normal = buildCalendar(six, [], monthState(anchorMon), noop, TODAY, "checkpoint");
    expect(normal.weeks.flatMap((w) => w.segments).filter((s) => s.kind === "overflow").length).toBeGreaterThan(0);

    const full = buildCalendar(six, [], { ...monthState(anchorMon), fullscreen: true }, noop, TODAY, "checkpoint");
    const segs = full.weeks.flatMap((w) => w.segments);
    expect(segs.filter((s) => s.kind === "overflow").length).toBe(0);
    expect(new Set(segs.filter((s) => s.kind === "bar").map((s) => s.gridRowStart)).size).toBe(6);
  });

  it("keeps milestones visible and exempt from the issue lane cap", () => {
    const ms: Milestone = { id: 1, title: "m", startDate: "2026-07-06", dueDate: "2026-07-19", state: "active" };
    const issues = Array.from({ length: 5 }, (_, i) =>
      mkIssue({ id: 300 + i, createdAt: "2026-07-06", dueDate: "2026-07-19" }),
    );
    const cal = buildCalendar(issues, [ms], monthState(anchorMon), noop, TODAY, "checkpoint");
    const segs = cal.weeks.flatMap((w) => w.segments);

    expect(segs.some((s) => s.track === "milestone" && s.kind === "bar")).toBe(true);
    const issueBars = segs.filter((s) => s.kind === "bar" && s.track === "issue");
    const lanes = new Set(issueBars.map((s) => s.gridRowStart));
    expect(lanes.size).toBe(3); // still capped
    expect(Math.min(...lanes)).toBe(2); // issue lanes sit below the 1 milestone lane
  });

  it("never hides checkpoint issues under the lane cap", () => {
    // 5 regular issues saturate the cap; a checkpoint must still be drawn.
    const regular = Array.from({ length: 5 }, (_, i) =>
      mkIssue({ id: 400 + i, createdAt: "2026-07-06", dueDate: "2026-07-19" }),
    );
    const cp = mkIssue({ id: 499, createdAt: "2026-07-06", dueDate: "2026-07-19", isCheckpoint: true });
    const cal = buildCalendar([...regular, cp], [], monthState(anchorMon), noop, TODAY, "checkpoint");
    const segs = cal.weeks.flatMap((w) => w.segments);

    // the checkpoint is drawn as a bar (never collapsed into overflow)
    expect(segs.some((s) => s.kind === "bar" && s.id === 499)).toBe(true);
    expect(segs.some((s) => s.kind === "overflow" && s.id === 499)).toBe(false);
    // overflow reflects only the regular issues past the cap (5 - 3 = 2)
    const chips = segs.filter((s) => s.kind === "overflow");
    expect(chips.every((s) => s.overflowLabel === "+2 件")).toBe(true);
  });
});

describe("click-focus relations", () => {
  const anchorMon = dayIndex("2026-07-06"); // Monday -> window 07-06 .. 07-19
  const ms: Milestone = { id: 1, title: "Sprint 1", startDate: "2026-07-06", dueDate: "2026-07-19", state: "active" };

  it("completes parent/child from either side's data", () => {
    const parent = mkIssue({ id: 10, childIids: [11] }); // knows only #11
    const child1 = mkIssue({ id: 11 });
    const child2 = mkIssue({ id: 12, parentIid: 10 }); // parent doesn't list #12
    const idx = buildRelationIndex([parent, child1, child2], []);
    expect(idx["issue:10"]["issue:11"]).toBe("child");
    expect(idx["issue:11"]["issue:10"]).toBe("parent");
    expect(idx["issue:10"]["issue:12"]).toBe("child");
    expect(idx["issue:12"]["issue:10"]).toBe("parent");
  });

  it("symmetrizes one-way related links", () => {
    const a = mkIssue({ id: 1, related: [{ iid: 2, linkType: "relates_to" }] });
    const b = mkIssue({ id: 2 });
    const idx = buildRelationIndex([a, b], []);
    expect(idx["issue:1"]["issue:2"]).toBe("related");
    expect(idx["issue:2"]["issue:1"]).toBe("related");
  });

  it("hierarchy outranks a contradictory 'related' claim on the same pair", () => {
    const a = mkIssue({ id: 1, childIids: [2] });
    const b = mkIssue({ id: 2, related: [{ iid: 1, linkType: "relates_to" }] });
    const idx = buildRelationIndex([a, b], []);
    expect(idx["issue:1"]["issue:2"]).toBe("child");
    expect(idx["issue:2"]["issue:1"]).toBe("parent");
  });

  it("links issues to their milestone bar (and Backlog to nothing)", () => {
    const inMs = mkIssue({ id: 1, milestone: "Sprint 1" });
    const backlog = mkIssue({ id: 2 }); // milestone "Backlog" — no bar to link
    const idx = buildRelationIndex([inMs, backlog], [ms]);
    expect(idx["issue:1"]["milestone:1"]).toBe("milestone");
    expect(idx["milestone:1"]["issue:1"]).toBe("member");
    expect(idx["issue:2"]).toBeUndefined();
  });

  it("ignores relations pointing outside the filtered set", () => {
    const a = mkIssue({
      id: 1,
      parentIid: 99,
      childIids: [98],
      related: [{ iid: 97, linkType: "relates_to" }],
    });
    const idx = buildRelationIndex([a], []);
    expect(idx["issue:1"]).toBeUndefined();
  });

  it("selectionRole: self / relation / dim / no selection", () => {
    const a = mkIssue({ id: 1, childIids: [2] });
    const idx = buildRelationIndex([a, mkIssue({ id: 2 }), mkIssue({ id: 3 })], []);
    expect(selectionRole(null, idx, "issue", 1)).toBeNull();
    const sel = calBarKey("issue", 1);
    expect(selectionRole(sel, idx, "issue", 1)).toBe("self");
    expect(selectionRole(sel, idx, "issue", 2)).toBe("child");
    expect(selectionRole(sel, idx, "issue", 3)).toBe("dim");
  });

  it("chipSelectionRole rings a chip HIDING a related item, dims otherwise", () => {
    const a = mkIssue({ id: 1, childIids: [2] });
    const idx = buildRelationIndex([a, mkIssue({ id: 2 }), mkIssue({ id: 3 })], []);
    const sel = calBarKey("issue", 1);
    expect(
      chipSelectionRole(sel, idx, [
        { track: "issue", id: 2, hidden: true },
        { track: "issue", id: 3, hidden: true },
      ]),
    ).toBe("related");
    expect(chipSelectionRole(sel, idx, [{ track: "issue", id: 3, hidden: true }])).toBe("dim");
    // a related-but-VISIBLE covering item doesn't ring the chip (its own bar shows the highlight)
    expect(chipSelectionRole(sel, idx, [{ track: "issue", id: 2, hidden: false }])).toBe("dim");
    expect(chipSelectionRole(null, idx, [{ track: "issue", id: 2, hidden: true }])).toBeNull();
  });

  it("selectionOverlay: {} when idle, dim opacity, self ring prepended to the base shadow", () => {
    expect(selectionOverlay(null)).toEqual({});
    expect(selectionOverlay("dim").opacity).toBe(0.22);
    const gold = "0 0 0 1px gold";
    const self = selectionOverlay("self", gold);
    expect(String(self.boxShadow)).toContain(gold); // checkpoint ring survives…
    expect(String(self.boxShadow).indexOf(gold)).toBeGreaterThan(0); // …underneath
    expect(selectionOverlay("child").boxShadow).toBeDefined();
  });

  it("relBadgeText maps roles to badges (none for self/dim/idle)", () => {
    expect(relBadgeText("parent")).toBe("親");
    expect(relBadgeText("child")).toBe("子");
    expect(relBadgeText("related")).toBe("関連");
    expect(relBadgeText("milestone")).toBe("MS");
    expect(relBadgeText("member")).toBe("配下");
    expect(relBadgeText("self")).toBeNull();
    expect(relBadgeText("dim")).toBeNull();
    expect(relBadgeText(null)).toBeNull();
  });

  it("buildCalendar exposes the relation index on CalVals", () => {
    const iss = mkIssue({ id: 5, milestone: "Sprint 1", createdAt: "2026-07-07", dueDate: "2026-07-10" });
    const cal = buildCalendar([iss], [ms], twoWeekState(anchorMon), noop, TODAY, "checkpoint");
    expect(cal.relations["milestone:1"]["issue:5"]).toBe("member");
    expect(cal.relations["issue:5"]["milestone:1"]).toBe("milestone");
  });

  it("lists relations in the bar tooltip, milestone 配下 included", () => {
    // #19 is outside the set — the listing still names it (bars just won't highlight)
    const iss = mkIssue({
      id: 20,
      createdAt: "2026-07-06",
      dueDate: "2026-07-10",
      parentIid: 19,
      childIids: [21],
      related: [{ iid: 22, linkType: "blocks" }],
      milestone: "Sprint 1",
    });
    const cal = buildCalendar([iss], [ms], twoWeekState(anchorMon), noop, TODAY, "checkpoint");
    const bar = cal.weeks.flatMap((w) => w.segments).find((s) => s.id === 20 && s.kind === "bar")!;
    const rows = Object.fromEntries(bar.tip!.rows.map((r) => [r.k, r.v]));
    expect(rows["親"]).toBe("#19");
    expect(rows["子"]).toBe("#21");
    expect(rows["ブロック"]).toBe("#22");
    const msBar = cal.weeks
      .flatMap((w) => w.segments)
      .find((s) => s.track === "milestone" && s.kind === "bar")!;
    expect(Object.fromEntries(msBar.tip!.rows.map((r) => [r.k, r.v]))["配下"]).toBe("#20");
  });

  it("caps tooltip iid lists at 6 with an …他N件 tail", () => {
    const kids = Array.from({ length: 8 }, (_, i) => 30 + i);
    const parent = mkIssue({ id: 29, createdAt: "2026-07-06", dueDate: "2026-07-10", childIids: kids });
    const cal = buildCalendar([parent], [], twoWeekState(anchorMon), noop, TODAY, "checkpoint");
    const bar = cal.weeks.flatMap((w) => w.segments).find((s) => s.id === 29 && s.kind === "bar")!;
    expect(bar.tip!.rows.find((r) => r.k === "子")!.v).toBe("#30, #31, #32, #33, #34, #35 …他2件");
  });

  it("carries a relLine on day-popover items", () => {
    // saturate the month-mode cap so an overflow chip exists, then check its items
    const parent = mkIssue({ id: 40, createdAt: "2026-07-06", dueDate: "2026-07-19", childIids: [41] });
    const others = [41, 42, 43, 44].map((id) =>
      mkIssue({ id, createdAt: "2026-07-06", dueDate: "2026-07-19" }),
    );
    const cal = buildCalendar([parent, ...others], [], monthState(anchorMon), noop, TODAY, "checkpoint");
    const chip = cal.weeks.flatMap((w) => w.segments).find((s) => s.kind === "overflow")!;
    expect(chip.items!.find((it) => it.id === 40)!.relLine).toBe("子 #41");
    expect(chip.items!.find((it) => it.id === 42)!.relLine).toBe("");
  });
});

describe("sanitizeHiddenDows / toggleDow", () => {
  it("normalizes valid input and falls back on malformed values", () => {
    expect(sanitizeHiddenDows([6, 0, 0])).toEqual([0, 6]); // dedupe + sort
    expect(sanitizeHiddenDows([7, -1, 1.5, "0"])).toEqual([]); // junk filtered out
    expect(sanitizeHiddenDows("xyz")).toEqual(DEFAULT_HIDDEN_DOWS);
    expect(sanitizeHiddenDows(null)).toEqual(DEFAULT_HIDDEN_DOWS);
    expect(sanitizeHiddenDows([0, 1, 2, 3, 4, 5, 6])).toEqual(DEFAULT_HIDDEN_DOWS); // all hidden
  });

  it("toggleDow adds/removes and refuses to hide the last visible column", () => {
    expect(toggleDow([0, 6], 3)).toEqual([0, 3, 6]);
    expect(toggleDow([0, 3, 6], 3)).toEqual([0, 6]);
    const six = [0, 1, 2, 3, 4, 6]; // only Friday(5) still visible
    expect(toggleDow(six, 5)).toEqual(six); // guarded no-op
  });
});

describe("buildCalendar with hidden weekdays", () => {
  const anchorMon = dayIndex("2026-07-06"); // Monday -> window 07-06 .. 07-19
  const wk = (hiddenDows: number[]): DashState => ({ ...twoWeekState(anchorMon), hiddenDows });

  it("compresses a Fri→Mon bar across the hidden weekend", () => {
    const iss = mkIssue({ id: 1, isOpen: false, createdAt: "2026-07-10", closedAt: "2026-07-13" });
    const cal = buildCalendar([iss], [], wk([0, 6]), noop, TODAY, "checkpoint");
    const w0 = cal.weeks[0].segments.find((s) => s.id === 1)!;
    expect(w0.colStart).toBe(4); // Friday = 5th visible column
    expect(w0.colSpan).toBe(1); // Sat/Sun slice is gone
    expect(w0.style.borderRadius).toBe("5px 1px 1px 5px"); // visual start, not end
    const w1 = cal.weeks[1].segments.find((s) => s.id === 1)!;
    expect(w1.colStart).toBe(0); // Monday
    expect(w1.colSpan).toBe(1);
    expect(w1.style.borderRadius).toBe("1px 5px 5px 1px"); // visual end
  });

  it("labels a Saturday-start bar on its first visible day with a … prefix", () => {
    const iss = mkIssue({ id: 2, title: "T", isOpen: false, createdAt: "2026-07-11", closedAt: "2026-07-14" });
    const cal = buildCalendar([iss], [], wk([0, 6]), noop, TODAY, "checkpoint");
    expect(cal.weeks[0].segments.filter((s) => s.id === 2).length).toBe(0); // Sat–Sun slice hidden
    const w1 = cal.weeks[1].segments.find((s) => s.id === 2)!;
    expect(w1.colStart).toBe(0); // Mon 07-13
    expect(w1.colSpan).toBe(2); // Mon + Tue
    expect(w1.showLabel).toBe(true);
    expect(w1.label).toBe("…T");
  });

  it("drops weekend-only bars entirely and keeps `empty` accurate", () => {
    const iss = mkIssue({ id: 3, isOpen: false, createdAt: "2026-07-11", closedAt: "2026-07-12" });
    const cal = buildCalendar([iss], [], wk([0, 6]), noop, TODAY, "checkpoint");
    expect(cal.weeks.flatMap((w) => w.segments).length).toBe(0);
    expect(cal.empty).toBe(true);
  });

  it("weekend-only bars don't consume a lane (no spurious overflow chips)", () => {
    // month mode caps at 3 lanes. If the weekend-only bar kept its lane, the
    // three weekday bars would be pushed to lanes 1..3 and the last would
    // overflow into "+N 件" chips.
    const wkOnly = mkIssue({ id: 10, isOpen: false, createdAt: "2026-07-11", closedAt: "2026-07-12" });
    const weekday = [11, 12, 13].map((id) =>
      mkIssue({ id, isOpen: false, createdAt: "2026-07-06", closedAt: "2026-07-17" }),
    );
    const st = { ...monthState(anchorMon), hiddenDows: [0, 6] };
    const cal = buildCalendar([wkOnly, ...weekday], [], st, noop, TODAY, "checkpoint");
    expect(cal.weeks.flatMap((w) => w.segments).filter((s) => s.kind === "overflow").length).toBe(0);
  });

  it("shrinks the grids to visible columns and filters weekday labels", () => {
    const cal = buildCalendar([], [], wk([0, 6]), noop, TODAY, "checkpoint");
    expect(cal.weekdayLabels).toEqual(["月", "火", "水", "木", "金"]);
    expect(cal.weekdayRowStyle.gridTemplateColumns).toBe("repeat(5,minmax(0,1fr))");
    expect(cal.weeks[0].days.length).toBe(5);
    expect(cal.weeks[0].gridStyle.gridTemplateColumns).toBe("repeat(5,minmax(0,1fr))");
    expect(cal.weeks[0].headStyle.gridTemplateColumns).toBe("repeat(5,minmax(0,1fr))");
  });

  it("positions the today strip in compressed columns", () => {
    // TODAY (Wed) sits in the week of 06-29; Mon..Fri visible -> column 2 of 5.
    const cal = buildCalendar([], [], { ...twoWeekState(TODAY), hiddenDows: [0, 6] }, noop, TODAY, "checkpoint");
    expect(cal.weeks[0].todayCol).toBe(2);
    expect(cal.weeks[0].todayStripStyle!.left).toBe("40%");
    expect(cal.weeks[0].todayStripStyle!.width).toBe("20%");
  });

  it("hides the today strip when today's weekday is hidden", () => {
    const cal = buildCalendar([], [], { ...twoWeekState(TODAY), hiddenDows: [3] }, noop, TODAY, "checkpoint");
    expect(cal.weeks[0].todayCol).toBeNull();
    expect(cal.weeks[0].todayStripStyle).toBeNull();
  });

  it("snaps the due tick to the last visible day and compresses the overrun", () => {
    // due Sunday 07-12 (hidden) -> tick on Friday 07-10; late close 07-15 ->
    // overrun hatch on Mon..Wed of the next week.
    const iss = mkIssue({ id: 4, isOpen: false, createdAt: "2026-07-08", dueDate: "2026-07-12", closedAt: "2026-07-15" });
    const cal = buildCalendar([iss], [], wk([0, 6]), noop, TODAY, "checkpoint");
    const tick = cal.weeks[0].segments.find((s) => s.kind === "duetick" && s.id === 4)!;
    expect(tick.colStart).toBe(4); // Friday 07-10
    expect(cal.weeks[1].segments.filter((s) => s.kind === "duetick").length).toBe(0);
    const over = cal.weeks[1].segments.find((s) => s.kind === "overrun" && s.id === 4)!;
    expect(over.colStart).toBe(0); // Mon 07-13
    expect(over.colSpan).toBe(3); // 07-13 .. 07-15
  });

  it("places overflow chips at compressed columns", () => {
    const many = [21, 22, 23, 24].map((id) =>
      mkIssue({ id, isOpen: false, createdAt: "2026-07-06", closedAt: "2026-07-17" }),
    );
    const st = { ...monthState(anchorMon), hiddenDows: [0, 6] };
    const cal = buildCalendar(many, [], st, noop, TODAY, "checkpoint");
    const chips = cal.weeks.flatMap((w) => w.segments).filter((s) => s.kind === "overflow");
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((c) => c.colStart >= 0 && c.colStart <= 4)).toBe(true);
  });

  it("builds dowToggles Monday-first with the hidden days inactive", () => {
    const cal = buildCalendar([], [], wk([0, 6]), noop, TODAY, "checkpoint");
    expect(cal.dowToggles.map((t) => t.label)).toEqual(["月", "火", "水", "木", "金", "土", "日"]);
    expect(cal.dowToggles.map((t) => t.active)).toEqual([true, true, true, true, true, false, false]);
    expect(cal.dowToggles.every((t) => !t.disabled)).toBe(true);
  });

  it("disables the last visible chip and toggles through functional patch", () => {
    let state: DashState = { ...twoWeekState(anchorMon), hiddenDows: [0, 2, 3, 4, 5, 6] }; // only Monday
    const patch: Patch = (p) => {
      state = { ...state, ...(typeof p === "function" ? p(state) : p) };
    };
    const cal = buildCalendar([], [], state, patch, TODAY, "checkpoint");
    const [mon, tue] = cal.dowToggles;
    expect(mon.active).toBe(true);
    expect(mon.disabled).toBe(true);
    mon.onClick(); // guarded — hiding the last column is a no-op
    expect(state.hiddenDows).toEqual([0, 2, 3, 4, 5, 6]);
    expect(tue.active).toBe(false);
    tue.onClick(); // re-show Tuesday
    expect(state.hiddenDows).toEqual([0, 3, 4, 5, 6]);
  });
});

describe("distribution box plots (renderVals)", () => {
  const distState = (): DashState => ({
    status: "all",
    sort: "linger",
    labels: [],
    assignees: [],
    milestones: [],
    hiddenDows: [],
    groupBy: "milestone",
    hovered: null,
    panel: "dist",
    calMode: "twoweek",
    calAnchor: TODAY,
    scheduleStart: dayIndex("2026-06-01"),
    scheduleEnd: dayIndex("2026-12-01"),
    fullscreen: false,
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

describe("label filtering spans all labels (display stays on the first)", () => {
  const meta = { repo: "r", project: "R", asOf: "2026-07-01", milestones: [], checkpointLabel: "checkpoint" };
  const stateWithLabels = (labels: string[]): DashState => ({
    status: "all",
    sort: "linger",
    labels,
    assignees: [],
    milestones: [],
    hiddenDows: [],
    groupBy: "label",
    hovered: null,
    panel: "ranking",
    calMode: "twoweek",
    calAnchor: TODAY,
    scheduleStart: dayIndex("2026-06-01"),
    scheduleEnd: dayIndex("2026-12-01"),
    fullscreen: false,
  });
  // #1 leads with A but also carries B; #2 only has A.
  const twoLabelIssues = () => [
    mkIssue({ id: 1, label: { name: "A", color: "1 1 1" }, labelNames: ["A", "B"] }),
    mkIssue({ id: 2, label: { name: "A", color: "1 1 1" }, labelNames: ["A"] }),
  ];

  it("issueFilterLabels: all labels, or the representative when none", () => {
    expect(issueFilterLabels(mkIssue({ labelNames: ["A", "B"] }))).toEqual(["A", "B"]);
    expect(
      issueFilterLabels(mkIssue({ label: { name: "未分類", color: "110 118 129" }, labelNames: [] })),
    ).toEqual(["未分類"]);
  });

  it("deriveLabelDefs counts every label an issue carries, not just the first", () => {
    const byName = Object.fromEntries(deriveLabelDefs(twoLabelIssues()).map((d) => [d.n, d.count]));
    expect(byName).toEqual({ A: 2, B: 1 }); // B is listed even though it never leads
  });

  it("renderVals matches an issue by a non-leading label", () => {
    const v = renderVals(twoLabelIssues(), stateWithLabels(["B"]), noop, meta);
    expect(v.rows.length).toBe(1); // only #1 carries B
    expect(v.filterSummary.startsWith("1 件")).toBe(true);
  });
});

describe("reconstructBurndown", () => {
  const D = (iso: string) => dayIndex(iso);
  it("endpoints: ideal starts at scope, ends at 0; scope creep raises total mid-domain", () => {
    const issues = [
      mkIssue({ id: 1, isOpen: false, createdAt: "2026-06-20", closedAt: "2026-06-25" }),
      mkIssue({ id: 2, isOpen: true, createdAt: "2026-06-20" }),
      mkIssue({ id: 3, isOpen: true, createdAt: "2026-06-27" }), // created AFTER the start = scope creep
    ];
    const bd = reconstructBurndown(issues, D("2026-06-20"), D("2026-06-30"));
    expect(bd.length).toBe(11); // inclusive daily samples
    expect(bd[0].ideal).toBe(3); // ideal(start) = scope
    expect(bd[bd.length - 1].ideal).toBe(0); // ideal(end) = 0
    expect(bd[0].total).toBe(2); // #3 not yet in scope
    expect(bd[0].remaining).toBe(2); // #1 closes on 25th (> 20th) so still open at start
    const at27 = bd.find((p) => p.day === D("2026-06-27"))!;
    expect(at27.total).toBe(3); // scope crept up to 3
    expect(at27.remaining).toBe(2); // #1 closed, #2 & #3 open
    expect(bd[bd.length - 1].remaining).toBe(2); // #2, #3 still open
  });
  it("counts a due-less open issue in remaining and guards a single-day domain", () => {
    const issues = [mkIssue({ id: 1, isOpen: true, createdAt: "2026-06-20", dueDate: null })];
    const bd = reconstructBurndown(issues, D("2026-06-25"), D("2026-06-25"));
    expect(bd.length).toBe(1);
    expect(bd[0].remaining).toBe(1);
  });
});

describe("milestoneHealth", () => {
  const openPastDue = mkIssue({ id: 1, isOpen: true, dueDate: "2026-06-20" }); // overdue vs TODAY
  it("err when the milestone has an overdue open issue", () => {
    expect(milestoneHealth([openPastDue], dayIndex("2026-07-20"), TODAY, 1, 5)).toBe("err");
  });
  it("err when the due date passed with work still remaining (no per-issue due)", () => {
    const openNoDue = mkIssue({ id: 2, isOpen: true, dueDate: null });
    expect(milestoneHealth([openNoDue], dayIndex("2026-06-25"), TODAY, 1, 0)).toBe("err");
  });
  it("warn when behind the ideal pace", () => {
    const openNoDue = mkIssue({ id: 2, isOpen: true, dueDate: null });
    expect(milestoneHealth([openNoDue], dayIndex("2026-07-20"), TODAY, 5, 2)).toBe("warn");
  });
  it("ok when on pace and nothing overdue", () => {
    const closedOnTime = mkIssue({ id: 3, isOpen: false, dueDate: "2026-06-20", closedAt: "2026-06-19" });
    expect(milestoneHealth([closedOnTime], dayIndex("2026-07-20"), TODAY, 0, 0)).toBe("ok");
  });
});

describe("buildExecutiveSchedule", () => {
  const milestones: Milestone[] = [
    { id: 1, title: "Release", startDate: "2026-06-15", dueDate: "2026-08-15", state: "active" },
    { id: 2, title: "Migration", startDate: "2026-07-01", dueDate: "2026-09-01", state: "active" },
    { id: 3, title: "No plan", startDate: null, dueDate: "2026-09-30", state: "active" },
    { id: 4, title: "Next year", startDate: "2027-01-01", dueDate: "2027-02-01", state: "active" },
  ];

  it("groups only Open work by assignee and repeats a milestone for each owner", () => {
    const issues = [
      mkIssue({ id: 1, assignee: "Alice", milestone: "Release", isOpen: true, dueDate: "2026-06-20" }),
      mkIssue({ id: 2, assignee: "Bob", milestone: "Release", isOpen: true, dueDate: "2026-07-10" }),
      mkIssue({ id: 3, assignee: "Alice", milestone: "Release", isOpen: false, closedAt: "2026-06-25" }),
    ];
    const result = buildExecutiveSchedule(issues, milestones, TODAY, dayIndex("2026-06-01"), dayIndex("2026-12-01"));
    expect(result.lanes.map((lane) => lane.name).sort()).toEqual(["Alice", "Bob"]);
    expect(result.open).toBe(2);
    expect(result.lanes.every((lane) => lane.bars[0].title === "Release")).toBe(true);
    expect(result.lanes.find((lane) => lane.name === "Alice")!.bars[0].issues.map((it) => it.id)).toEqual([1]);
  });

  it("packs overlapping milestones into sublanes and clips range-crossing bars", () => {
    const issues = [
      mkIssue({ id: 1, assignee: "Alice", milestone: "Release" }),
      mkIssue({ id: 2, assignee: "Alice", milestone: "Migration" }),
    ];
    const result = buildExecutiveSchedule(issues, milestones, TODAY, dayIndex("2026-07-01"), dayIndex("2026-08-01"));
    const lane = result.lanes[0];
    expect(lane.sublaneCount).toBe(2);
    expect(lane.bars.find((bar) => bar.title === "Release")!.continuesBefore).toBe(true);
    expect(lane.bars.every((bar) => bar.continuesAfter)).toBe(true);
  });

  it("separates incomplete plans and counts scheduled milestones outside the range", () => {
    const issues = [
      mkIssue({ id: 1, assignee: "Alice", milestone: "No plan" }),
      mkIssue({ id: 2, assignee: "Alice", milestone: "Next year" }),
    ];
    const result = buildExecutiveSchedule(issues, milestones, TODAY, dayIndex("2026-06-01"), dayIndex("2026-12-01"));
    expect(result.unscheduled[0].items[0].title).toBe("No plan");
    expect(result.outOfRange).toBe(1);
    expect(result.lanes).toHaveLength(0);
  });
});

describe("buildMilestoneCalendar", () => {
  const ms: Milestone = { id: 1, title: "MS", startDate: "2026-06-20", dueDate: "2026-07-11", state: "active" };
  const subset = () => [
    // closed (dissolve into progress/burndown)
    mkIssue({ id: 10, milestone: "MS", isOpen: false, createdAt: "2026-06-20", closedAt: "2026-06-25", dueDate: "2026-06-25" }),
    mkIssue({ id: 11, milestone: "MS", isOpen: false, createdAt: "2026-06-20", closedAt: "2026-06-30", dueDate: "2026-06-30" }),
    // open, overdue -> labeled tick + overdue bucket
    mkIssue({ id: 12, milestone: "MS", isOpen: true, createdAt: "2026-06-22", dueDate: "2026-06-28" }),
    // open, due soon (within ±14d, this week) -> labeled tick + thisWeek bucket
    mkIssue({ id: 13, milestone: "MS", isOpen: true, createdAt: "2026-06-24", dueDate: "2026-07-04" }),
    // open, far future, not checkpoint -> collapsed into +N + later bucket
    mkIssue({ id: 14, milestone: "MS", isOpen: true, createdAt: "2026-06-24", dueDate: "2026-07-20" }),
    // open, far future BUT checkpoint -> labeled tick + later bucket
    mkIssue({ id: 15, milestone: "MS", isOpen: true, createdAt: "2026-06-24", dueDate: "2026-07-25", isCheckpoint: true }),
    // open, no due date -> not ticked, later bucket, still counts in remaining
    mkIssue({ id: 16, milestone: "MS", isOpen: true, createdAt: "2026-06-24", dueDate: null }),
  ];

  it("builds one row with progress KPIs over all statuses", () => {
    const r = buildMilestoneCalendar(subset(), [ms], TODAY, "checkpoint");
    expect(r.rows.length).toBe(1);
    const row = r.rows[0];
    expect(row.total).toBe(7);
    expect(row.done).toBe(2);
    expect(row.pct).toBe(29); // round(2/7)
    expect(row.remaining).toBe(5);
    expect(row.overdue).toBe(1); // #12 open & past due
    expect(row.healthTone).toBe("err"); // has an overdue open issue
    expect(row.bar).not.toBeNull();
    expect(row.dueX).not.toBeNull();
  });

  it("labels overdue/checkpoint/near ticks individually and collapses the safe-future bulk", () => {
    const row = buildMilestoneCalendar(subset(), [ms], TODAY, "checkpoint").rows[0];
    const labeledIds = row.ticks.map((t) => t.id).sort((a, b) => a - b);
    expect(labeledIds).toEqual([12, 13, 15]); // overdue, near, checkpoint
    expect(row.moreChip).not.toBeNull();
    expect(row.moreChip!.count).toBe(1); // only #14 (far, non-checkpoint)
    expect(row.moreChip!.refs[0].id).toBe(14);
  });

  it("splits open issues into overdue / thisWeek / later (no-due lands in later)", () => {
    const row = buildMilestoneCalendar(subset(), [ms], TODAY, "checkpoint").rows[0];
    expect(row.buckets.overdue.map((r) => r.id)).toEqual([12]);
    expect(row.buckets.thisWeek.map((r) => r.id)).toEqual([13]);
    expect(row.buckets.later.map((r) => r.id)).toEqual([14, 15, 16]); // incl. the due-less #16
    expect(row.buckets.later.find((r) => r.id === 16)!.dueLabel).toBe("期限なし");
  });

  it("exposes a reconstructable burndown and a month/today axis", () => {
    const r = buildMilestoneCalendar(subset(), [ms], TODAY, "checkpoint");
    expect(r.rows[0].spark.hasData).toBe(true);
    expect(r.rows[0].burndown.hasData).toBe(true);
    expect(r.gridLines.length).toBeGreaterThan(0);
    expect(r.weekLines.map((w) => w.label)).toEqual(["6/22", "6/29", "7/6", "7/13", "7/20"]);
    expect(r.weekLines.every((w) => w.date.startsWith("2026-"))).toBe(true);
    expect(r.todayX).not.toBeNull();
    expect(r.empty).toBe(false);
  });

  it("keeps a dateless, issue-less milestone as a KPI-only row (no bar)", () => {
    const bare: Milestone = { id: 2, title: "空", startDate: null, dueDate: null, state: "active" };
    const row = buildMilestoneCalendar([], [bare], TODAY, "checkpoint").rows[0];
    expect(row.hasSchedule).toBe(false);
    expect(row.bar).toBeNull();
    expect(row.total).toBe(0);
    expect(row.spark.hasData).toBe(false);
  });

  it("attaches hover tips to ticks, the +N chip, and the row", () => {
    const row = buildMilestoneCalendar(subset(), [ms], TODAY, "checkpoint").rows[0];
    // tick tip: issue title + assignee / status / due / variance rows
    const tick = row.ticks.find((t) => t.id === 12)!;
    expect(tick.tip.title).toBe("#12 t");
    expect(tick.tip.rows.map((r) => r.k)).toEqual(["担当者", "状態", "期限", "予実"]);
    expect(tick.tip.rows.find((r) => r.k === "期限")!.v).toBe("6/28");
    // chip tip lists the collapsed refs
    expect(row.moreChip!.tip.title).toBe("+1 件（期限が先の未完）");
    expect(row.moreChip!.tip.rows).toEqual([{ k: "#14", v: "t · 7/20" }]);
    // row tip carries schedule + progress + members
    expect(row.tip.title).toBe("MS");
    const rowVals = Object.fromEntries(row.tip.rows.map((r) => [r.k, r.v]));
    expect(rowVals["状態"]).toBe("進行中");
    expect(rowVals["進捗"]).toBe("2/7 件（29%）");
    expect(rowVals["残作業"]).toBe("5 件（超過 1）");
    expect(rowVals["配下"]).toContain("#10");
  });

  it("caps the chip tip at 6 rows with an …他N件 tail", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      mkIssue({ id: 30 + i, milestone: "MS", isOpen: true, createdAt: "2026-06-24", dueDate: "2026-08-10" }),
    );
    const row = buildMilestoneCalendar(many, [ms], TODAY, "checkpoint").rows[0];
    expect(row.moreChip!.count).toBe(8);
    expect(row.moreChip!.tip.rows.length).toBe(7); // 6 refs + tail
    expect(row.moreChip!.tip.rows[6]).toEqual({ k: "", v: "…他2件" });
  });
});

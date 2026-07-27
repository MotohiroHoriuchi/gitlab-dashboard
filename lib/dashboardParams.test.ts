import { describe, expect, it } from "vitest";
import {
  readDashboardUrlState,
  writeDashboardUrlState,
  type DashboardUrlState,
} from "./dashboardParams";

const DAY = 86_400_000;
const dayIndex = (iso: string) => Math.floor(Date.parse(iso + "T00:00:00Z") / DAY);

const defaults: DashboardUrlState = {
  panel: "ranking",
  status: "all",
  sort: "linger",
  labels: [],
  assignees: [],
  milestones: [],
  groupBy: "label",
  calMode: "twoweek",
  calAnchor: dayIndex("2026-07-27"),
};

describe("dashboard URL parameters", () => {
  it("restores tabs, controls, repeated filters, and the calendar date", () => {
    const params = new URLSearchParams(
      "tab=calendar&status=open&sort=oldest&label=backend&label=要確認" +
        "&assignee=Alice&milestone=Sprint+12&group=assignee&cal=month&date=2026-08-03",
    );

    expect(readDashboardUrlState(params, defaults)).toEqual({
      panel: "calendar",
      status: "open",
      sort: "oldest",
      labels: ["backend", "要確認"],
      assignees: ["Alice"],
      milestones: ["Sprint 12"],
      groupBy: "assignee",
      calMode: "month",
      calAnchor: dayIndex("2026-08-03"),
    });
  });

  it("falls back for invalid scalar values and removes duplicate filters", () => {
    const params = new URLSearchParams(
      "tab=unknown&status=nope&label=a&label=a&label=&cal=year&date=2026-02-31",
    );

    expect(readDashboardUrlState(params, defaults)).toEqual({
      ...defaults,
      labels: ["a"],
    });
  });

  it("writes non-default state, removes stale dashboard values, and preserves unrelated params", () => {
    const current = new URLSearchParams(
      "embed=1&tab=dist&status=closed&label=stale&assignee=old&date=2025-01-01",
    );
    const state: DashboardUrlState = {
      ...defaults,
      panel: "roadmap",
      status: "open",
      sort: "recent",
      labels: ["backend", "要確認"],
      assignees: ["Alice Smith"],
      milestones: ["Sprint 12"],
      groupBy: "milestone",
      calMode: "month",
      calAnchor: dayIndex("2026-08-03"),
    };

    const written = writeDashboardUrlState(current, state, defaults);

    expect(written.get("embed")).toBe("1");
    expect(written.get("tab")).toBe("roadmap");
    expect(written.get("status")).toBe("open");
    expect(written.get("sort")).toBe("recent");
    expect(written.getAll("label")).toEqual(["backend", "要確認"]);
    expect(written.getAll("assignee")).toEqual(["Alice Smith"]);
    expect(written.getAll("milestone")).toEqual(["Sprint 12"]);
    expect(written.get("group")).toBe("milestone");
    expect(written.get("cal")).toBe("month");
    expect(written.get("date")).toBe("2026-08-03");
  });

  it("omits defaults and round-trips encoded filter names", () => {
    const state: DashboardUrlState = {
      ...defaults,
      labels: ["needs review", "表示/確認"],
      milestones: ["Release & QA"],
    };

    const written = writeDashboardUrlState(new URLSearchParams("tab=team"), state, defaults);

    expect(written.has("tab")).toBe(false);
    expect(readDashboardUrlState(written, defaults)).toEqual(state);
  });
});

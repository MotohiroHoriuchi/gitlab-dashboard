import { describe, it, expect } from "vitest";
import {
  mapIssue,
  mapMilestone,
  pickLabel,
  labelNamesOf,
  hexToRgbTriple,
  getConfig,
  ConfigError,
  type GitLabIssue,
} from "./gitlab";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-01T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

describe("hexToRgbTriple", () => {
  it("converts 6-digit hex", () => {
    expect(hexToRgbTriple("#d9534f")).toBe("217 83 79");
    expect(hexToRgbTriple("f85149")).toBe("248 81 73");
  });
  it("expands 3-digit hex", () => {
    expect(hexToRgbTriple("#f53")).toBe("255 85 51");
  });
  it("falls back to muted gray on invalid input", () => {
    expect(hexToRgbTriple("nope")).toBe("110 118 129");
    expect(hexToRgbTriple("")).toBe("110 118 129");
  });
});

describe("pickLabel", () => {
  it("uses the first label with detail color", () => {
    expect(pickLabel([{ name: "bug", color: "#f85149" }, { name: "ux", color: "#8b949e" }])).toEqual({
      name: "bug",
      color: "248 81 73",
    });
  });
  it("handles plain-string labels (no detail)", () => {
    expect(pickLabel(["feature"])).toEqual({ name: "feature", color: "110 118 129" });
  });
  it("returns 未分類 when no labels", () => {
    expect(pickLabel([])).toEqual({ name: "未分類", color: "110 118 129" });
    expect(pickLabel(undefined)).toEqual({ name: "未分類", color: "110 118 129" });
  });
});

describe("mapIssue", () => {
  it("maps an open issue: linger = age, closedAgo null", () => {
    const raw: GitLabIssue = {
      iid: 42,
      title: "still open",
      state: "opened",
      created_at: daysAgo(100),
      closed_at: null,
      labels: [{ name: "tech-debt", color: "#d4a72c" }],
      assignees: [{ name: "佐藤 玲" }],
      milestone: { title: "v1.5" },
    };
    expect(mapIssue(raw, NOW)).toEqual({
      id: 42,
      title: "still open",
      isOpen: true,
      linger: 100,
      openedAgo: 100,
      closedAgo: null,
      assignee: "佐藤 玲",
      milestone: "v1.5",
      label: { name: "tech-debt", color: "212 167 44" },
      createdAt: raw.created_at,
      closedAt: null,
      dueDate: null,
      startDate: null,
      labelNames: ["tech-debt"],
      isCheckpoint: false,
    });
  });

  it("maps a closed issue: linger = closed-created, closedAgo set", () => {
    const raw: GitLabIssue = {
      iid: 7,
      title: "fixed",
      state: "closed",
      created_at: daysAgo(100),
      closed_at: daysAgo(40),
      labels: [{ name: "bug", color: "#f85149" }],
      assignees: [],
      assignee: { name: "田中 健" },
      milestone: null,
    };
    const m = mapIssue(raw, NOW);
    expect(m.isOpen).toBe(false);
    expect(m.linger).toBe(60);
    expect(m.openedAgo).toBe(100);
    expect(m.closedAgo).toBe(40);
    expect(m.assignee).toBe("田中 健"); // falls back to deprecated single assignee
    expect(m.milestone).toBe("Backlog"); // null milestone
    expect(m.closedAt).toBe(raw.closed_at); // absolute close date retained
    expect(m.dueDate).toBeNull();
    expect(m.isCheckpoint).toBe(false);
  });

  it("detects the checkpoint label even when it is NOT the representative (first) label", () => {
    const raw: GitLabIssue = {
      iid: 1,
      title: "gate",
      state: "opened",
      created_at: daysAgo(5),
      closed_at: null,
      due_date: "2026-08-01",
      labels: [
        { name: "bug", color: "#f85149" },
        { name: "checkpoint", color: "#cccccc" },
      ],
    };
    const m = mapIssue(raw, NOW);
    expect(m.isCheckpoint).toBe(true);
    expect(m.labelNames).toEqual(["bug", "checkpoint"]);
    expect(m.dueDate).toBe("2026-08-01");
    expect(m.startDate).toBeNull();
    expect(m.label.name).toBe("bug"); // representative label is still the first
  });

  it("derives startDate from the iteration when the issue has no own start_date", () => {
    const raw: GitLabIssue = {
      iid: 3,
      title: "sprint task",
      state: "opened",
      created_at: daysAgo(10),
      closed_at: null,
      iteration: { start_date: "2026-07-06", due_date: "2026-07-19", title: null },
    };
    expect(mapIssue(raw, NOW).startDate).toBe("2026-07-06");
  });

  it("prefers the issue's own start_date over the iteration's", () => {
    const raw: GitLabIssue = {
      iid: 4,
      title: "has own start",
      state: "opened",
      created_at: daysAgo(10),
      closed_at: null,
      start_date: "2026-07-02",
      iteration: { start_date: "2026-07-06" },
    };
    expect(mapIssue(raw, NOW).startDate).toBe("2026-07-02");
  });

  it("startDate is null when neither start_date nor iteration is present", () => {
    const raw: GitLabIssue = {
      iid: 5,
      title: "no start",
      state: "opened",
      created_at: daysAgo(10),
      closed_at: null,
    };
    expect(mapIssue(raw, NOW).startDate).toBeNull();
  });

  it("checkpoint match is case-insensitive and label name is configurable", () => {
    const raw: GitLabIssue = {
      iid: 2,
      title: "x",
      state: "opened",
      created_at: daysAgo(1),
      closed_at: null,
      labels: [{ name: "CheckPoint" }],
    };
    expect(mapIssue(raw, NOW).isCheckpoint).toBe(true); // default "checkpoint", case-insensitive
    const jp: GitLabIssue = { ...raw, labels: [{ name: "期限" }] };
    expect(mapIssue(jp, NOW, "期限").isCheckpoint).toBe(true);
    expect(mapIssue(jp, NOW).isCheckpoint).toBe(false); // "期限" != default "checkpoint"
  });
});

describe("labelNamesOf", () => {
  it("collects every label name (object or string), dropping empties", () => {
    expect(labelNamesOf([{ name: "a" }, "b", { name: "" }, { color: "#fff" }])).toEqual(["a", "b"]);
    expect(labelNamesOf(undefined)).toEqual([]);
  });
});

describe("mapMilestone", () => {
  it("maps start/due dates through", () => {
    expect(
      mapMilestone({ id: 3, title: "v2", start_date: "2026-07-01", due_date: "2026-08-15", state: "active" }),
    ).toEqual({ id: 3, title: "v2", startDate: "2026-07-01", dueDate: "2026-08-15", state: "active" });
  });
  it("passes null dates through", () => {
    expect(
      mapMilestone({ id: 4, title: "nodate", start_date: null, due_date: null, state: "closed" }),
    ).toEqual({ id: 4, title: "nodate", startDate: null, dueDate: null, state: "closed" });
  });

  it("closed without closed_at falls back to linger = openedAgo", () => {
    const raw: GitLabIssue = {
      iid: 9,
      title: "weird",
      state: "closed",
      created_at: daysAgo(30),
      closed_at: null,
      labels: [],
    };
    const m = mapIssue(raw, NOW);
    expect(m.linger).toBe(30);
    expect(m.closedAgo).toBeNull();
    expect(m.assignee).toBe("未割当");
    expect(m.label).toEqual({ name: "未分類", color: "110 118 129" });
  });
});

describe("getConfig", () => {
  it("throws ConfigError listing every missing var", () => {
    expect(() => getConfig({})).toThrow(ConfigError);
    try {
      getConfig({ GITLAB_BASE_URL: "https://gitlab.com" });
    } catch (e) {
      expect((e as Error).message).toContain("GITLAB_PROJECT_ID");
      expect((e as Error).message).toContain("GITLAB_TOKEN");
      expect((e as Error).message).not.toContain("GITLAB_BASE_URL");
    }
  });
  it("parses a full config with defaults", () => {
    const cfg = getConfig({
      GITLAB_BASE_URL: "https://gitlab.com/",
      GITLAB_PROJECT_ID: "acme/web",
      GITLAB_TOKEN: "glpat-x",
    });
    expect(cfg).toEqual({
      baseUrl: "https://gitlab.com", // trailing slash trimmed
      projectId: "acme/web",
      token: "glpat-x",
      maxIssues: 2000,
      checkpointLabel: "checkpoint", // default
    });
  });
  it("reads the CHECKPOINT_LABEL override", () => {
    const cfg = getConfig({
      GITLAB_BASE_URL: "https://gitlab.com",
      GITLAB_PROJECT_ID: "1",
      GITLAB_TOKEN: "glpat-x",
      CHECKPOINT_LABEL: "gate",
    });
    expect(cfg.checkpointLabel).toBe("gate");
  });
});

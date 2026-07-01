import { describe, it, expect } from "vitest";
import {
  mapIssue,
  pickLabel,
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
    });
  });
});

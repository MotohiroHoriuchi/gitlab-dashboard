// Server-only GitLab REST API client + issue mapping.
// The token lives here and never crosses to the browser.

import type { ApiResponse, Issue, IssueLabel, Milestone } from "./types";

const DAY = 86_400_000;
const UNLABELED: IssueLabel = { name: "未分類", color: "110 118 129" };
const CHECKPOINT_DEFAULT = "checkpoint";

export class ConfigError extends Error {}
export class GitLabError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface GitLabConfig {
  baseUrl: string;
  projectId: string;
  token: string;
  maxIssues: number;
  checkpointLabel: string;
}

type Env = Record<string, string | undefined>;

/** Read + validate env. Throws ConfigError listing every missing required var. */
export function getConfig(env: Env = process.env): GitLabConfig {
  const baseUrl = (env.GITLAB_BASE_URL || "").replace(/\/+$/, "");
  const projectId = env.GITLAB_PROJECT_ID || "";
  const token = env.GITLAB_TOKEN || "";
  const missing = [
    !baseUrl && "GITLAB_BASE_URL",
    !projectId && "GITLAB_PROJECT_ID",
    !token && "GITLAB_TOKEN",
  ].filter(Boolean);
  if (missing.length) {
    throw new ConfigError(`必須の環境変数が未設定です: ${missing.join(", ")}`);
  }
  const maxIssues = Number(env.GITLAB_MAX_ISSUES) || 2000;
  const checkpointLabel = (env.CHECKPOINT_LABEL || CHECKPOINT_DEFAULT).trim();
  return { baseUrl, projectId, token, maxIssues, checkpointLabel };
}

/* ---------------------------- pure mappers ---------------------------- */

/** "#d9534f" / "d9534f" / "#f53" -> "217 83 79". Invalid input -> muted gray. */
export function hexToRgbTriple(hex: string): string {
  let h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return "110 118 129";
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

type RawLabel = string | { name?: string; color?: string };

/** Representative label = first label on the issue (design is 1-label-per-issue).
 *  With `with_labels_details=true` labels are objects carrying `color`. */
export function pickLabel(labels: RawLabel[] | undefined): IssueLabel {
  if (!labels || !labels.length) return UNLABELED;
  const first = labels[0];
  if (typeof first === "string") return { name: first, color: UNLABELED.color };
  return { name: first.name || "未分類", color: hexToRgbTriple(first.color || "") };
}

/** All label names on the issue (the calendar needs the full set to spot the
 *  checkpoint label, which pickLabel would drop unless it happened to be first). */
export function labelNamesOf(labels: RawLabel[] | undefined): string[] {
  if (!labels) return [];
  return labels.map((l) => (typeof l === "string" ? l : l.name || "")).filter(Boolean);
}

export interface GitLabIssue {
  iid: number;
  title: string;
  state: string; // "opened" | "closed"
  created_at: string;
  closed_at: string | null;
  due_date?: string | null;
  start_date?: string | null; // top-level start date (newer GitLab / work items)
  iteration?: { start_date?: string | null; due_date?: string | null; title?: string | null } | null; // sprint window (Premium+)
  labels?: RawLabel[];
  assignees?: { name?: string }[];
  assignee?: { name?: string } | null;
  milestone?: { title?: string; start_date?: string | null; due_date?: string | null; state?: string } | null;
}

export interface GitLabMilestone {
  id: number;
  title: string;
  start_date: string | null;
  due_date: string | null;
  state: string;
}

/** GitLab issue -> normalized Issue. `now` is injected for deterministic tests.
 *  `checkpointLabel` is defaulted so 2-arg callers (tests) keep working. */
export function mapIssue(
  raw: GitLabIssue,
  now: number,
  checkpointLabel: string = CHECKPOINT_DEFAULT,
): Issue {
  const created = Date.parse(raw.created_at);
  const openedAgo = Math.max(0, Math.floor((now - created) / DAY));
  const isOpen = raw.state === "opened";
  let linger = openedAgo;
  let closedAgo: number | null = null;
  if (!isOpen) {
    const closed = raw.closed_at ? Date.parse(raw.closed_at) : NaN;
    if (!Number.isNaN(closed)) {
      linger = Math.max(0, Math.floor((closed - created) / DAY));
      closedAgo = Math.max(0, Math.floor((now - closed) / DAY));
    }
    // closed without a valid closed_at -> keep linger = openedAgo (safe side)
  }
  const assignee = raw.assignees?.[0]?.name || raw.assignee?.name || "未割当";
  const labelNames = labelNamesOf(raw.labels);
  const cp = checkpointLabel.toLowerCase();
  return {
    id: raw.iid,
    title: raw.title,
    isOpen,
    linger,
    openedAgo,
    closedAgo,
    assignee,
    milestone: raw.milestone?.title || "Backlog",
    label: pickLabel(raw.labels),
    createdAt: raw.created_at,
    closedAt: raw.closed_at ?? null,
    dueDate: raw.due_date ?? null,
    // start_date equivalents, best → weakest: the issue's own start date, else
    // its iteration (sprint) start. Milestone start is intentionally NOT used
    // here — milestones render as their own bars. Falls back to created_at in
    // issueInterval() when all are null.
    startDate: raw.start_date ?? raw.iteration?.start_date ?? null,
    labelNames,
    isCheckpoint: labelNames.some((n) => n.toLowerCase() === cp),
  };
}

/** GitLab milestone -> normalized Milestone. */
export function mapMilestone(m: GitLabMilestone): Milestone {
  return {
    id: m.id,
    title: m.title,
    startDate: m.start_date ?? null,
    dueDate: m.due_date ?? null,
    state: m.state,
  };
}

/* ---------------------------- fetching ---------------------------- */

function projectPath(cfg: GitLabConfig): string {
  // Numeric id passes through; a "group/project" path must be URL-encoded whole.
  return /^\d+$/.test(cfg.projectId) ? cfg.projectId : encodeURIComponent(cfg.projectId);
}

async function gitlabFetch(cfg: GitLabConfig, path: string): Promise<Response> {
  const res = await fetch(`${cfg.baseUrl}/api/v4${path}`, {
    headers: { "PRIVATE-TOKEN": cfg.token },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store", // caching lives in getIssues() (module TTL) — a Next fetch cache here would stack a second stale window on top
  });
  if (!res.ok) {
    const detail =
      res.status === 401
        ? "認証失敗（GITLAB_TOKEN を確認）"
        : res.status === 404
          ? "プロジェクトが見つからない（GITLAB_PROJECT_ID / 権限を確認）"
          : `HTTP ${res.status}`;
    throw new GitLabError(`GitLab API エラー: ${detail}`, res.status);
  }
  return res;
}

async function fetchAllRawIssues(cfg: GitLabConfig): Promise<GitLabIssue[]> {
  const out: GitLabIssue[] = [];
  let page = 1;
  const base = `/projects/${projectPath(cfg)}/issues?scope=all&state=all&with_labels_details=true&per_page=100`;
  while (out.length < cfg.maxIssues) {
    const res = await gitlabFetch(cfg, `${base}&page=${page}`);
    const batch = (await res.json()) as GitLabIssue[];
    out.push(...batch);
    const next = res.headers.get("x-next-page");
    if (!next) break;
    page = Number(next);
    if (!page) break;
  }
  return out.slice(0, cfg.maxIssues);
}

/** All milestones for the project (paginated). A dedicated fetch — rather than
 *  harvesting the milestone objects embedded on issues — so that milestones with
 *  zero issues (empty future planning buckets) still appear on the timeline.
 *  `include_ancestors=true` also picks up group-level milestones. Degrades to []
 *  on any error (e.g. milestone read permission) so the issues payload survives. */
async function fetchMilestones(cfg: GitLabConfig): Promise<GitLabMilestone[]> {
  try {
    const out: GitLabMilestone[] = [];
    let page = 1;
    const base = `/projects/${projectPath(cfg)}/milestones?per_page=100&include_ancestors=true`;
    while (true) {
      const res = await gitlabFetch(cfg, `${base}&page=${page}`);
      out.push(...((await res.json()) as GitLabMilestone[]));
      const next = res.headers.get("x-next-page");
      if (!next || !(page = Number(next))) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Project identity for the header: `repo` = "host/group/project" (canonical
 *  path, subtitle), `project` = GitLab's display name "Group / Project" (title).
 *  Degrades to the configured projectId on any error. */
async function fetchRepoMeta(cfg: GitLabConfig): Promise<{ repo: string; project: string }> {
  try {
    const res = await gitlabFetch(cfg, `/projects/${projectPath(cfg)}`);
    const p = (await res.json()) as {
      path_with_namespace?: string;
      name_with_namespace?: string;
    };
    const host = new URL(cfg.baseUrl).host;
    return {
      repo: p.path_with_namespace ? `${host}/${p.path_with_namespace}` : cfg.projectId,
      project: p.name_with_namespace || p.path_with_namespace || cfg.projectId,
    };
  } catch {
    return { repo: cfg.projectId, project: cfg.projectId };
  }
}

/** Full API payload for the dashboard (uncached). */
async function fetchFresh(env?: Env): Promise<ApiResponse> {
  const cfg = getConfig(env);
  const now = Date.now();
  const [raw, meta, rawMs] = await Promise.all([
    fetchAllRawIssues(cfg),
    fetchRepoMeta(cfg),
    fetchMilestones(cfg),
  ]);
  return {
    repo: meta.repo,
    project: meta.project,
    asOf: new Date(now).toISOString().slice(0, 10),
    fetchedAt: new Date(now).toISOString(),
    issues: raw.map((r) => mapIssue(r, now, cfg.checkpointLabel)),
    milestones: rawMs.map(mapMilestone),
    checkpointLabel: cfg.checkpointLabel,
  };
}

// Single explicit TTL cache, replacing the former two stacked Next caches
// (route revalidate + fetch revalidate) whose stale-while-revalidate windows
// compounded to ~3min of staleness. Past the TTL we await a fresh payload
// rather than serving stale, so worst-case staleness is exactly the TTL.
// Module state is fine: this app runs as a single Node process (standalone).
const CACHE_TTL_MS = 60_000;
let cached: { payload: ApiResponse; fetchedAt: number } | null = null;
let inFlight: Promise<ApiResponse> | null = null;

export async function getIssues(env?: Env): Promise<ApiResponse> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.payload;
  if (!inFlight) {
    // Concurrent callers (tabs polling in lockstep) share one upstream fetch.
    inFlight = fetchFresh(env)
      .then((payload) => {
        cached = { payload, fetchedAt: Date.now() };
        return payload;
      })
      .finally(() => {
        inFlight = null; // also on failure — errors propagate, never cached
      });
  }
  return inFlight;
}

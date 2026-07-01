// Server-only GitLab REST API client + issue mapping.
// The token lives here and never crosses to the browser.

import type { ApiResponse, Issue, IssueLabel } from "./types";

const DAY = 86_400_000;
const UNLABELED: IssueLabel = { name: "未分類", color: "110 118 129" };

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
  return { baseUrl, projectId, token, maxIssues };
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

export interface GitLabIssue {
  iid: number;
  title: string;
  state: string; // "opened" | "closed"
  created_at: string;
  closed_at: string | null;
  labels?: RawLabel[];
  assignees?: { name?: string }[];
  assignee?: { name?: string } | null;
  milestone?: { title?: string } | null;
}

/** GitLab issue -> normalized Issue. `now` is injected for deterministic tests. */
export function mapIssue(raw: GitLabIssue, now: number): Issue {
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
    next: { revalidate: 60 }, // TTL cache — avoids hammering GitLab across tabs/reloads
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

async function fetchRepoLabel(cfg: GitLabConfig): Promise<string> {
  try {
    const res = await gitlabFetch(cfg, `/projects/${projectPath(cfg)}`);
    const p = (await res.json()) as { path_with_namespace?: string };
    const host = new URL(cfg.baseUrl).host;
    return p.path_with_namespace ? `${host}/${p.path_with_namespace}` : cfg.projectId;
  } catch {
    return cfg.projectId;
  }
}

/** Full API payload for the dashboard. */
export async function getIssues(env?: Env): Promise<ApiResponse> {
  const cfg = getConfig(env);
  const now = Date.now();
  const [raw, repo] = await Promise.all([fetchAllRawIssues(cfg), fetchRepoLabel(cfg)]);
  return {
    repo,
    asOf: new Date(now).toISOString().slice(0, 10),
    issues: raw.map((r) => mapIssue(r, now)),
  };
}

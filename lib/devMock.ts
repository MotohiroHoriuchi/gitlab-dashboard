// TEMPORARY dev-only mock data. Used by app/api/issues/route.ts ONLY when the
// MOCK_GITLAB env flag is set (see .env.local). Lets the dashboard render the
// calendar without a live GitLab connection. Safe to delete this file (and the
// guarded branch in the route) once real credentials are available.

import type { ApiResponse, Issue, Milestone } from "./types";

const DAY = 86_400_000;
const daysBetween = (aIso: string, bMs: number) =>
  Math.max(0, Math.floor((bMs - Date.parse(aIso)) / DAY));

interface Seed {
  id: number;
  title: string;
  color: string; // "R G B"
  labelName: string;
  createdAt: string;
  dueDate?: string | null;
  startDate?: string | null;
  closedAt?: string | null;
  assignee?: string;
  milestone?: string;
  isCheckpoint?: boolean;
}

function toIssue(s: Seed, now: number): Issue {
  const isOpen = !s.closedAt;
  const openedAgo = daysBetween(s.createdAt, now);
  const linger = s.closedAt
    ? Math.max(0, Math.floor((Date.parse(s.closedAt) - Date.parse(s.createdAt)) / DAY))
    : openedAgo;
  const labelNames = s.isCheckpoint ? [s.labelName, "checkpoint"] : [s.labelName];
  return {
    id: s.id,
    title: s.title,
    isOpen,
    linger,
    openedAgo,
    closedAgo: s.closedAt ? daysBetween(s.closedAt, now) : null,
    assignee: s.assignee ?? "担当 太郎",
    milestone: s.milestone ?? "Backlog",
    label: { name: s.labelName, color: s.color },
    createdAt: s.createdAt,
    closedAt: s.closedAt ?? null,
    dueDate: s.dueDate ?? null,
    startDate: s.startDate ?? null,
    labelNames,
    isCheckpoint: !!s.isCheckpoint,
  };
}

const SEEDS: Seed[] = [
  { id: 101, title: "API設計", labelName: "design", color: "108 182 255", createdAt: "2026-06-28", dueDate: "2026-07-08", milestone: "Sprint 12" },
  { id: 102, title: "認証実装", labelName: "backend", color: "0 217 146", createdAt: "2026-07-02", dueDate: "2026-07-14", assignee: "鈴木 花子", milestone: "Sprint 12" },
  { id: 103, title: "レビュー対応（完了）", labelName: "bug", color: "248 81 73", createdAt: "2026-07-01", closedAt: "2026-07-06", milestone: "Sprint 12" },
  { id: 104, title: "調査タスク（期限なし＝当日まで）", labelName: "ops", color: "210 153 34", createdAt: "2026-06-20", assignee: "佐藤 玲", milestone: "Backlog" },
  { id: 105, title: "リリース判定", labelName: "gate", color: "176 131 240", createdAt: "2026-07-09", dueDate: "2026-07-15", isCheckpoint: true, milestone: "Sprint 12" },
  { id: 106, title: "重なりタスクA", labelName: "frontend", color: "255 166 87", createdAt: "2026-07-03", dueDate: "2026-07-12", assignee: "鈴木 花子" },
  { id: 107, title: "重なりタスクB", labelName: "infra", color: "87 171 90", createdAt: "2026-07-04", dueDate: "2026-07-18" },
  { id: 108, title: "スプリント作業（iteration開始日）", labelName: "backend", color: "0 217 146", createdAt: "2026-06-10", startDate: "2026-07-06", dueDate: "2026-07-13", assignee: "佐藤 玲", milestone: "Sprint 12" },
];

const MILESTONES: Milestone[] = [
  { id: 1, title: "Sprint 12", startDate: "2026-06-29", dueDate: "2026-07-19", state: "active" },
  { id: 2, title: "QAゲート", startDate: null, dueDate: "2026-07-10", state: "active" },
];

export function mockApiResponse(): ApiResponse {
  const now = Date.now();
  return {
    repo: "gitlab.example.com/team/app（モック）",
    asOf: new Date(now).toISOString().slice(0, 10),
    issues: SEEDS.map((s) => toIssue(s, now)),
    milestones: MILESTONES,
    checkpointLabel: "checkpoint",
  };
}

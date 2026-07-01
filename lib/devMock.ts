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
  labelName: string; // representative (first) label
  extraLabels?: string[]; // additional labels (multi-label issues)
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
  const labelNames = [
    s.labelName,
    ...(s.extraLabels ?? []),
    ...(s.isCheckpoint ? ["checkpoint"] : []),
  ];
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
  { id: 103, title: "レビュー対応（期限内完了）", labelName: "bug", color: "248 81 73", createdAt: "2026-07-01", dueDate: "2026-07-08", closedAt: "2026-07-06", milestone: "Sprint 12" },
  { id: 104, title: "調査タスク（期限なし＝当日まで）", labelName: "ops", color: "210 153 34", createdAt: "2026-06-20", assignee: "佐藤 玲", milestone: "Backlog" },
  { id: 105, title: "リリース判定", labelName: "gate", color: "176 131 240", createdAt: "2026-07-09", dueDate: "2026-07-15", isCheckpoint: true, milestone: "Sprint 12" },
  { id: 106, title: "重なりタスクA", labelName: "frontend", color: "255 166 87", createdAt: "2026-07-03", dueDate: "2026-07-12", assignee: "鈴木 花子" },
  { id: 107, title: "重なりタスクB", labelName: "infra", color: "87 171 90", createdAt: "2026-07-04", dueDate: "2026-07-18" },
  { id: 108, title: "スプリント作業（iteration開始日）", labelName: "backend", color: "0 217 146", createdAt: "2026-06-10", startDate: "2026-07-06", dueDate: "2026-07-13", assignee: "佐藤 玲", milestone: "Sprint 12" },
  { id: 109, title: "画面実装（遅延クローズ）", labelName: "frontend", color: "255 166 87", createdAt: "2026-07-02", dueDate: "2026-07-06", closedAt: "2026-07-10", assignee: "田中 一郎", milestone: "Sprint 12" },
  { id: 110, title: "データ移行（期限超過・進行中）", labelName: "backend", color: "0 217 146", createdAt: "2026-06-24", dueDate: "2026-06-29", assignee: "佐藤 玲", milestone: "Sprint 12" },
  { id: 111, title: "ドキュメント整備（期限どおり完了）", labelName: "docs", color: "108 182 255", createdAt: "2026-06-30", dueDate: "2026-07-03", closedAt: "2026-07-03", assignee: "田中 一郎", milestone: "Sprint 12" },
  { id: 112, title: "当日締切タスク（本日期限）", labelName: "ops", color: "210 153 34", createdAt: "2026-06-27", dueDate: "2026-07-01", assignee: "鈴木 花子", milestone: "Sprint 12" },
  { id: 113, title: "セキュリティ点検（CP・期限超過）", labelName: "gate", color: "176 131 240", createdAt: "2026-06-23", dueDate: "2026-06-28", isCheckpoint: true, assignee: "佐藤 玲", milestone: "Sprint 12" },
  { id: 114, title: "複合ラベル・未割当タスク", labelName: "frontend", color: "255 166 87", extraLabels: ["design", "ux"], createdAt: "2026-07-01", dueDate: "2026-07-09", assignee: "未割当", milestone: "Sprint 12" },
  { id: 115, title: "開始日あり・期限なし", labelName: "infra", color: "87 171 90", createdAt: "2026-06-15", startDate: "2026-06-30", assignee: "佐藤 玲", milestone: "Backlog" },
];

const MILESTONES: Milestone[] = [
  { id: 1, title: "Sprint 12", startDate: "2026-06-29", dueDate: "2026-07-19", state: "active" },
  { id: 2, title: "QAゲート", startDate: null, dueDate: "2026-07-10", state: "active" },
];

export function mockApiResponse(): ApiResponse {
  const now = Date.now();
  return {
    repo: "gitlab.example.com/team/app（モック）",
    project: "Team / App（モック）",
    asOf: new Date(now).toISOString().slice(0, 10),
    issues: SEEDS.map((s) => toIssue(s, now)),
    milestones: MILESTONES,
    checkpointLabel: "checkpoint",
  };
}

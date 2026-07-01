// Shared types for the GitLab issue dashboard.

/** A single representative label for an issue. `color` is a space-separated
 *  "R G B" triple (e.g. "217 83 79") so the `rgb()/rgba()` style helpers can
 *  compose alpha variants directly. */
export interface IssueLabel {
  name: string;
  color: string;
}

/** Normalized issue shape the frontend renders/aggregates against. Produced by
 *  the backend from the GitLab REST API (see lib/gitlab.ts). */
export interface Issue {
  id: number; // GitLab iid — shown as "#123"
  title: string;
  isOpen: boolean;
  linger: number; // isOpen ? days open so far : days open→close
  openedAgo: number; // days since created (for recent/oldest sort)
  closedAgo: number | null; // days since closed, or null when still open
  assignee: string;
  milestone: string;
  label: IssueLabel;
}

export interface ApiResponse {
  repo: string;
  asOf: string; // YYYY-MM-DD
  issues: Issue[];
}

export type StatusFilter = "all" | "open" | "closed";
export type SortMode = "linger" | "recent" | "oldest";
export type GroupBy = "label" | "assignee" | "milestone";
export type Panel = "ranking" | "dist";

export interface DashState {
  status: StatusFilter;
  sort: SortMode;
  labels: string[];
  groupBy: GroupBy;
  hovered: string | null;
  panel: Panel;
}

/** A label with its color + frequency, derived from the fetched issues (used
 *  to build the filter chips). */
export interface LabelDef {
  n: string;
  c: string;
  count: number;
}

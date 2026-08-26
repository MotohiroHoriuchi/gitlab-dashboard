// Shared types for the GitLab issue dashboard.

/** A single representative label for an issue. `color` is a space-separated
 *  "R G B" triple (e.g. "217 83 79") so the `rgb()/rgba()` style helpers can
 *  compose alpha variants directly. */
export interface IssueLabel {
  name: string;
  color: string;
}

/** GitLab linked-item link type. blocks / is_blocked_by only exist on
 *  Premium+; free tier always sends relates_to. */
export type LinkType = "relates_to" | "blocks" | "is_blocked_by";
export interface RelatedRef {
  iid: number;
  linkType: LinkType;
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
  // Absolute ISO dates — the calendar/timeline positions bars against these.
  createdAt: string; // full ISO (from created_at)
  closedAt: string | null; // full ISO (from closed_at) or null when open
  dueDate: string | null; // "YYYY-MM-DD" (from due_date) or null
  startDate: string | null; // "YYYY-MM-DD" — issue start_date, else iteration.start_date, else null
  labelNames: string[]; // ALL label names (checkpoint detection; pickLabel keeps only the first)
  isCheckpoint: boolean; // labelNames includes the configured checkpoint label
  // Work-item relations (GraphQL, lib/gitlab.ts). Empty when the instance
  // doesn't support the query — the calendar click-focus then only knows
  // milestone membership.
  parentIid: number | null; // hierarchy parent issue iid (Epic parents are dropped)
  childIids: number[]; // hierarchy children (tasks)
  related: RelatedRef[]; // linked items
}

/** A GitLab milestone reduced to what the timeline needs. */
export interface Milestone {
  id: number;
  title: string;
  startDate: string | null; // "YYYY-MM-DD" or null
  dueDate: string | null; // "YYYY-MM-DD" or null
  state: string; // "active" | "closed"
}

export type GitLabProtocol = "http" | "https";

export interface ApiResponse {
  repo: string; // "host/group/project" — canonical path, shown as the subtitle
  gitlabProtocol: GitLabProtocol; // GITLAB_BASE_URLのプロトコル。外部リンクの初期値に使う
  project: string; // GitLab display name ("Group / Project") — shown as the title
  asOf: string; // YYYY-MM-DD
  fetchedAt: string; // full ISO — when the server actually fetched from GitLab
  issues: Issue[];
  milestones: Milestone[];
  checkpointLabel: string; // label name that marks an issue as a checkpoint (legend text)
}

export type StatusFilter = "all" | "open" | "closed";
export type SortMode = "linger" | "recent" | "oldest";
export type GroupBy = "label" | "assignee" | "milestone";
export type Panel = "ranking" | "dist" | "calendar" | "schedule" | "roadmap" | "team";
export type CalMode = "month" | "twoweek";

export interface DashState {
  status: StatusFilter;
  sort: SortMode;
  labels: string[];
  assignees: string[];
  milestones: string[]; // selected milestone titles ("Backlog" = no milestone)
  hiddenDows: number[]; // non-working weekdays hidden on the calendar, JS getDay() 0=Sun..6=Sat
  groupBy: GroupBy;
  hovered: string | null;
  panel: Panel;
  calMode: CalMode;
  calAnchor: number; // UTC day-index (floor(ms/DAY)) of the anchor day
  scheduleStart: number; // executive schedule inclusive start, UTC day-index
  scheduleEnd: number; // executive schedule inclusive end, UTC day-index
  fullscreen: boolean; // calendar/roadmap: toolbar+view overlay the whole viewport (not persisted)
}

/** A label with its color + frequency, derived from the fetched issues (used
 *  to build the filter chips). */
export interface LabelDef {
  n: string;
  c: string;
  count: number;
}

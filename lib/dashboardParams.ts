import type {
  CalMode,
  DashState,
  GroupBy,
  Panel,
  SortMode,
  StatusFilter,
} from "./types";

export type DashboardUrlState = Pick<
  DashState,
  | "panel"
  | "status"
  | "sort"
  | "labels"
  | "assignees"
  | "milestones"
  | "groupBy"
  | "calMode"
  | "calAnchor"
  | "scheduleStart"
  | "scheduleEnd"
>;

const PANELS = ["ranking", "dist", "calendar", "schedule", "roadmap", "team"] as const;
const STATUSES = ["all", "open", "closed"] as const;
const SORTS = ["linger", "recent", "oldest"] as const;
const GROUPS = ["label", "assignee", "milestone"] as const;
const CAL_MODES = ["month", "twoweek"] as const;

const PARAM_KEYS = [
  "tab",
  "status",
  "sort",
  "label",
  "assignee",
  "milestone",
  "group",
  "cal",
  "date",
  "scheduleStart",
  "scheduleEnd",
] as const;

const DAY = 86_400_000;

function readEnum<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = params.get(key);
  return value !== null && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function readList(params: URLSearchParams, key: string, fallback: string[]): string[] {
  if (!params.has(key)) return fallback.slice();
  return [...new Set(params.getAll(key).filter((value) => value.length > 0))];
}

function formatDay(dayIndex: number): string {
  return new Date(dayIndex * DAY).toISOString().slice(0, 10);
}

function readDay(value: string | null, fallback: number): number {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = Date.parse(value + "T00:00:00Z");
  if (!Number.isFinite(parsed)) return fallback;
  const dayIndex = Math.floor(parsed / DAY);
  return formatDay(dayIndex) === value ? dayIndex : fallback;
}

export function toDashboardUrlState(state: DashState): DashboardUrlState {
  const {
    panel,
    status,
    sort,
    labels,
    assignees,
    milestones,
    groupBy,
    calMode,
    calAnchor,
    scheduleStart,
    scheduleEnd,
  } = state;
  return {
    panel,
    status,
    sort,
    labels,
    assignees,
    milestones,
    groupBy,
    calMode,
    calAnchor,
    scheduleStart,
    scheduleEnd,
  };
}

/** Reads URL-backed dashboard state. Invalid scalar values fall back to the
 * defaults; repeated filter parameters are de-duplicated in URL order. */
export function readDashboardUrlState(
  params: URLSearchParams,
  fallback: DashboardUrlState,
): DashboardUrlState {
  const candidateStart = readDay(params.get("scheduleStart"), fallback.scheduleStart);
  const candidateEnd = readDay(params.get("scheduleEnd"), fallback.scheduleEnd);
  const candidateDays = candidateEnd - candidateStart + 1;
  const validScheduleRange = candidateDays >= 28 && candidateDays <= 366;
  return {
    panel: readEnum<Panel>(params, "tab", PANELS, fallback.panel),
    status: readEnum<StatusFilter>(params, "status", STATUSES, fallback.status),
    sort: readEnum<SortMode>(params, "sort", SORTS, fallback.sort),
    labels: readList(params, "label", fallback.labels),
    assignees: readList(params, "assignee", fallback.assignees),
    milestones: readList(params, "milestone", fallback.milestones),
    groupBy: readEnum<GroupBy>(params, "group", GROUPS, fallback.groupBy),
    calMode: readEnum<CalMode>(params, "cal", CAL_MODES, fallback.calMode),
    calAnchor: readDay(params.get("date"), fallback.calAnchor),
    scheduleStart: validScheduleRange ? candidateStart : fallback.scheduleStart,
    scheduleEnd: validScheduleRange ? candidateEnd : fallback.scheduleEnd,
  };
}

/** Replaces only dashboard-owned parameters and preserves any unrelated query
 * parameters. Default values are omitted so the common URL stays compact. */
export function writeDashboardUrlState(
  current: URLSearchParams,
  state: DashboardUrlState,
  fallback: DashboardUrlState,
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const key of PARAM_KEYS) next.delete(key);

  if (state.panel !== fallback.panel) next.set("tab", state.panel);
  if (state.status !== fallback.status) next.set("status", state.status);
  if (state.sort !== fallback.sort) next.set("sort", state.sort);
  for (const label of state.labels) next.append("label", label);
  for (const assignee of state.assignees) next.append("assignee", assignee);
  for (const milestone of state.milestones) next.append("milestone", milestone);
  if (state.groupBy !== fallback.groupBy) next.set("group", state.groupBy);
  if (state.calMode !== fallback.calMode) next.set("cal", state.calMode);
  if (state.calAnchor !== fallback.calAnchor) next.set("date", formatDay(state.calAnchor));
  if (state.scheduleStart !== fallback.scheduleStart)
    next.set("scheduleStart", formatDay(state.scheduleStart));
  if (state.scheduleEnd !== fallback.scheduleEnd)
    next.set("scheduleEnd", formatDay(state.scheduleEnd));

  return next;
}

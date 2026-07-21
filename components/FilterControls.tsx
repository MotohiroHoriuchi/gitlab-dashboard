"use client";

import { S, T, rgb, type Vals } from "@/lib/logic";
import type { DashState } from "@/lib/types";
import FilterDropdown from "@/components/FilterDropdown";

/** Shared filter bar: 状態 → (並べ替え, when showSort) → ラベル → 担当者 → マイルストーン → 該当件数.
 *  Used by the issue-list tab (showSort), the calendar tab (no sort), and the
 *  roadmap tab (no status — progress needs open+closed; own summary text). */
export default function FilterControls({
  v,
  st,
  showSort,
  showStatus = true,
  summary,
  presentation = false,
}: {
  v: Vals;
  st: DashState;
  showSort: boolean;
  showStatus?: boolean;
  summary?: string;
  presentation?: boolean;
}) {
  const buttonStyle = (style: React.CSSProperties): React.CSSProperties =>
    presentation ? { ...style, padding: "9px 15px", fontSize: "16px" } : style;
  return (
    <div
      aria-label="表示内容の絞り込み"
      style={S(
        `display:flex; flex-wrap:wrap; align-items:center; gap:${presentation ? "16px 24px" : "14px 20px"}; padding:${presentation ? "15px 18px" : "13px 16px"}; background:${rgb(T.canvasSoft)}; border:1px solid ${rgb(T.hairline)}; border-radius:12px;`,
      )}
    >
      {showStatus && (
        <div style={S("display:flex; align-items:center; gap:9px;")}>
          <span style={S(`font-size:${presentation ? "15px" : "11px"}; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:700;`)}>状態</span>
          <div style={S("display:flex; gap:6px;")}>
            <button type="button" style={buttonStyle(v.statusBtns.all.style)} onClick={v.statusBtns.all.onClick}>すべて</button>
            <button type="button" style={buttonStyle(v.statusBtns.open.style)} onClick={v.statusBtns.open.onClick}>Open</button>
            <button type="button" style={buttonStyle(v.statusBtns.closed.style)} onClick={v.statusBtns.closed.onClick}>Closed</button>
          </div>
        </div>
      )}
      {showSort && (
        <div style={S("display:flex; align-items:center; gap:9px;")}>
          <span style={S(`font-size:${presentation ? "15px" : "11px"}; text-transform:uppercase; color:${rgb(T.muted)}; font-weight:700;`)}>並べ替え</span>
          <div style={S("display:flex; gap:6px;")}>
            <button type="button" style={buttonStyle(v.sortBtns.linger.style)} onClick={v.sortBtns.linger.onClick}>長引き順</button>
            <button type="button" style={buttonStyle(v.sortBtns.recent.style)} onClick={v.sortBtns.recent.onClick}>新しい順</button>
            <button type="button" style={buttonStyle(v.sortBtns.oldest.style)} onClick={v.sortBtns.oldest.onClick}>古い順</button>
          </div>
        </div>
      )}
      <FilterDropdown
        title="ラベル"
        options={v.labelOptions}
        selectedCount={st.labels.length}
        onClear={v.clearBtn.onClick}
        presentation={presentation}
      />
      <FilterDropdown
        title="担当者"
        options={v.assigneeOptions}
        selectedCount={st.assignees.length}
        onClear={v.clearAssigneeBtn.onClick}
        presentation={presentation}
      />
      <FilterDropdown
        title="マイルストーン"
        options={v.milestoneOptions}
        selectedCount={st.milestones.length}
        onClear={v.clearMilestoneBtn.onClick}
        presentation={presentation}
      />
      <div style={S(`margin-left:auto; font-size:${presentation ? "15px" : "11.5px"}; color:${rgb(T.muted)}; font-family:'JetBrains Mono',ui-monospace,monospace; font-variant-numeric:tabular-nums;`)}>
        {summary ?? `該当 ${v.filterSummary}`}
      </div>
    </div>
  );
}

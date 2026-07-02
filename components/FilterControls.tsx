"use client";

import { S, type Vals } from "@/lib/logic";
import type { DashState } from "@/lib/types";
import FilterDropdown from "@/components/FilterDropdown";

/** Shared filter bar: 状態 → (並べ替え, when showSort) → ラベル → 担当者 → マイルストーン → 該当件数.
 *  Used by the issue-list tab (showSort) and the calendar tab (no sort). */
export default function FilterControls({
  v,
  st,
  showSort,
}: {
  v: Vals;
  st: DashState;
  showSort: boolean;
}) {
  return (
    <div style={S("display:flex; flex-wrap:wrap; align-items:center; gap:14px 20px; padding:13px 16px; background:rgb(22 22 22); border:1px solid rgb(61 58 57); border-radius:12px;")}>
      <div style={S("display:flex; align-items:center; gap:9px;")}>
        <span style={S("font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:rgb(110 118 129); font-weight:600;")}>状態</span>
        <div style={S("display:flex; gap:6px;")}>
          <button style={v.statusBtns.all.style} onClick={v.statusBtns.all.onClick}>すべて</button>
          <button style={v.statusBtns.open.style} onClick={v.statusBtns.open.onClick}>Open</button>
          <button style={v.statusBtns.closed.style} onClick={v.statusBtns.closed.onClick}>Closed</button>
        </div>
      </div>
      {showSort && (
        <div style={S("display:flex; align-items:center; gap:9px;")}>
          <span style={S("font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:rgb(110 118 129); font-weight:600;")}>並べ替え</span>
          <div style={S("display:flex; gap:6px;")}>
            <button style={v.sortBtns.linger.style} onClick={v.sortBtns.linger.onClick}>長引き順</button>
            <button style={v.sortBtns.recent.style} onClick={v.sortBtns.recent.onClick}>新しい順</button>
            <button style={v.sortBtns.oldest.style} onClick={v.sortBtns.oldest.onClick}>古い順</button>
          </div>
        </div>
      )}
      <FilterDropdown
        title="ラベル"
        options={v.labelOptions}
        selectedCount={st.labels.length}
        onClear={v.clearBtn.onClick}
      />
      <FilterDropdown
        title="担当者"
        options={v.assigneeOptions}
        selectedCount={st.assignees.length}
        onClear={v.clearAssigneeBtn.onClick}
      />
      <FilterDropdown
        title="マイルストーン"
        options={v.milestoneOptions}
        selectedCount={st.milestones.length}
        onClear={v.clearMilestoneBtn.onClick}
      />
      <div style={S("margin-left:auto; font-size:11.5px; color:rgb(139 148 158); font-family:'JetBrains Mono',ui-monospace,monospace;")}>
        該当 {v.filterSummary}
      </div>
    </div>
  );
}

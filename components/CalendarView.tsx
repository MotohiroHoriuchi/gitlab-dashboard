"use client";

import { MONO, S, T, rgb, rgba, type CalVals } from "@/lib/logic";

/** Dumb renderer for the calendar/timeline view model (buildCalendar).
 *  All layout decisions live in lib/logic.ts; this only binds them to markup. */
export default function CalendarView({ cal }: { cal: CalVals }) {
  const labelStyle = S(
    "overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;",
  );
  const weekdayCell = S(
    "padding:2px 6px 5px; font-size:10px; font-weight:600; letter-spacing:.04em; color:rgb(110 118 129);",
  );

  return (
    <section
      style={S(
        "background:rgb(26 26 26); border:1px solid rgb(61 58 57); border-radius:14px; padding:18px 20px 20px; min-width:0;",
      )}
    >
      {/* ── header: title + mode toggle + nav ── */}
      <div
        style={S(
          "display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:12px;",
        )}
      >
        <h2 style={S("margin:0; font-size:16px; font-weight:700; color:rgb(242 242 242);")}>
          {cal.title}
        </h2>
        <div style={S("display:flex; align-items:center; gap:10px; flex-wrap:wrap;")}>
          <div style={S("display:flex; gap:6px;")}>
            <button style={cal.modeBtns.month.style} onClick={cal.modeBtns.month.onClick}>
              月
            </button>
            <button style={cal.modeBtns.twoweek.style} onClick={cal.modeBtns.twoweek.onClick}>
              2週
            </button>
          </div>
          <div style={S("display:flex; gap:6px;")}>
            <button style={cal.navPrev.style} onClick={cal.navPrev.onClick} aria-label="前へ">
              ‹
            </button>
            <button style={cal.navToday.style} onClick={cal.navToday.onClick}>
              今日
            </button>
            <button style={cal.navNext.style} onClick={cal.navNext.onClick} aria-label="次へ">
              ›
            </button>
          </div>
        </div>
      </div>

      {/* ── legend ── */}
      <div
        style={S(
          "display:flex; flex-wrap:wrap; align-items:center; gap:6px 16px; margin-bottom:10px; font-size:11px; color:rgb(139 148 158);",
        )}
      >
        <Swatch style={{ background: rgba("176 131 240", 0.2), border: "1px solid " + rgba("176 131 240", 0.6) }} text="マイルストーン" />
        <Swatch
          style={{
            background:
              "repeating-linear-gradient(45deg," +
              rgba(T.primary, 0.5) +
              " 0 4px," +
              rgba(T.primary, 0.16) +
              " 4px 8px)",
            border: "1px solid " + rgba(T.primary, 0.75),
          }}
          text="進行中イシュー"
        />
        <Swatch style={{ background: rgba(T.primary, 0.9), border: "1px solid " + rgb(T.primary) }} text="完了イシュー" />
        <span style={S("display:inline-flex; align-items:center; gap:5px;")}>
          <span style={{ color: rgb("255 199 74"), fontSize: "12px" }}>★</span>
          チェックポイント（{cal.legend.checkpointLabel}）
        </span>
      </div>

      {/* ── weekday header ── */}
      <div style={cal.weekdayRowStyle}>
        {cal.weekdayLabels.map((w, i) => (
          <div key={i} style={weekdayCell}>
            {w}
          </div>
        ))}
      </div>

      {/* ── weeks ── */}
      {cal.weeks.map((week) => (
        <div key={week.key}>
          <div style={week.headStyle}>
            {week.days.map((d) => (
              <div key={d.key} style={d.headStyle}>
                <span style={d.numStyle}>{d.dayNum}</span>
              </div>
            ))}
          </div>
          <div style={week.gridStyle}>
            {week.todayStripStyle && <div style={week.todayStripStyle} />}
            {week.segments.map((s) => (
              <div key={s.key} style={s.style} title={s.meta}>
                {s.showLabel && <span style={labelStyle}>{s.label}</span>}
                {s.starStyle && <span style={s.starStyle}>★</span>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {cal.empty && (
        <div style={S("padding:32px 0; text-align:center; font-size:13px; color:rgb(110 118 129);")}>
          この期間に表示できる予定がありません。マイルストーン／期限を設定するか、期間を移動してください。
        </div>
      )}
    </section>
  );
}

function Swatch({ style, text }: { style: React.CSSProperties; text: string }) {
  return (
    <span style={S("display:inline-flex; align-items:center; gap:5px;")}>
      <span style={{ width: "18px", height: "11px", borderRadius: "3px", ...style }} />
      {text}
    </span>
  );
}

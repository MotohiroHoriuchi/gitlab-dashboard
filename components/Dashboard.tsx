"use client";

import { useEffect, useState } from "react";
import { DEFAULT_GROUP_BY, S, renderVals, type Patch } from "@/lib/logic";
import type { ApiResponse, DashState } from "@/lib/types";

/** Full-height dark shell used for the loading / error states. */
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={S(
        "min-height:100vh; display:flex; align-items:center; justify-content:center; background:rgb(16 16 16); color:rgb(139 148 158); font-family:'Inter',system-ui,-apple-system,sans-serif; padding:24px; box-sizing:border-box; text-align:center;",
      )}
    >
      {children}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [st, setSt] = useState<DashState>({
    status: "all",
    sort: "linger",
    labels: [],
    assignees: [],
    groupBy: DEFAULT_GROUP_BY,
    hovered: null,
    panel: "ranking",
  });
  const patch: Patch = (p) =>
    setSt((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) }));

  useEffect(() => {
    let alive = true;
    fetch("/api/issues")
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        return j as ApiResponse;
      })
      .then((j) => alive && setData(j))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <Screen>
        <div>
          <div style={S("font-size:15px; color:rgb(248 81 73); font-weight:600; margin-bottom:8px;")}>
            データを取得できませんでした
          </div>
          <div style={S("font-size:13px; max-width:520px; line-height:1.6;")}>{error}</div>
          <div style={S("font-size:11.5px; color:rgb(110 118 129); margin-top:12px;")}>
            GITLAB_BASE_URL / GITLAB_PROJECT_ID / GITLAB_TOKEN を確認してください。
          </div>
        </div>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        <div style={S("font-size:13.5px; font-family:'JetBrains Mono',ui-monospace,monospace;")}>
          Loading issues…
        </div>
      </Screen>
    );
  }

  const v = renderVals(data.issues, st, patch, { repo: data.repo, asOf: data.asOf });

  return (
    <div
      style={S(
        "min-height:100vh; background:rgb(16 16 16); color:rgb(242 242 242); font-family:'Inter',system-ui,-apple-system,sans-serif; padding:28px 34px 52px; box-sizing:border-box;",
      )}
    >
      {/* ── Header ── */}
      <div style={S("display:flex; align-items:flex-end; justify-content:space-between; gap:24px; flex-wrap:wrap; margin-bottom:22px;")}>
        <div>
          <div style={S("display:flex; align-items:center; gap:9px;")}>
            <div style={S("width:8px; height:8px; border-radius:50%; background:rgb(0 217 146); box-shadow:0 0 10px rgb(0 217 146 / .85);")}></div>
            <span style={S("font-size:11.5px; letter-spacing:.15em; text-transform:uppercase; color:rgb(139 148 158); font-weight:600;")}>GitLab Issue Analytics</span>
          </div>
          <h1 style={S("margin:9px 0 5px; font-size:26px; font-weight:700; color:rgb(255 255 255); letter-spacing:-.01em;")}>イシュー滞留 &amp; 解決時間ダッシュボード</h1>
          <div style={S("font-size:12.5px; color:rgb(139 148 158); font-family:'JetBrains Mono',ui-monospace,monospace;")}>{v.repo} · {v.asOf} 時点</div>
        </div>
        <div style={S("text-align:right;")}>
          <div style={S("font-size:11px; color:rgb(110 118 129); text-transform:uppercase; letter-spacing:.09em; font-weight:600;")}>表示中</div>
          <div style={S("font-size:13.5px; color:rgb(189 189 189); font-family:'JetBrains Mono',ui-monospace,monospace; margin-top:3px;")}>{v.filterSummary}</div>
        </div>
      </div>

      {/* ── Summary metrics ── */}
      <div style={S("display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:14px; margin-bottom:20px;")}>
        <div style={S("background:rgb(26 26 26); border:1px solid rgb(61 58 57); border-radius:12px; padding:15px 17px;")}>
          <div style={S("font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:rgb(139 148 158); font-weight:600;")}>Open 件数</div>
          <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
            <span style={S("font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:rgb(210 153 34);")}>{v.openCount}</span>
            <span style={S("font-size:12.5px; color:rgb(139 148 158);")}>件</span>
          </div>
          <div style={S("margin-top:7px; font-size:11.5px; color:rgb(110 118 129); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;")}>{v.openSub}</div>
          <div style={S("height:3px; border-radius:2px; margin-top:11px; background:rgb(210 153 34 / .45);")}></div>
        </div>
        <div style={S("background:rgb(26 26 26); border:1px solid rgb(61 58 57); border-radius:12px; padding:15px 17px;")}>
          <div style={S("font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:rgb(139 148 158); font-weight:600;")}>Close 件数</div>
          <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
            <span style={S("font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:rgb(0 217 146);")}>{v.closedCount}</span>
            <span style={S("font-size:12.5px; color:rgb(139 148 158);")}>件</span>
          </div>
          <div style={S("margin-top:7px; font-size:11.5px; color:rgb(110 118 129); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;")}>{v.closeSub}</div>
          <div style={S("height:3px; border-radius:2px; margin-top:11px; background:rgb(0 217 146 / .45);")}></div>
        </div>
        <div style={S("background:rgb(26 26 26); border:1px solid rgb(61 58 57); border-radius:12px; padding:15px 17px;")}>
          <div style={S("font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:rgb(139 148 158); font-weight:600;")}>平均 Close 日数</div>
          <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
            <span style={S("font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:rgb(242 242 242);")}>{v.avgDays}</span>
            <span style={S("font-size:12.5px; color:rgb(139 148 158);")}>日</span>
          </div>
          <div style={S("margin-top:7px; font-size:11.5px; color:rgb(110 118 129);")}>closed issues</div>
          <div style={S("height:3px; border-radius:2px; margin-top:11px; background:rgb(242 242 242 / .2);")}></div>
        </div>
        <div style={S("background:rgb(26 26 26); border:1px solid rgb(61 58 57); border-radius:12px; padding:15px 17px;")}>
          <div style={S("font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:rgb(139 148 158); font-weight:600;")}>中央値 Close 日数</div>
          <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
            <span style={S("font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:rgb(242 242 242);")}>{v.medDays}</span>
            <span style={S("font-size:12.5px; color:rgb(139 148 158);")}>日</span>
          </div>
          <div style={S("margin-top:7px; font-size:11.5px; color:rgb(110 118 129);")}>closed issues</div>
          <div style={S("height:3px; border-radius:2px; margin-top:11px; background:rgb(242 242 242 / .2);")}></div>
        </div>
        <div style={S("background:rgb(26 26 26); border:1px solid rgb(61 58 57); border-radius:12px; padding:15px 17px;")}>
          <div style={S("font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:rgb(139 148 158); font-weight:600;")}>最長滞留 (Open)</div>
          <div style={S("display:flex; align-items:baseline; gap:5px; margin-top:9px;")}>
            <span style={S("font-family:'JetBrains Mono',ui-monospace,monospace; font-size:29px; font-weight:600; line-height:1; color:rgb(248 81 73);")}>{v.maxOpenDays}</span>
            <span style={S("font-size:12.5px; color:rgb(139 148 158);")}>日</span>
          </div>
          <div style={S("margin-top:7px; font-size:11.5px; color:rgb(110 118 129); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;")}>{v.maxOpenSub}</div>
          <div style={S("height:3px; border-radius:2px; margin-top:11px; background:rgb(248 81 73 / .45);")}></div>
        </div>
      </div>

      {/* ── Filter / sort bar ── */}
      <div style={S("display:flex; flex-wrap:wrap; align-items:center; gap:14px 24px; padding:13px 16px; background:rgb(22 22 22); border:1px solid rgb(61 58 57); border-radius:12px; margin-bottom:20px;")}>
        <div style={S("display:flex; align-items:center; gap:9px;")}>
          <span style={S("font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:rgb(110 118 129); font-weight:600;")}>状態</span>
          <div style={S("display:flex; gap:6px;")}>
            <button style={v.statusBtns.all.style} onClick={v.statusBtns.all.onClick}>すべて</button>
            <button style={v.statusBtns.open.style} onClick={v.statusBtns.open.onClick}>Open</button>
            <button style={v.statusBtns.closed.style} onClick={v.statusBtns.closed.onClick}>Closed</button>
          </div>
        </div>
        <div style={S("display:flex; align-items:center; gap:9px;")}>
          <span style={S("font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:rgb(110 118 129); font-weight:600;")}>並べ替え</span>
          <div style={S("display:flex; gap:6px;")}>
            <button style={v.sortBtns.linger.style} onClick={v.sortBtns.linger.onClick}>長引き順</button>
            <button style={v.sortBtns.recent.style} onClick={v.sortBtns.recent.onClick}>新しい順</button>
            <button style={v.sortBtns.oldest.style} onClick={v.sortBtns.oldest.onClick}>古い順</button>
          </div>
        </div>
        <div style={S("display:flex; align-items:center; gap:9px; flex:1; min-width:260px;")}>
          <span style={S("font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:rgb(110 118 129); font-weight:600; flex:0 0 auto;")}>ラベル</span>
          <div style={S("display:flex; flex-wrap:wrap; gap:6px;")}>
            {v.labelChips.map((c, i) => (
              <button key={i} style={c.style} onClick={c.onClick}>
                <span style={c.dotStyle}></span>
                {c.name}
              </button>
            ))}
            <button
              style={S("padding:5px 10px; border-radius:8px; cursor:pointer; font-size:11.5px; font-weight:600; font-family:'Inter',system-ui,sans-serif; border:1px solid rgb(61 58 57); background:transparent; color:rgb(110 118 129);")}
              onClick={v.clearBtn.onClick}
            >
              クリア
            </button>
          </div>
        </div>
        <div style={S("display:flex; align-items:center; gap:9px; flex:1; min-width:260px;")}>
          <span style={S("font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:rgb(110 118 129); font-weight:600; flex:0 0 auto;")}>担当者</span>
          <div style={S("display:flex; flex-wrap:wrap; gap:6px;")}>
            {v.assigneeChips.map((c, i) => (
              <button key={i} style={c.style} onClick={c.onClick}>{c.name}</button>
            ))}
            <button
              style={S("padding:5px 10px; border-radius:8px; cursor:pointer; font-size:11.5px; font-weight:600; font-family:'Inter',system-ui,sans-serif; border:1px solid rgb(61 58 57); background:transparent; color:rgb(110 118 129);")}
              onClick={v.clearAssigneeBtn.onClick}
            >
              クリア
            </button>
          </div>
        </div>
      </div>

      {/* ── Content tabs ── */}
      <div style={S("display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap;")}>
        <span style={S("font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:rgb(110 118 129); font-weight:600;")}>表示</span>
        <button style={v.panelTabs.ranking.style} onClick={v.panelTabs.ranking.onClick}>滞留ランキング</button>
        <button style={v.panelTabs.dist.style} onClick={v.panelTabs.dist.onClick}>Close日数の分布</button>
      </div>

      {/* ── Main grid ── */}
      <div style={v.gridStyle}>
        {/* Ranking panel */}
        {v.showRank && (
          <section style={S("background:rgb(26 26 26); border:1px solid rgb(61 58 57); border-radius:14px; padding:18px 20px 20px; min-width:0;")}>
            <div style={S("display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:3px;")}>
              <h2 style={S("margin:0; font-size:16px; font-weight:700; color:rgb(242 242 242);")}>滞留期間ランキング</h2>
              <span style={S("font-size:11.5px; color:rgb(110 118 129); font-family:'JetBrains Mono',ui-monospace,monospace;")}>上位 {v.topN} 件 · 単位 日</span>
            </div>
            <p style={S("margin:0 0 12px; font-size:12px; color:rgb(139 148 158); line-height:1.5;")}>
              バーが長いほど Open→Close に時間がかかっている。
              <span style={{ color: "rgb(0 217 146)" }}>■</span>
              {"<30日 "}
              <span style={{ color: "rgb(210 153 34)" }}>■</span>
              30日超{" "}
              <span style={{ color: "rgb(248 81 73)" }}>■</span>
              90日超 · 斜線は Open（未解決）。
            </p>

            <div style={S("display:grid; grid-template-columns:224px minmax(0,1fr); align-items:center; gap:14px; padding:8px 0; border-bottom:1px solid rgb(61 58 57 / .5);")}>
              <div></div>
              <div style={S("position:relative; height:15px;")}>
                {v.rankTicks.map((t, i) => (
                  <span key={i} style={t.style}>{t.label}</span>
                ))}
              </div>
            </div>

            {v.rows.map((row, i) => (
              <div key={i} style={S("display:grid; grid-template-columns:224px minmax(0,1fr); align-items:center; gap:14px; padding:8px 0; border-bottom:1px solid rgb(61 58 57 / .5);")}>
                <div style={S("min-width:0;")}>
                  <div style={S("display:flex; align-items:center; gap:7px;")}>
                    <span style={S("font-family:'JetBrains Mono',ui-monospace,monospace; font-size:11px; color:rgb(110 118 129); width:20px; flex:0 0 auto;")}>{row.rankLabel}</span>
                    <span style={row.chipStyle}>{row.labelName}</span>
                  </div>
                  <div style={S("font-size:12.5px; color:rgb(210 210 210); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;")}>{row.title}</div>
                  <div style={S("font-size:10.5px; color:rgb(110 118 129); margin-top:2px; font-family:'JetBrains Mono',ui-monospace,monospace;")}>{row.meta}</div>
                </div>
                <div style={v.rankTrackStyle}>
                  <div style={row.barFillStyle}></div>
                  {row.isOpen && <span style={row.capStyle}></span>}
                  <span style={row.dayStyle}>{row.dayText}</span>
                </div>
              </div>
            ))}

            {v.noRows && (
              <div style={S("padding:26px 0; text-align:center; font-size:13px; color:rgb(110 118 129);")}>
                条件に一致するイシューがありません。
              </div>
            )}
          </section>
        )}

        {/* Box-plot panel */}
        {v.showDist && (
          <section style={S("background:rgb(26 26 26); border:1px solid rgb(61 58 57); border-radius:14px; padding:18px 20px 20px; min-width:0;")}>
            <div style={S("display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:3px;")}>
              <h2 style={S("margin:0; font-size:16px; font-weight:700; color:rgb(242 242 242);")}>Close 日数の分布（箱ひげ）</h2>
              <div style={S("display:flex; gap:6px;")}>
                <button style={v.groupBtns.label.style} onClick={v.groupBtns.label.onClick}>ラベル</button>
                <button style={v.groupBtns.assignee.style} onClick={v.groupBtns.assignee.onClick}>担当者</button>
                <button style={v.groupBtns.milestone.style} onClick={v.groupBtns.milestone.onClick}>マイルストーン</button>
              </div>
            </div>
            <p style={S("margin:0 0 12px; font-size:12px; color:rgb(139 148 158); line-height:1.5;")}>箱＝Q1〜Q3、縦線＝中央値、ひげ＝1.5×IQR、点＝外れ値。中央値が大きい順。行にホバーで詳細。</p>

            <div style={S("display:grid; grid-template-columns:150px minmax(0,1fr); align-items:center; gap:12px; padding:7px 0; border-bottom:1px solid rgb(61 58 57 / .5);")}>
              <div></div>
              <div style={S("position:relative; height:15px;")}>
                {v.boxTicks.map((t, i) => (
                  <span key={i} style={t.style}>{t.label}</span>
                ))}
              </div>
            </div>

            {v.groups.map((g, i) => (
              <div key={i} style={g.rowStyle} onMouseEnter={g.onEnter}>
                <div style={S("min-width:0; display:flex; align-items:center; gap:8px;")}>
                  <span style={g.dotStyle}></span>
                  <div style={S("min-width:0;")}>
                    <div style={S("font-size:12.5px; color:rgb(230 230 230); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;")}>{g.name}</div>
                    <div style={S("font-size:10px; color:rgb(110 118 129); font-family:'JetBrains Mono',ui-monospace,monospace;")}>{g.sub}</div>
                  </div>
                </div>
                <div style={v.boxTrackStyle}>
                  <div style={g.whiskerStyle}></div>
                  <div style={g.capLoStyle}></div>
                  <div style={g.capHiStyle}></div>
                  <div style={g.rectStyle}></div>
                  <div style={g.medianStyle}></div>
                  {g.outliers.map((o, j) => (
                    <div key={j} style={o.style}></div>
                  ))}
                </div>
              </div>
            ))}

            {/* Hover detail */}
            <div style={S("margin-top:14px; padding:12px 14px; background:rgb(22 22 22); border:1px solid rgb(61 58 57); border-radius:10px;")}>
              <div style={S("display:flex; align-items:center; gap:8px; margin-bottom:11px;")}>
                <span style={v.hoveredDetail.dotStyle}></span>
                <span style={S("font-size:13px; font-weight:700; color:rgb(242 242 242);")}>{v.hoveredDetail.name}</span>
                <span style={S("font-size:10.5px; color:rgb(110 118 129);")}>— 行にホバーで切替</span>
              </div>
              <div style={S("display:grid; grid-template-columns:repeat(auto-fit,minmax(66px,1fr)); gap:9px;")}>
                {v.hoveredDetail.cells.map((cell, i) => (
                  <div key={i}>
                    <div style={S("font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; color:rgb(110 118 129); font-weight:600;")}>{cell.k}</div>
                    <div style={cell.vStyle}>{cell.v}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

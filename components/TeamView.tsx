"use client";

import { type CSSProperties, useEffect } from "react";
import {
  CHECKPOINT_STAR,
  MONO,
  SANS,
  T,
  rgb,
  rgba,
  seg,
  type TeamFocusItem,
  type TeamOverview,
} from "@/lib/logic";

const numeric: CSSProperties = {
  fontFamily: MONO,
  fontVariantNumeric: "tabular-nums",
};

function riskTone(item: TeamFocusItem): string {
  return item.risk === "overdue" ? T.err : item.risk === "soon" ? T.warn : T.muted;
}

/** Owner-first view for stand-ups and planning conversations. This is kept
 * separate from calendar/roadmap so each view answers one question well. */
export default function TeamView({
  overview,
  project,
  fetchedAt,
  fullscreen,
  onToggleFull,
  onExitFull,
  onClearFilters,
}: {
  overview: TeamOverview;
  project: string;
  fetchedAt: string;
  fullscreen?: boolean;
  onToggleFull?: () => void;
  onExitFull?: () => void;
  onClearFilters: () => void;
}) {
  useEffect(() => {
    if (!fullscreen || !onExitFull) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExitFull();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen, onExitFull]);

  const updated = new Date(fetchedAt).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const stats = [
    { label: "進行中", value: overview.open, tone: T.ink, note: "Openイシュー" },
    { label: "期限超過", value: overview.overdue, tone: overview.overdue ? T.err : T.ok, note: "対応が必要" },
    { label: "7日以内", value: overview.dueSoon, tone: overview.dueSoon ? T.warn : T.muted, note: "近日の期限" },
    { label: "稼働メンバー", value: overview.members.length, tone: T.primary, note: "担当者数" },
  ];
  const controlStyle: CSSProperties = {
    ...seg(!!fullscreen),
    ...(fullscreen ? { padding: "10px 16px", fontSize: "16px" } : {}),
  };

  return (
    <section
      aria-labelledby="team-view-title"
      style={{
        minWidth: 0,
        padding: fullscreen ? "24px 28px 28px" : "18px 20px 20px",
        border: "1px solid " + rgb(T.hairline),
        borderRadius: "16px",
        background: rgb(T.card),
        color: rgb(T.ink),
        fontFamily: SANS,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: fullscreen ? "15px" : "12.5px", fontWeight: 700, color: rgb(T.primary) }}>
            現在の担当状況
          </p>
          <h2
            id="team-view-title"
            style={{
              margin: "5px 0 0",
              fontSize: fullscreen ? "30px" : "22px",
              lineHeight: 1.25,
              textWrap: "balance",
            }}
          >
            誰が、いま何を進めているか
          </h2>
          <p
            style={{
              margin: "7px 0 0",
              fontSize: fullscreen ? "16px" : "13.5px",
              lineHeight: 1.55,
              color: rgb(T.muted),
              textWrap: "pretty",
            }}
          >
            {project} · リスクの高い担当者から表示 · 最終更新 {updated}
          </p>
        </div>
        {onToggleFull && (
          <button
            type="button"
            style={controlStyle}
            onClick={onToggleFull}
            aria-pressed={!!fullscreen}
            title={fullscreen ? "会議表示を終了（Esc）" : "担当者ビューを会議用に全画面表示"}
          >
            {fullscreen ? "✕ 会議表示を終了" : "⛶ 会議表示"}
          </button>
        )}
      </header>

      <dl
        aria-label="担当状況のサマリー"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,minmax(0,1fr))",
          gap: fullscreen ? "16px" : "12px",
          margin: fullscreen ? "24px 0" : "20px 0",
        }}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              minWidth: 0,
              padding: fullscreen ? "17px 20px" : "14px 16px",
              border: "1px solid " + rgb(T.hairline),
              borderRadius: "12px",
              background: rgb(T.canvas),
            }}
          >
            <dt style={{ fontSize: fullscreen ? "16px" : "12.5px", fontWeight: 700, color: rgb(T.muted) }}>
              {stat.label}
            </dt>
            <dd
              style={{
                ...numeric,
                margin: "7px 0 0",
                fontSize: fullscreen ? "44px" : "34px",
                fontWeight: 700,
                lineHeight: 1,
                color: rgb(stat.tone),
              }}
            >
              {stat.value}
            </dd>
            <div style={{ marginTop: "7px", fontSize: fullscreen ? "14px" : "11.5px", color: rgb(T.muted) }}>
              {stat.note}
            </div>
          </div>
        ))}
      </dl>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "16px",
          marginBottom: "10px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: fullscreen ? "22px" : "16px", textWrap: "balance" }}>担当者別</h3>
        <p style={{ margin: 0, fontSize: fullscreen ? "15px" : "12px", color: rgb(T.muted), textWrap: "pretty" }}>
          期限超過 → 7日以内 → 進行中件数の順
        </p>
      </div>

      {overview.members.length ? (
        <ul
          aria-label="担当者別の進行中イシュー"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fit,minmax(${fullscreen ? "360px" : "280px"},1fr))`,
            gap: fullscreen ? "16px" : "12px",
            margin: 0,
            padding: 0,
            listStyle: "none",
          }}
        >
          {overview.members.map((member) => (
            <li
              key={member.name}
              style={{
                minWidth: 0,
                padding: fullscreen ? "20px" : "16px",
                border: "1px solid " + rgb(T.hairline),
                borderRadius: "12px",
                background: rgb(T.canvas),
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
                <h4
                  style={{
                    minWidth: 0,
                    margin: 0,
                    overflow: "hidden",
                    fontSize: fullscreen ? "22px" : "17px",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {member.name}
                </h4>
                <span
                  style={{
                    ...numeric,
                    flex: "0 0 auto",
                    padding: "3px 8px",
                    borderRadius: "999px",
                    fontSize: fullscreen ? "14px" : "11.5px",
                    fontWeight: 700,
                    color: rgb(T.primary),
                    background: rgba(T.primary, 0.1),
                  }}
                >
                  進行中 {member.open}
                </span>
              </div>

              <div
                aria-label={`${member.name}の期限状況`}
                style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}
              >
                {member.overdue > 0 && <RiskChip label={`超過 ${member.overdue}`} tone={T.err} fullscreen={fullscreen} />}
                {member.dueSoon > 0 && <RiskChip label={`7日以内 ${member.dueSoon}`} tone={T.warn} fullscreen={fullscreen} />}
                {member.overdue === 0 && member.dueSoon === 0 && (
                  <RiskChip label="直近リスクなし" tone={T.ok} fullscreen={fullscreen} />
                )}
              </div>

              <ul style={{ display: "flex", flexDirection: "column", margin: "12px 0 0", padding: 0, listStyle: "none" }}>
                {member.focus.map((item) => {
                  const tone = riskTone(item);
                  return (
                    <li
                      key={item.id}
                      style={{
                        minWidth: 0,
                        padding: fullscreen ? "11px 0" : "9px 0",
                        borderTop: "1px solid " + rgb(T.hairline),
                      }}
                    >
                      <div style={{ display: "flex", minWidth: 0, alignItems: "center", gap: "6px" }}>
                        <span
                          style={{
                            ...numeric,
                            flex: "0 0 auto",
                            fontSize: fullscreen ? "15px" : "12.5px",
                            fontWeight: 700,
                            color: rgb(T.primary),
                          }}
                        >
                          #{item.id}
                        </span>
                        {item.isCheckpoint && (
                          <span aria-label="チェックポイント" style={{ color: rgb(CHECKPOINT_STAR) }}>
                            ★
                          </span>
                        )}
                        <span
                          style={{
                            minWidth: 0,
                            overflow: "hidden",
                            fontSize: fullscreen ? "17px" : "13.5px",
                            fontWeight: 650,
                            color: rgb(T.body),
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.title}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "10px",
                          marginTop: "5px",
                          fontSize: fullscreen ? "13.5px" : "11px",
                        }}
                      >
                        <span
                          style={{ minWidth: 0, overflow: "hidden", color: rgb(T.muted), textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {item.milestone}
                        </span>
                        <span
                          style={{
                            ...numeric,
                            flex: "0 0 auto",
                            padding: "2px 7px",
                            borderRadius: "999px",
                            fontWeight: 700,
                            color: rgb(tone),
                            background: rgba(tone, 0.1),
                          }}
                        >
                          {item.dueLabel}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {member.open > member.focus.length && (
                <p style={{ margin: "7px 0 0", fontSize: fullscreen ? "14px" : "11.5px", color: rgb(T.muted) }}>
                  ほか {member.open - member.focus.length} 件
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div
          style={{
            padding: fullscreen ? "36px" : "28px",
            border: "1px solid " + rgb(T.hairline),
            borderRadius: "12px",
            background: rgb(T.canvas),
            textAlign: "center",
          }}
        >
          <h3 style={{ margin: 0, fontSize: fullscreen ? "21px" : "16px", textWrap: "balance" }}>
            現在の条件に進行中イシューはありません
          </h3>
          <p style={{ margin: "7px 0 14px", fontSize: fullscreen ? "15px" : "12.5px", color: rgb(T.muted), textWrap: "pretty" }}>
            フィルターを解除すると、全担当者の進行中イシューを確認できます。
          </p>
          <button type="button" style={seg(false)} onClick={onClearFilters}>
            フィルターをすべて解除
          </button>
        </div>
      )}
    </section>
  );
}

function RiskChip({ label, tone, fullscreen }: { label: string; tone: string; fullscreen?: boolean }) {
  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: "999px",
        fontSize: fullscreen ? "14px" : "11.5px",
        fontWeight: 700,
        color: rgb(tone),
        background: rgba(tone, 0.1),
      }}
    >
      {label}
    </span>
  );
}

# GitLab イシュー分析ダッシュボード

実 GitLab プロジェクトの Issues を可視化する **Next.js（App Router）** アプリ。
イシューの **滞留期間ランキング（ガント風）** と、ラベル / 担当者 / マイルストーン別の
**Close 日数の分布（箱ひげ図）** を、フィルタ・並べ替え・ホバー詳細つきで表示する。

claude.ai/design のデザインコンポーネントを実装したもの（`design/` に元ソースを保存）。

## アーキテクチャ

```
Browser ─▶ Next.js(:48273)
   app/page.tsx ─renders─▶ components/Dashboard.tsx ('use client')
   app/api/issues/route.ts (サーバ専用) ─▶ GitLab REST API v4 (PRIVATE-TOKEN)
   Dashboard ─fetch('/api/issues')─▶ フィルタ/並べ替え/箱ひげ統計はクライアントで即時集計
```

- **GitLab トークンはサーバ側（Route Handler）でのみ使用**し、ブラウザへ露出しない。
- バックエンドは生 Issue を1回配信、集計はクライアント（クリックごとの往復なし）。
- GitLab 応答は 60 秒キャッシュ（Next の `revalidate`）。

## 必要な環境変数

| 変数 | 必須 | 例 / 既定 | 説明 |
|---|---|---|---|
| `GITLAB_BASE_URL` | ✔ | `https://gitlab.com` | GitLab の URL（セルフホスト可） |
| `GITLAB_PROJECT_ID` | ✔ | `group/project` or `278964` | プロジェクト（パス or 数値 ID） |
| `GITLAB_TOKEN` | ✔ | `glpat-…` | Personal Access Token（`read_api` スコープ） |
| `GITLAB_MAX_ISSUES` | | `2000` | 取得上限（ページング保護） |
| `PORT` | | `48273` | 待受ポート（非慣例ポート） |

`.env.example` をコピーして使う:

```sh
cp .env.example .env.local   # 開発用（npm run dev が読む）
# GITLAB_* を実際の値に編集
```

## 開発

```sh
npm install
npm run dev        # http://localhost:48273
```

その他のスクリプト:

```sh
npm test           # GitLab 変換ロジックの単体テスト (vitest)
npm run typecheck  # 型チェック
npm run build      # 本番ビルド（.next/standalone を生成）
```

## Docker

```sh
docker build -t gitlab-issue-dashboard .
docker run --rm -p 48273:48273 \
  -e GITLAB_BASE_URL=https://gitlab.com \
  -e GITLAB_PROJECT_ID=your-group/your-project \
  -e GITLAB_TOKEN=glpat-xxxxxxxx \
  gitlab-issue-dashboard
# → http://localhost:48273
```

または docker-compose（`.env` に GITLAB_* を置く）:

```sh
cp .env.example .env   # 値を編集
docker compose up --build
```

- 多段ビルドで最終イメージは Next standalone サーバ + 静的資産のみ（非 root `node` 実行）。
- フォント（Inter / JetBrains Mono）はビルド時に自己ホスト化（実行時 CDN 依存なし）。
- トークンはイメージに焼き込まず、実行時に env / secret で注入。
- `/api/healthz` がヘルスチェック用（GitLab を呼ばない）。

## 機能

- **サマリー指標** — Open / Close 件数、平均・中央値 Close 日数、最長滞留（Open）
- **フィルタ** — 状態（すべて / Open / Closed）、ラベル複数選択、クリア
- **並べ替え** — 長引き順 / 新しい順 / 古い順
- **滞留ランキング** — Open→Close の滞留日数をガント風バーで可視化（緑 <30日 / 黄 30日超 / 赤 90日超、斜線＝未解決）
- **Close 日数の分布** — ラベル / 担当者 / マイルストーン別の箱ひげ図（箱＝Q1〜Q3、縦線＝中央値、ひげ＝1.5×IQR、点＝外れ値）。行ホバーで統計詳細

## ファイル構成

```
app/
  layout.tsx           # フォント（next/font）・メタ
  page.tsx             # <Dashboard/>
  api/issues/route.ts  # GitLab 取得 → JSON（サーバ専用）
  api/healthz/route.ts # ヘルスチェック
  globals.css  icon.svg
components/Dashboard.tsx  # 'use client' — 描画 + 状態
lib/
  gitlab.ts   # GitLab 取得（ページング）+ Issue 変換（純粋関数はテスト対象）
  gitlab.test.ts
  logic.ts    # 集計・箱ひげ計算・スタイル生成（renderVals）
  types.ts
Dockerfile  docker-compose.yml  .dockerignore
design/     # インポート元のデザインソース（参照用）
```

## 補足（設計上の割り切り）

- GitLab の Issue は複数ラベルを持てるが、本ダッシュボードは元デザインに合わせ
  **先頭ラベルを代表ラベル**として 1 件に集約して扱う（ラベル別集計・チップの意味論を保つため）。
  ラベル無しは「未分類」。担当者無しは「未割当」、マイルストーン無しは「Backlog」。
- 滞留日数 `linger` は、Open は「作成からの経過日数」、Closed は「作成→クローズの所要日数」。

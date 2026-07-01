#!/usr/bin/env bash
# Build & run the GitLab dashboard as a Docker container.
# Real GitLab only — env is injected from .env (see .env.example). No compose, no mock.
set -euo pipefail

IMAGE="gitlab-issue-dashboard"
NAME="gitlab-issue-dashboard"
PORT="${PORT:-48273}" # host port; the container always listens on 48273

# Resolve repo root (parent of scripts/) so the script works from any cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '\033[36m▶ %s\033[0m\n' "$*"; }
die() {
  printf '\033[31m✖ %s\033[0m\n' "$*" >&2
  exit 1
}

require_docker() {
  command -v docker >/dev/null 2>&1 || die "docker が見つかりません（Docker Desktop を起動してください）"
  docker info >/dev/null 2>&1 || die "docker デーモンに接続できません（Docker Desktop を起動してください）"
}

require_env() {
  [ -f .env ] || die ".env がありません。 cp .env.example .env で作成し、GITLAB_* を設定してください"
  local miss=()
  for v in GITLAB_BASE_URL GITLAB_PROJECT_ID GITLAB_TOKEN; do
    grep -Eq "^[[:space:]]*${v}=.+" .env || miss+=("$v")
  done
  [ ${#miss[@]} -eq 0 ] || die ".env の必須変数が未設定: ${miss[*]}"
}

build() {
  require_docker
  log "ビルド: $IMAGE"
  docker build -t "$IMAGE" .
}

stop() {
  require_docker
  # docker rm -f <不在> は環境により exit 0 を返すため、存在確認してからメッセージを出す。
  if docker ps -aq -f "name=^${NAME}$" | grep -q .; then
    docker rm -f "$NAME" >/dev/null
    log "既存コンテナ削除: $NAME"
  else
    log "対象コンテナなし: $NAME"
  fi
}

wait_healthy() {
  local url="http://localhost:${PORT}/api/healthz"
  log "ヘルスチェック待機: $url"
  for _ in $(seq 1 30); do
    if curl -fs "$url" >/dev/null 2>&1; then
      log "起動完了 → http://localhost:${PORT}"
      return 0
    fi
    # コンテナが落ちていたら待たずにログを出して終了
    if ! docker ps -q -f "name=^${NAME}$" | grep -q .; then
      docker logs --tail 40 "$NAME" 2>/dev/null || true
      die "コンテナが停止しました"
    fi
    sleep 1
  done
  docker logs --tail 40 "$NAME" 2>/dev/null || true
  die "起動タイムアウト（$url が応答しません）"
}

run() {
  require_docker
  require_env
  docker image inspect "$IMAGE" >/dev/null 2>&1 ||
    die "イメージ $IMAGE が未ビルドです。 $0 build か $0 up を先に実行してください"
  stop
  log "起動 (detached, restart=unless-stopped, port ${PORT})"
  docker run -d \
    --name "$NAME" \
    --restart unless-stopped \
    -p "${PORT}:48273" \
    --env-file .env \
    "$IMAGE" >/dev/null
  wait_healthy
}

up() {
  build
  run
}

logs() {
  require_docker
  docker logs -f "$NAME"
}

usage() {
  cat <<EOF
使い方: $0 [build|run|up|stop|logs]
  build  イメージをビルド
  up     ビルド→起動（既定）
  run    ビルド済みイメージを起動（-d --restart unless-stopped）
  stop   コンテナを停止・削除
  logs   コンテナのログを追尾
EOF
}

case "${1:-up}" in
build) build ;;
run) run ;;
up) up ;;
stop) stop ;;
logs) logs ;;
-h | --help | help) usage ;;
*)
  usage
  exit 1
  ;;
esac

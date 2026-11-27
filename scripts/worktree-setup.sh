#!/usr/bin/env bash
# この worktree 専用の開発環境を用意する(docs/adr/0001-worktree-isolation.md)。
# - .env を .env.example から作り、COMPOSE_PROJECT_NAME と、すべての *_PORT に専用の値を入れる
# - Docker イメージを作り、依存を入れ、DB を用意し、アプリを起動する
# 何度実行してもよい。
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

# --- 名前と番号を決める -------------------------------------------------
branch="$(git branch --show-current || true)"
[ -n "$branch" ] || branch="$(basename "$root")"
slug="$(printf '%s' "$branch" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-' | sed -E 's/-+/-/g; s/^-//; s/-$//')"
project="loop-${slug}"
project="${project:0:60}"
# 人間がレビューする版のプロジェクト名とは決して重ならないようにする
if [ "$project" = "novel-submission-site-clone" ] || [ "$project" = "loop-novel-site-clone" ]; then
  echo "worktree-setup: refusing to use Compose project name '$project'" >&2
  exit 1
fi

# ポートの区画。issue 番号のブランチ(<番号>-<slug>)は番号で、それ以外は名前のハッシュで決める。
# 区画ごとに 20 個のポートを割り当て、20000 から使う(novel-site-clone は 20000 未満の既定値を使う)。
# Linux の一時ポート(32768 以上)は外向きの接続が使うので、待ち受けていなくても bind が失敗することがある。
# そのため最大でも 32599 に収める
if [[ "$branch" =~ ^([0-9]+)- ]]; then
  slot=$(( 10#${BASH_REMATCH[1]} % 500 ))
else
  slot=$(( 500 + $(printf '%s' "$branch" | cksum | cut -d' ' -f1) % 130 ))
fi
base=$(( 20000 + slot * 20 ))

port_in_use() {
  # 自分のプロジェクトのコンテナが使っているポートは除く(再実行のため)
  local port=$1
  if docker ps --format '{{.Names}} {{.Ports}}' | grep -v "^${project}-" | grep -Eq "[:.]${port}->"; then
    return 0
  fi
  if command -v ss >/dev/null 2>&1 && ss -tanH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"; then
    docker ps --format '{{.Names}} {{.Ports}}' | grep "^${project}-" | grep -Eq "[:.]${port}->" && return 1
    return 0
  fi
  return 1
}

# --- .env を書く ---------------------------------------------------------
tmp="$(mktemp)"
i=0
while IFS= read -r line || [ -n "$line" ]; do
  if [[ "$line" =~ ^([A-Z0-9_]+_PORT)= ]]; then
    var="${BASH_REMATCH[1]}"
    port=$(( base + i ))
    i=$(( i + 1 ))
    if port_in_use "$port"; then
      echo "worktree-setup: port $port for $var is already in use by another process" >&2
      rm -f "$tmp"
      exit 1
    fi
    echo "${var}=${port}" >>"$tmp"
  elif [[ "$line" =~ ^UID= ]]; then
    echo "UID=$(id -u)" >>"$tmp"
  elif [[ "$line" =~ ^GID= ]]; then
    echo "GID=$(id -g)" >>"$tmp"
  else
    printf '%s\n' "$line" >>"$tmp"
  fi
done <.env.example
{
  echo
  echo "# scripts/worktree-setup.sh が書いた。この worktree の Compose プロジェクト"
  echo "COMPOSE_PROJECT_NAME=${project}"
} >>"$tmp"
mv "$tmp" .env
echo "worktree-setup: wrote .env (COMPOSE_PROJECT_NAME=${project}, ports ${base}-$(( base + i - 1 )))"

# カクヨムのテスト用アカウント(docs/kakuyomu-reference.md)。メインのチェックアウトにあれば共有する
main_root="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
if [ "$main_root" != "$root" ] && [ -f "$main_root/.env.kakuyomu" ] && [ ! -e .env.kakuyomu ]; then
  ln -s "$main_root/.env.kakuyomu" .env.kakuyomu
fi

# Laravel の .env(APP_KEY を持つ)。接続先などは compose.yaml の環境変数が優先される
[ -f backend/.env ] || cp backend/.env.example backend/.env

# --- コンテナと依存 ------------------------------------------------------
envval() { sed -n "s/^$1=//p" .env | tail -n 1; }
NEXT_PORT="$(envval NEXT_PORT)"
APP_PORT="$(envval APP_PORT)"
dc() { docker compose --project-name "$project" "$@"; }

dc build app web
dc up -d --wait db redis
# COMPOSER_AUTH があれば(CI)コンテナに渡す。無ければ何も渡らない。
# COMPOSER_CACHE_DIR があれば(CI)そのディレクトリをコンテナの composer のキャッシュにする(docs/adr/0011)。
# コンテナのユーザーが書けないディレクトリなら、composer はキャッシュを使わずに続ける
composer_cache=()
if [ -n "${COMPOSER_CACHE_DIR:-}" ]; then
  mkdir -p "$COMPOSER_CACHE_DIR"
  composer_cache=(-v "$COMPOSER_CACHE_DIR:/tmp/composer-cache" -e COMPOSER_CACHE_DIR=/tmp/composer-cache)
fi
dc run --rm --no-deps -e COMPOSER_AUTH "${composer_cache[@]}" app composer install --no-interaction --prefer-dist
if ! grep -Eq '^APP_KEY=.+' backend/.env; then
  dc run --rm --no-deps app php artisan key:generate --no-interaction
fi
dc run --rm --no-deps e2e npm ci --no-audit --no-fund
dc up -d --wait app nginx web
# シードは何度入れても同じ状態になる(docs/adr/0030)。E2E と見た目の比較もこの DB で動く
dc exec -T app php artisan migrate --seed --force --no-interaction

# next dev は最初のリクエストでコンパイルするので、応答するまで待つ
echo "worktree-setup: waiting for the frontend on port ${NEXT_PORT}"
for _ in $(seq 1 120); do
  if curl -fs -o /dev/null "http://127.0.0.1:${NEXT_PORT}/"; then
    echo "worktree-setup: ready (frontend http://localhost:${NEXT_PORT}, API http://localhost:${APP_PORT})"
    exit 0
  fi
  sleep 2
done
echo "worktree-setup: the frontend did not respond on port ${NEXT_PORT}" >&2
dc logs --tail 50 web >&2
exit 1

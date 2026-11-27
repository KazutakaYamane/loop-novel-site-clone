#!/usr/bin/env bash
# 手元で E2E と見た目の比較を動かす。引数は playwright test にそのまま渡す。
#   scripts/e2e.sh --project=dev
#   scripts/e2e.sh --project=visual-pc --project=visual-sp
# デモログインの IP ごとの回数(1 時間 10 回)は Laravel のキャッシュに残り、同じ worktree で何度も走らせると
# テストの送信元の回数が上限に届く。テストの前にアプリの外から Laravel のキャッシュを消して、毎回 CI と同じ
# 空の状態から始める(docs/adr/0017)。CI は実行ごとに新しい環境で動くので、このスクリプトを使わない
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

docker compose exec -T app php artisan cache:clear
docker compose run --rm --no-deps -T e2e npx playwright test "$@"

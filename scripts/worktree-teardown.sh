#!/usr/bin/env bash
# この worktree の Compose プロジェクトのコンテナとボリュームだけを止めて消す。
# プロジェクト名は scripts/worktree-setup.sh が .env に書いたものを使う。
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

if [ ! -f .env ]; then
  echo "worktree-teardown: no .env; nothing to do"
  exit 0
fi
project="$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' .env | tail -n 1)"
# setup が付けた名前(loop-<branch>)以外は消さない。人間の版のプロジェクトを巻き込まないため
if [[ ! "$project" =~ ^loop-[a-z0-9_-]+$ ]] || [ "$project" = "loop-novel-site-clone" ]; then
  echo "worktree-teardown: refusing to remove Compose project '$project'" >&2
  exit 1
fi

docker compose --project-name "$project" --profile e2e down --volumes --remove-orphans
echo "worktree-teardown: removed containers and volumes of $project"

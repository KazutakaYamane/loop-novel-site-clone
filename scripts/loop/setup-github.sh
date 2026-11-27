#!/usr/bin/env bash
# 初期設定で人間が1回だけ実行する。GitHub のラベル、ブランチ保護、bootstrap の issue を作る。
# 前提: git の origin が GitHub のリポジトリを指し、main に初期のファイルが push 済みで、gh にログイン済み。
set -euo pipefail
LOOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=config
source "$LOOP_DIR/config"

if [ -z "${CODEOWNER:-}" ]; then echo "scripts/loop/config の CODEOWNER を埋めてください" >&2; exit 1; fi
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
echo "repository: $repo"

label() { gh label create "$1" --color "$2" --description "$3" --force >/dev/null; echo "label: $1"; }
label loop:bootstrap  5319e7 "土台と CI を作る最初の issue"
label loop:planned    c5def5 "計画済み・検証前"
label loop:ready      0e8a16 "検証済み・着手可能(オーケストレーターだけが付ける)"
label loop:in-progress fbca04 "iteration が作業中(オーケストレーターだけが付ける)"
label loop:replan     d93f0b "分割の誤り。replan iteration が直す"
label loop:escalated  b60205 "人間の判断が必要"
label loop:canary     bfdadc "ハーネスの自己テスト PR。マージしない"

# 必須チェックと CODEOWNERS のレビューを main に課す。
# PR を開くのはループ(GitHub App)。保護パスを含む PR は、オーナー(CODEOWNER)の承認がないとマージできない。
python3 -I - "$REQUIRED_CHECKS" <<'PY' | gh api -X PUT "repos/$repo/branches/$DEFAULT_BRANCH/protection" --input - >/dev/null
import json, sys
print(json.dumps({
    "required_status_checks": {"strict": True, "contexts": sys.argv[1].split()},
    "enforce_admins": False,
    "required_pull_request_reviews": {"require_code_owner_reviews": True, "required_approving_review_count": 0},
    "restrictions": None,
    "allow_force_pushes": False,
    "allow_deletions": False,
}))
PY
echo "branch protection: $DEFAULT_BRANCH requires $REQUIRED_CHECKS"

# ループは GitHub App で GitHub を操作する(docs/adr/0018)。App の作成とインストールはブラウザで行う
if [ -n "${LOOP_APP_ID:-}" ]; then
  key="${LOOP_APP_KEY_FILE:-$(dirname "$(git rev-parse --show-toplevel)")/$(basename "$(git rev-parse --show-toplevel)").loop/app-key.pem}"
  LOOP_APP_ID="$LOOP_APP_ID" LOOP_APP_KEY_FILE="$key" LOOP_APP_TOKEN_CACHE="" python3 -I "$LOOP_DIR/app_token.py" identity | sed -n 2p | sed 's/^/GitHub App: /'
else
  cat >&2 <<'MD'
ループ用の GitHub App を作ってください(Settings > Developer settings > GitHub Apps > New GitHub App):
  - Webhook: 無効
  - Repository permissions: Contents, Issues, Pull requests を Read and write、Checks, Commit statuses, Actions を Read-only
  - 作ったら秘密鍵を生成して ../<repo>.loop/app-key.pem に置き、このリポジトリだけにインストールする
  - App ID を scripts/loop/config の LOOP_APP_ID に入れて、もう一度実行する
MD
fi

if [ -z "$(gh issue list --label loop:bootstrap --state all --json number --jq '.[0].number // empty')" ]; then
  gh issue create --label loop:bootstrap --title "bootstrap: 土台と CI" --body "$(cat <<'MD'
AGENTS.md の「Bootstrap」に書いたものを作る。受け入れ条件は実装しない。

## 完了の条件

- 必須チェック(`scripts/loop/config` の `REQUIRED_CHECKS`)が bootstrap の PR で green
- `scripts/loop/canaries.md` の全ケースで、カナリア PR の結果が期待と一致する(判定はオーケストレーター)
MD
)"
fi
echo "done. 次は: scripts/loop/run.sh all"

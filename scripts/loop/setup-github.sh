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
# PR を開くのはループ(bot のアカウント)。保護パスを含む PR は、オーナー(CODEOWNER)の承認がないとマージできない。
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

# ループは bot のアカウントで GitHub を操作する(docs/adr/0017)。管理者にはしない(ブランチ保護をすり抜けさせない)
if [ -n "${BOT_LOGIN:-}" ]; then
  gh api -X PUT "repos/$repo/collaborators/$BOT_LOGIN" -f permission=push >/dev/null
  echo "collaborator: $BOT_LOGIN (write)。招待を bot のアカウントで受け、その classic token(repo の権限)を BOT_TOKEN_FILE に置く"
else
  echo "scripts/loop/config の BOT_LOGIN を埋めて、もう一度実行してください(ループは bot のアカウントで動く)" >&2
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

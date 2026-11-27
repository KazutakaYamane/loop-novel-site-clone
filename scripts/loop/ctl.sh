#!/usr/bin/env bash
# ループの起動・停止・状態の表示。メインのチェックアウト(デフォルトブランチ)から動かす。
#
#   scripts/loop/ctl.sh start <run.sh の引数>   run.sh を裏で起動し、Orca があればループを見るタブを開く
#   scripts/loop/ctl.sh status                  動作中・待機中・人間待ち・完了・停止のどれかと、その中身を出す
#   scripts/loop/ctl.sh watch                   ログと状態を流し続ける(Orca のタブの中身と同じ)
#   scripts/loop/ctl.sh stop                    run.sh と子のエージェントをまとめて止める
#
# メインのチャットが、オーナーの gh アカウントで使うもの(.claude/skills/loop-operator):
#   scripts/loop/ctl.sh escalations             未解決の escalation と、その申請・最後のコメントを JSON で出す
#   scripts/loop/ctl.sh await [秒]              新しい escalation が出るか、ループが止まるまで待ち、状態を出す
#   scripts/loop/ctl.sh approve <issue> [path…] 既存テストの変更を承認し、issue を再開できるようにする
#   scripts/loop/ctl.sh answer <issue> <text>   人間の判断をコメントに残し、issue を再開できるようにする
#   scripts/loop/ctl.sh replan <issue> <text>   issue を分け直しに回す
#
# run.sh を Orca のタブの中で直接動かすと、タブを閉じたときにループも終わる。
# そのためループは setsid nohup で切り離し、タブは見るためだけに使う。
set -euo pipefail

LOOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$LOOP_DIR/../.." && pwd)"
STATE_DIR="${STATE_DIR:-$(dirname "$REPO_ROOT")/$(basename "$REPO_ROOT").loop}"
st() { python3 -I "$LOOP_DIR/loop_status.py" "$@"; }
usage() { sed -n '2,15p' "$0" >&2; exit 64; }

case "${1:-}" in
  start)
    shift
    [ $# -ge 1 ] || usage
    if st running "$STATE_DIR"; then
      echo "already running:"
      st status "$STATE_DIR"
      exit 1
    fi
    mkdir -p "$STATE_DIR"
    log="$STATE_DIR/$1-run.log"
    if [ -s "$log" ]; then mv "$log" "$STATE_DIR/$1-run.$(date +%Y%m%d-%H%M%S).log"; fi
    (cd "$REPO_ROOT" && LOOP_RUN_LOG="$log" STATE_DIR="$STATE_DIR" setsid nohup "$LOOP_DIR/run.sh" "$@" >"$log" 2>&1 </dev/null &)
    # run.sh が起動を記録するまで待つ。すぐ落ちたときはその記録を出す
    for _ in $(seq 50); do st running "$STATE_DIR" && break; sleep 0.2; done
    st open-watch "$STATE_DIR" "$REPO_ROOT" "loop: $1"
    st status "$STATE_DIR"
    ;;
  status) st status "$STATE_DIR" ;;
  watch) st watch "$STATE_DIR" ;;
  stop) st stop "$STATE_DIR" ;;
  # ループのエージェントは呼べない(guard-hook.py が止め、bot のトークンでは issues.py が断る)
  escalations) (cd "$REPO_ROOT" && python3 -I "$LOOP_DIR/issues.py" escalations) ;;
  approve|answer|replan)
    cmd=$1; shift
    [ $# -ge 1 ] || usage
    (cd "$REPO_ROOT" && python3 -I "$LOOP_DIR/issues.py" "$cmd" "$@")
    ;;
  await)
    interval=${2:-120}
    escalated() { (cd "$REPO_ROOT" && gh issue list --state open --label loop:escalated --limit 100 --json number --jq '.[].number' | sort -n); }
    before="$(escalated)"
    while :; do
      now="$(escalated)"
      new="$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$now") | sed '/^$/d')"
      if [ -n "$new" ] || ! st running "$STATE_DIR"; then
        [ -z "$new" ] || echo "new escalations: $(echo $new)"
        st status "$STATE_DIR"
        exit 0
      fi
      sleep "$interval"
    done
    ;;
  *) usage ;;
esac

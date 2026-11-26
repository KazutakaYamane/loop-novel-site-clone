#!/usr/bin/env bash
# ループのオーケストレーター。メインのチェックアウト(デフォルトブランチ)から動かす。
#
#   scripts/loop/run.sh bootstrap   loop:bootstrap の issue を実装し、カナリアが一致したらマージする
#   scripts/loop/run.sh plan        要件書を issue に分け、validator と critic を通ったら loop:ready にする
#   scripts/loop/run.sh work        loop:ready の issue を順に(PARALLELISM 本ずつ)実装し、green ならマージする
#   scripts/loop/run.sh all         bootstrap → plan → work
#
# 普段は scripts/loop/ctl.sh start <上の引数> で裏で起動する(状態の表示と Orca のタブは ctl.sh を参照)。
# ログと worktree はリポジトリの外(<repo>.loop/)に置く。
set -euo pipefail

LOOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$LOOP_DIR/../.." && pwd)"
# shellcheck source=config
source "$LOOP_DIR/config"
case "$LOOP_AGENT" in
  claude) MODEL="$CLAUDE_MODEL" ;;
  codex)
    : "${CODEX_MODEL:?set CODEX_MODEL for the loop}"
    [[ ${CODEX_MAX_SECONDS:-} =~ ^[1-9][0-9]{0,8}$ ]] || { echo "set CODEX_MAX_SECONDS to a positive integer (up to 9 digits)" >&2; exit 64; }
    MODEL="$CODEX_MODEL" ;;
  *) echo "unknown LOOP_AGENT: $LOOP_AGENT" >&2; exit 64 ;;
esac
command -v "$LOOP_AGENT" >/dev/null || { echo "missing CLI: $LOOP_AGENT" >&2; exit 69; }
export LOOP_AGENT MODEL EFFORT
STATE_DIR="${STATE_DIR:-$(dirname "$REPO_ROOT")/$(basename "$REPO_ROOT").loop}"
LOG_DIR="$STATE_DIR/logs"
WT_DIR="$STATE_DIR/worktrees"
METRICS_DIR="$STATE_DIR/metrics"
# カナリアの仕様と結果。土台作り役の worktree からは見えない場所に置く
CANARY_DIR="$STATE_DIR/canaries"
SPEC="$CANARY_DIR/spec.md"
mkdir -p "$LOG_DIR" "$WT_DIR" "$METRICS_DIR" "$CANARY_DIR"
LOOP_CANARY_DIR="$CANARY_DIR"
export REVIEW_LEVEL RATE_LIMIT_FALLBACK_WAIT_SECONDS REPO_ROOT LOOP_DIR REQUIRED_CHECKS CODEOWNER MAX_ATTEMPTS MAX_AC_PER_ISSUE CANARY_TIMEOUT_SECONDS \
  CANARY_ARBITER_AFTER DEFAULT_BRANCH LOOP_CANARY_DIR

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*" >&2; }
py() { python3 -I "$@"; }
# 状態を <STATE_DIR>/status/ に書き、Orca があればワークスペースの表示にも出す。$1 step $2 詳細
# 持ち場は STATUS_KEY(既定 main、並列の issue は issue-<番号>)。表示のためだけなので失敗しても続ける
set_status() { py "$LOOP_DIR/loop_status.py" set "$STATE_DIR" "${STATUS_KEY:-main}" "$1" "${2:-}" "${LAST_LOG:-}" || true; }

render_prompt() {
  py - "$1" <<'PY'
import os, re, sys
t = open(sys.argv[1], encoding="utf-8").read()
print(re.sub(r"\$\{([A-Z_]+)\}", lambda m: os.environ.get(m.group(1), ""), t))
PY
}

guard_settings() {
  py - "$LOOP_DIR/guard-hook.py" <<'PY'
import json, shlex, sys
cmd = "python3 -I " + shlex.quote(sys.argv[1])
print(json.dumps({"hooks": {"PreToolUse": [{"matcher": "Edit|Write|MultiEdit|NotebookEdit|Bash|Read|Grep|Glob",
                                             "hooks": [{"type": "command", "command": cmd}]}]}}))
PY
}

RESUME_PROMPT="Your previous turn was cut off by a usage limit or a temporary API error, and it is over now. Continue the same task from where you stopped. Things may have changed while you waited, so check the current state first (CI runs, pull requests, issue labels). End your final message with the RESULT line exactly as the original instructions say."
LIMIT_FILE="$STATE_DIR/limited-until"
if [ "$LOOP_AGENT" = codex ]; then LIMIT_FILE="$LIMIT_FILE-codex"; fi

# 利用上限が明けるまで待つ。待てる上限を超えるなら 1 を返す
wait_for_reset() {
  local resets=$1 now until max
  now=$(date +%s)
  until=$((resets + 60))
  max=$((now + RATE_LIMIT_MAX_WAIT_HOURS * 3600))
  if [ "$until" -gt "$max" ]; then
    log "usage limit resets at $(date -d "@$resets" '+%F %T'), beyond RATE_LIMIT_MAX_WAIT_HOURS; giving up"
    return 1
  fi
  echo "$until" >"$LIMIT_FILE"
  log "usage limit reached; waiting until $(date -d "@$until" '+%F %T')"
  set_status waiting-limit "$(date -d "@$until" '+%m/%d %H:%M') まで"
  while [ "$(date +%s)" -lt "$until" ]; do sleep 60; done
  rm -f "$LIMIT_FILE"
}

# $1 プロンプト, $2 作業ディレクトリ, $3 ログ名, $4 予算(USD), $5 LOOP_MODE。ログのパスを LAST_LOG に入れる
# 利用上限や一時的なエラーで止まったら、待ってから同じセッションを resume する。各回の記録は LAST_LOG に連結する
run_agent() {
  local tmpl=$1 dir=$2 name=$3 budget=$4 mode=$5 prompt settings base part=0 sid="" state resets remaining transient=0
  base="$LOG_DIR/$LOOP_AGENT-$name-$(date +%Y%m%d-%H%M%S)"
  LAST_LOG="$base.jsonl"
  : >"$LAST_LOG"
  : >"$LAST_LOG.stderr"
  prompt="$(render_prompt "$LOOP_DIR/prompts/$tmpl")"
  local active=0 started rc partlog action target message run_tmp
  # エージェントの一時ファイル(Claude Code の scratchpad、check-output.sh のログ、試しに作った worktree)を
  # この実行専用のディレクトリに集め、終わったら消す
  run_tmp="$STATE_DIR/tmp/$(basename "$base")"
  mkdir -p "$run_tmp"
  # この実行を Orca のその worktree のタブで流して見られるようにする
  py "$LOOP_DIR/loop_status.py" agent-tab "$STATE_DIR" "$dir" "$name" "$base" "$REPO_ROOT" || true
  while :; do
    part=$((part + 1))
    partlog="$base.part$part"
    rc=0
    local -a args
    if [ "$LOOP_AGENT" = claude ]; then
      remaining="$(py -c 'import sys; print(f"{max(0.0, float(sys.argv[1]) - float(sys.argv[2])):.2f}")' \
        "$budget" "$(py "$LOOP_DIR/claude_log.py" spent "$LAST_LOG")")"
      if [ "$remaining" = "0.00" ]; then log "budget used up across resumes: $name"; break; fi
      settings="$(guard_settings)"
      args=(claude --model "$MODEL" --effort "$EFFORT" --permission-mode "$PERMISSION_MODE" --max-budget-usd "$remaining"
        --settings "$settings" --output-format stream-json --verbose)
      if [ -n "$sid" ]; then args+=(--resume "$sid" -p "$RESUME_PROMPT"); else args+=(-p "$prompt"); fi
    else
      remaining=$((CODEX_MAX_SECONDS - active))
      if (( remaining <= 0 )); then log "time limit reached: $name"; break; fi
      action=start target="" message="$prompt"
      if [ -n "$sid" ]; then action=resume target="$sid" message="$RESUME_PROMPT"; fi
      args=(timeout --signal=KILL "$remaining" python3 -I "$LOOP_DIR/codex_agent.py" "$action" "$target" "$message")
    fi
    log "$LOOP_AGENT: $name ($tmpl, part $part) in $dir -> $LAST_LOG"
    set_status agent "$name"
    started=$SECONDS
    local output="$partlog.jsonl"
    if [ "$LOOP_AGENT" = codex ]; then output="$partlog.raw.jsonl"; fi
    (cd "$dir" && TMPDIR="$run_tmp" LOOP_MODE="$mode" LOOP_REPO_ROOT="$REPO_ROOT" LOOP_WT_DIR="$WT_DIR" \
      LOOP_DEFAULT_REF="origin/$DEFAULT_BRANCH" "${args[@]}" </dev/null >"$output" 2>"$partlog.stderr") || rc=$?
    if [ "$LOOP_AGENT" = codex ]; then
      local elapsed=$((SECONDS - started))
      active=$((active + elapsed))
      py "$LOOP_DIR/codex_agent.py" normalize "$output" "$rc" "$elapsed" >"$partlog.jsonl"
    fi
    if (( rc )); then log "$LOOP_AGENT exited $rc: $name (part $part)"; fi
    cat "$base.part$part.jsonl" >>"$LAST_LOG"
    cat "$base.part$part.stderr" >>"$LAST_LOG.stderr"
    state="$(py "$LOOP_DIR/claude_log.py" classify "$base.part$part.jsonl" "$base.part$part.stderr")"
    case "$state" in
      limit*)
        read -r _ resets new_sid <<<"$state"
        [ -z "${new_sid:-}" ] || sid=$new_sid
        if [ "$LOOP_AGENT" = codex ] && [ -z "$sid" ]; then break; fi
        wait_for_reset "$resets" || break ;;
      transient*)
        read -r _ new_sid <<<"$state"
        [ -z "${new_sid:-}" ] || sid=$new_sid
        if [ "$LOOP_AGENT" = codex ] && [ -z "$sid" ]; then break; fi
        transient=$((transient + 1))
        if [ "$transient" -gt "$TRANSIENT_RETRIES" ]; then log "too many temporary errors: $name"; break; fi
        log "temporary API error; retrying in ${TRANSIENT_WAIT_SECONDS}s ($transient/$TRANSIENT_RETRIES)"
        sleep "$TRANSIENT_WAIT_SECONDS" ;;
      *) break ;;
    esac
  done
  # 見るタブ(loop_status.py follow)に、この実行が終わったことを知らせる
  touch "$base.done"
  remove_dir "$run_tmp" || true
  git -C "$dir" worktree prune 2>/dev/null || true
}

# 最終メッセージの最後の "RESULT:" 行を出す
result_of() { py "$LOOP_DIR/claude_log.py" result "$1"; }

# issue ごとに、各実行の API 換算の費用・時間・ターン数・resume の回数を貯める。CI はマージ時のコメントから metrics を作る
record_metrics() { py "$LOOP_DIR/claude_log.py" metrics "$2" "$3" >>"$METRICS_DIR/$1.jsonl"; }

limited_now() { [ -f "$LIMIT_FILE" ] && [ "$(date +%s)" -lt "$(cat "$LIMIT_FILE")" ]; }

post_metrics() {
  local n=$1 pr=$2 body
  body="$(printf '<!-- loop-metrics -->\n```jsonl\n%s\n```\n' "$(cat "$METRICS_DIR/$n.jsonl" 2>/dev/null)")"
  gh pr comment "$pr" --body "$body" >/dev/null
}

# 人間の判断を求めた回数を数えるため、escalation のたびに1行残す。$1 issue(無ければ空) $2 誰が(orchestrator|agent) $3 理由
# 計測は bootstrap の後から。cmd_bootstrap の中(LOOP_PHASE=bootstrap)では記録しない
record_escalation() {
  set_status escalated "${1:+#$1 }$3"
  [ "${LOOP_PHASE:-}" != bootstrap ] || return 0
  py - "$METRICS_DIR/escalations.jsonl" "$1" "$2" "$3" <<'PY' || true
import json, sys
from datetime import datetime, timezone
path, issue, source, reason = sys.argv[1:]
row = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
       "issue": int(issue) if issue.isdigit() else None, "source": source, "reason": reason[:500]}
with open(path, "a", encoding="utf-8") as f:
    f.write(json.dumps(row, ensure_ascii=False) + "\n")
PY
}

escalate_issue() {
  local n=$1 msg=$2
  log "escalate #$n: $msg"
  record_escalation "$n" orchestrator "$msg"
  gh issue edit "$n" --add-label loop:escalated --remove-label loop:in-progress >/dev/null || true
  gh issue comment "$n" --body "オーケストレーターが escalation にしました: $msg" >/dev/null || true
}

open_escalation() {
  log "escalate: $1"
  record_escalation "" orchestrator "$1"
  gh issue create --title "loop: $1" --label loop:escalated --body "$2" >/dev/null
}

ensure_worktree() {
  local branch=$1 wt="$WT_DIR/$1"
  if [ ! -d "$wt" ]; then
    if git -C "$REPO_ROOT" show-ref -q --verify "refs/heads/$branch"; then
      git -C "$REPO_ROOT" worktree add -q "$wt" "$branch" >&2
    elif git -C "$REPO_ROOT" show-ref -q --verify "refs/remotes/origin/$branch"; then
      git -C "$REPO_ROOT" worktree add -q -b "$branch" "$wt" "origin/$branch" >&2
    else
      git -C "$REPO_ROOT" worktree add -q -b "$branch" "$wt" "origin/$DEFAULT_BRANCH" >&2
    fi
  fi
  echo "$wt"
}

# $1 worktree の名前, $2 ref。その ref に切り離した状態(detached)の worktree を用意する
ensure_detached_worktree() {
  local wt="$WT_DIR/$1" ref=$2
  if [ -d "$wt" ]; then
    git -C "$wt" reset -q --hard >&2
    git -C "$wt" checkout -q --detach "$ref" >&2
  else
    git -C "$REPO_ROOT" worktree add -q --detach "$wt" "$ref" >&2
  fi
  echo "$wt"
}

ensure_plan_worktree() { ensure_detached_worktree plan "origin/$DEFAULT_BRANCH"; }

# 片付けに使うイメージ。手元にある開発用のイメージを優先し、取得し直さずに済ませる
cleanup_image() {
  local img
  for img in $(docker compose -f "$REPO_ROOT/compose.yaml" config --images 2>/dev/null) alpine; do
    if docker image inspect "$img" >/dev/null 2>&1; then echo "$img"; return; fi
  done
  echo alpine
}

# ディレクトリを消す。開発用のコンテナが root で作ったファイル(vendor、mutation のレポートなど)は
# そのままでは消せないので、コンテナの中で持ち主を戻してから消す
remove_dir() {
  local dir=$1
  [ -e "$dir" ] || return 0
  rm -rf "$dir" 2>/dev/null && return 0
  docker run --rm -v "$dir:/w" --entrypoint sh "$(cleanup_image)" \
    -c "chown -R $(id -u):$(id -g) /w && chmod -R u+rwX /w" >/dev/null 2>&1 || true
  rm -rf "$dir" 2>/dev/null && return 0
  log "could not remove $dir"
  return 1
}

# worktree を跡が残らないように消す: コンテナとボリューム、Orca のタブ、作業ディレクトリ、git の登録。$2 はその worktree のリポジトリ
remove_worktree() {
  local wt=$1 repo=${2:-$REPO_ROOT}
  if [ -x "$wt/scripts/worktree-teardown.sh" ]; then (cd "$wt" && scripts/worktree-teardown.sh) || true; fi
  py "$LOOP_DIR/loop_status.py" forget-tab "$STATE_DIR" "$wt" || true
  git -C "$repo" worktree remove --force "$wt" 2>/dev/null || true
  remove_dir "$wt" || true
  git -C "$repo" worktree prune || true
}

checks_green() { gh pr checks "$1" --required >/dev/null 2>&1; }

merge_pr() {
  local pr=$1 wt=$2
  remove_worktree "$wt"
  (cd "$REPO_ROOT" && gh pr merge "$pr" --squash --delete-branch "${@:3}")
}

# カナリアの仕様を書かせ(または直させ)、検査を通ったら sha256 を issue に残して固定する。$1 issue, $2 最初の指摘
canary_spec() {
  local n=$1 feedback=$2 wt r v sum
  wt="$(ensure_detached_worktree canary-spec "origin/$DEFAULT_BRANCH")"
  for round in $(seq 1 "$MAX_CANARY_SPEC_ROUNDS"); do
    export SPEC_PATH="$SPEC" RULES="$(py "$LOOP_DIR/canaries.py" rules)" FEEDBACK="$feedback"
    EFFORT="$BOOTSTRAP_EFFORT" run_agent canary-spec.md "$wt" "canary-spec-r$round" "$MAX_COST_USD" canary-spec
    record_metrics "$n" "$LAST_LOG" "canary-spec-r$round"
    r="$(result_of "$LAST_LOG")"
    case "$r" in "RESULT: written"*) ;; *) log "canary spec writer ended with: $r"; return 1 ;; esac
    if v="$(py "$LOOP_DIR/canaries.py" validate "$SPEC")"; then
      sum="$(sha256sum "$SPEC" | cut -d' ' -f1)"
      echo "$sum" >"$SPEC.sha256"
      gh issue comment "$n" --body "カナリアの仕様を固定しました(中身は土台作りが終わるまで伏せます)。sha256: \`$sum\`" >/dev/null
      return 0
    fi
    feedback="$v"
  done
  return 1
}

spec_unchanged() { [ "$(sha256sum "$SPEC" | cut -d' ' -f1)" = "$(cat "$SPEC.sha256")" ]; }

# 何度も落ちたケースを判定役に見せ、CI を直すべきか、カナリアを直すべきかを決めさせる
arbitrate() {
  local n=$1 rd=$2 id r revise=""
  while read -r id; do
    [ -n "$id" ] || continue
    export CASE_TEXT CASE_RULES DIFF_PATH="$rd/$id.diff" CHECKS_PATH="$rd/$id.checks.json"
    CASE_TEXT="$(py "$LOOP_DIR/canaries.py" case "$SPEC" "$id")"
    CASE_RULES="$(py "$LOOP_DIR/canaries.py" rules | grep -E "^($(sed -n 's/^- rule: *//p' <<<"$CASE_TEXT" | tr -d ' ' | tr ',' '|')):" || true)"
    EFFORT="$BOOTSTRAP_EFFORT" run_agent canary-arbiter.md "$rd" "canary-arbiter-$id" "$MAX_COST_USD" canary-read
    record_metrics "$n" "$LAST_LOG" "canary-arbiter-$id"
    r="$(result_of "$LAST_LOG")"
    log "arbiter on $id: $r"
    case "$r" in
      "RESULT: invalid "*) revise+="- case \`$id\` was judged unfair by the arbiter; rewrite it: ${r#RESULT: invalid }"$'\n' ;;
      "RESULT: waive "*)
        set -- ${r#RESULT: waive }
        py "$LOOP_DIR/canaries.py" waive "$1" "${*:2}"
        revise+="- rule $1 was waived by the arbiter (${*:2}); remove case \`$id\` unless it also tests another rule"$'\n' ;;
    esac
  done <"$rd/arbitrate.txt"
  if [ -n "$revise" ]; then
    gh issue comment "$n" --body "$(printf '判定役の結論によりカナリアの仕様を直します:\n\n%s' "$revise")" >/dev/null
    canary_spec "$n" "$revise" || return 1
    py - "$CANARY_DIR/fails.json" <<'PY'
import sys, pathlib
pathlib.Path(sys.argv[1]).write_text("{}", encoding="utf-8")
PY
  fi
}

# bootstrap PR の head が手元の HEAD と同じか確かめ、その commit の必須ジョブを待つ。CI 待ちはエージェントにさせない
# (重い文脈のまま待つとターンごとに読み直しの費用がかかるため)。BOOT_HEAD に commit、BOOT_CI に結果を入れる
# 0 green / 2 落ちたジョブがある / 3 push が PR に届いていない / それ以外は確かめられなかった
wait_boot_ci() {
  local pr_head rc=0 tries=0 poll=${BOOT_PR_HEAD_POLL_SECONDS:-5}
  BOOT_HEAD="$(git -C "$WORKTREE" rev-parse HEAD)" || return 1
  # push の直後は、GitHub の PR の head がしばらく前のコミットのままになる。追いつくまで2分ほど待つ
  while :; do
    pr_head="$(gh pr view "$BOOT_PR" --json headRefOid --jq .headRefOid)" || return 1
    [ "$BOOT_HEAD" != "$pr_head" ] || break
    tries=$((tries + 1))
    if [ "$tries" -ge 24 ]; then
      log "the head of $BOOT_PR ($pr_head) is not the local HEAD $BOOT_HEAD"
      BOOT_CI="The local HEAD $BOOT_HEAD is not the head of $BOOT_PR ($pr_head). Commit and push your work to the PR branch."
      return 3
    fi
    sleep "$poll"
  done
  log "waiting for required checks on $BOOT_PR ($BOOT_HEAD)"
  set_status waiting-ci "$BOOT_PR $BOOT_HEAD"
  BOOT_CI="$(py "$LOOP_DIR/feature_ci.py" "$BOOT_PR" "$BOOT_HEAD" "$REQUIRED_CHECKS" "$POLL_SECONDS" "$FEATURE_CI_TIMEOUT_SECONDS" 2>&1)" || rc=$?
  return "$rc"
}

# 落ちた CI を、次のセッションに渡す指摘にする。履歴は AGENTS.md の停止条件(同じ失敗が続く)を判断する材料
boot_ci_feedback() {
  printf '\n\nThe required checks failed on your last push (%s):\n%s\n\nCI history of this bootstrap (oldest first):\n%s\n' \
    "$BOOT_HEAD" "$BOOT_CI" "$(tail -n 80 "$BOOT_CI_HISTORY")"
}

# bootstrap の1段階を1セッションで行う。$1 番号 $2 段階名 $3 プロンプトの段階ファイル $4 期待する結果(done|green)
# green の段階はエージェントが push して終わり、まとめ役が CI を待つ。落ちたら指摘を付けて新しいセッションで直させる
# 成功で 0。green のときは BOOT_PR に PR の URL を入れる
bootstrap_stage() {
  local n=$1 stage=$2 file=$3 want=$4 r ci_note="" attempt=0 last_head="" ci
  export STAGE="$stage"
  while :; do
    export FEEDBACK="${STAGE_FEEDBACK:-}$ci_note"
    STAGE_TASK="$(render_prompt "$LOOP_DIR/prompts/bootstrap/$file.md")"; export STAGE_TASK
    EFFORT="$BOOTSTRAP_EFFORT" run_agent bootstrap.md "$WORKTREE" "bootstrap-$stage-r$ROUND" "$MAX_COST_USD_BOOTSTRAP_STAGE" bootstrap
    record_metrics "$n" "$LAST_LOG" "bootstrap-$stage-r$ROUND"
    r="$(result_of "$LAST_LOG")"
    case "$want:$r" in
      "done:RESULT: done"*) return 0 ;;
      "green:RESULT: pushed "*)
        BOOT_PR="${r#RESULT: pushed }"
        attempt=$((attempt + 1))
        ci=0; wait_boot_ci || ci=$?
        case "$ci" in
          0) return 0 ;;
          2)
            if [ "$BOOT_HEAD" = "$last_head" ]; then
              escalate_issue "$n" "bootstrap stage $stage (round $ROUND) pushed nothing new after CI failed on $BOOT_HEAD"; return 1
            fi
            last_head=$BOOT_HEAD
            printf 'Attempt %s %s %s\n%s\n' "$stage-r$ROUND-a$attempt" "$BOOT_HEAD" "$BOOT_PR" "$BOOT_CI" >>"$BOOT_CI_HISTORY"
            log "required checks failed on $BOOT_HEAD (stage $stage, attempt $attempt)"
            ci_note="$(boot_ci_feedback)" ;;
          3) ci_note="$(printf '\n\n%s\n' "$BOOT_CI")" ;;
          *) escalate_issue "$n" "could not verify CI on $BOOT_PR ($BOOT_HEAD): $BOOT_CI"; return 1 ;;
        esac
        if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
          escalate_issue "$n" "bootstrap stage $stage (round $ROUND) reached the attempt limit ($MAX_ATTEMPTS)"; return 1
        fi
        continue ;;
      *) escalate_issue "$n" "bootstrap stage $stage (round $ROUND) ended with: $r (log: $(basename "$LAST_LOG"))"; return 1 ;;
    esac
  done
}

cmd_bootstrap() {
  git -C "$REPO_ROOT" fetch -q origin
  local n branch wt cwt r report rd stage area last ci start=1 done_file="$STATE_DIR/bootstrap-stages.done"
  local LOOP_PHASE=bootstrap
  n="$(gh issue list --label loop:bootstrap --state open --json number --jq '.[0].number // empty')"
  if [ -z "$n" ]; then log "no open loop:bootstrap issue; skipping bootstrap"; return 0; fi
  branch="$n-bootstrap"
  gh issue edit "$n" --add-label loop:in-progress >/dev/null

  # CI ができる前に、別のエージェントがカナリアの仕様を書いて固定する
  if [ ! -f "$SPEC.sha256" ]; then
    canary_spec "$n" "" || { escalate_issue "$n" "the canary spec did not pass validation"; return 1; }
  fi

  wt="$(ensure_worktree "$branch")"
  export ISSUE=$n BRANCH=$branch WORKTREE=$wt MAX_ROUNDS=$MAX_BOOTSTRAP_ROUNDS STAGE_FEEDBACK="" FIX_AREA=""
  BOOT_CI_HISTORY="$STATE_DIR/bootstrap-ci-history"
  touch "$BOOT_CI_HISTORY"
  touch "$done_file"
  BOOT_PR="$(gh pr list --head "$branch" --state open --json url --jq '.[0].url // empty')"

  # 中断後の再開: 最後にカナリアを試した round の次から、その不合格を引き継いで続ける
  last="$(find "$CANARY_DIR" -maxdepth 1 -name 'round-*' -printf '%f\n' 2>/dev/null | sed 's/^round-//' | sort -n | tail -1)"
  if [ -n "$last" ] && [ -f "$CANARY_DIR/round-$last/feedback.md" ]; then
    start=$((last + 1))
    for stage in $BOOTSTRAP_STAGES; do grep -qx "$stage" "$done_file" || echo "$stage" >>"$done_file"; done
    py "$LOOP_DIR/canaries.py" close
    log "resuming bootstrap at round $start with the failures of round $last"
  fi

  # 段階を順に積む(1回目の round だけ)
  if [ "$start" -eq 1 ]; then
    export ROUND=1
    for stage in $BOOTSTRAP_STAGES; do
      grep -qx "$stage" "$done_file" && continue
      STAGE_FEEDBACK=""
      if [ "$stage" = finish ]; then bootstrap_stage "$n" "$stage" finish green || return 1
      else bootstrap_stage "$n" "$stage" "$stage" done || return 1; fi
      echo "$stage" >>"$done_file"
    done
  fi

  for round in $(seq "$start" "$MAX_BOOTSTRAP_ROUNDS"); do
    export ROUND=$round
    if [ "$round" -gt 1 ]; then
      rd="$CANARY_DIR/round-$((round - 1))"
      # 判定役は1回だけ(中断して戻ってきたときに重ねて行わない)
      if [ ! -f "$rd/arbitrated" ]; then
        arbitrate "$n" "$rd" || { escalate_issue "$n" "the canary spec could not be revised after arbitration"; return 1; }
        touch "$rd/arbitrated"
      fi
      # 不合格を担当ごとに分け、担当ごとに別のセッションで直す
      for area in $(py "$LOOP_DIR/canaries.py" split-feedback "$rd/feedback.md" "$rd"); do
        [ -f "$rd/fix-$area.done" ] && continue
        export FIX_AREA="$area"
        STAGE_FEEDBACK="$(cat "$rd/fix-$area.md")"
        bootstrap_stage "$n" "fix-$area" fix green || return 1
        touch "$rd/fix-$area.done"
      done
      [ -n "$BOOT_PR" ] || BOOT_PR="$(gh pr list --head "$branch" --state open --json url --jq '.[0].url // empty')"
    fi
    # 中断後の再開では CI がまだ走っていることがある。終わるまで待ち、落ちていたときだけ直させる
    if [ -z "$BOOT_PR" ]; then
      STAGE_FEEDBACK="No bootstrap PR is open for this branch. Open it."
      bootstrap_stage "$n" finish finish green || return 1
    else
      ci=0; wait_boot_ci || ci=$?
      case "$ci" in
        0) ;;
        2|3)
          if [ "$ci" = 2 ]; then
            printf 'Attempt %s %s %s\n%s\n' "check-r$round" "$BOOT_HEAD" "$BOOT_PR" "$BOOT_CI" >>"$BOOT_CI_HISTORY"
            STAGE_FEEDBACK="$(boot_ci_feedback)"
          else
            STAGE_FEEDBACK="$BOOT_CI"
          fi
          bootstrap_stage "$n" finish finish green || return 1 ;;
        *) escalate_issue "$n" "could not verify CI on $BOOT_PR: $BOOT_CI"; return 1 ;;
      esac
    fi

    # 土台作り役とは別のエージェントが、固定した仕様どおりにカナリア PR を出す
    git -C "$REPO_ROOT" fetch -q origin
    cwt="$(ensure_detached_worktree canary-apply "origin/$branch")"
    WORKTREE="$cwt" SPEC_PATH="$SPEC" EFFORT="$BOOTSTRAP_EFFORT" run_agent canary-apply.md "$cwt" "canary-apply-r$round" "$MAX_COST_USD" canary
    record_metrics "$n" "$LAST_LOG" "canary-apply-r$round"
    spec_unchanged || { escalate_issue "$n" "the canary spec changed after it was fixed"; return 1; }

    rd="$CANARY_DIR/round-$round"
    log "checking canaries"
    set_status waiting-canaries "round $round"
    report="$(py "$LOOP_DIR/canaries.py" check "$branch" "$SPEC" "$rd")" && r=ok || r=ng
    py "$LOOP_DIR/canaries.py" close
    if [ "$r" = ok ]; then
      gh pr comment "$BOOT_PR" --body "$(printf 'カナリアの判定(まとめ役):\n\n%s\n\n<details><summary>カナリアの仕様</summary>\n\n%s\n\n</details>\n' "$report" "$(cat "$SPEC")")" >/dev/null
      post_metrics "$n" "$BOOT_PR"
      merge_pr "$BOOT_PR" "$wt"
      # カナリアの worktree は bootstrap の後は使わない
      remove_worktree "$WT_DIR/canary-apply"
      remove_worktree "$WT_DIR/canary-spec"
      gh issue edit "$n" --remove-label loop:in-progress >/dev/null || true
      log "bootstrap merged: $BOOT_PR"
      return 0
    fi
  done
  escalate_issue "$n" "canaries did not match after $MAX_BOOTSTRAP_ROUNDS rounds"
  return 1
}

# $1 planner のプロンプト(plan.md | replan.md), $2 ログ名
plan_cycle() {
  local tmpl=$1 name=$2 wt r v c feedback=""
  git -C "$REPO_ROOT" fetch -q origin
  wt="$(ensure_plan_worktree)"
  for round in $(seq 1 "$MAX_PLAN_ROUNDS"); do
    export ROUND=$round MAX_ROUNDS=$MAX_PLAN_ROUNDS FEEDBACK="$feedback"
    run_agent "$tmpl" "$wt" "$name-r$round" "$MAX_COST_USD" normal
    # 計画系は issue に属さないので plan.jsonl にまとめる(PR には転記されない)
    record_metrics plan "$LAST_LOG" "$name-r$round"
    r="$(result_of "$LAST_LOG")"
    case "$r" in
      "RESULT: planned"*) ;;
      "RESULT: escalated"*) log "planner escalated: $r"; record_escalation "" agent "$name: $r"; return 1 ;;
      *) open_escalation "$name ended without a result" "round $round: $r (log: $(basename "$LAST_LOG"))"; return 1 ;;
    esac
    if ! v="$(py "$LOOP_DIR/issues.py" validate)"; then
      feedback="$(printf 'scripts/loop/validate-plan.sh failed:\n%s' "$v")"
      continue
    fi
    run_agent critic.md "$wt" "critic-r$round" "$MAX_COST_USD" normal
    record_metrics plan "$LAST_LOG" "$name-critic-r$round"
    c="$(result_of "$LAST_LOG")"
    case "$c" in
      "RESULT: approve"*) py "$LOOP_DIR/issues.py" promote; return 0 ;;
      "RESULT: changes"*) feedback="The critic requested changes and commented on the affected issues: ${c#RESULT: changes }" ;;
      *) open_escalation "critic ended without a result" "round $round: $c (log: $(basename "$LAST_LOG"))"; return 1 ;;
    esac
  done
  open_escalation "$name did not converge" "validator または critic を $MAX_PLAN_ROUNDS 回で通りませんでした。最後の指摘:

$feedback"
  return 1
}

cmd_plan() { plan_cycle plan.md plan; }

run_worker() {
  local role=$1 tmpl=$2 wt=$3 name=$4 n=$5 configured_level=$REVIEW_LEVEL
  local -x LOOP_LOCAL_REVIEW_FLOW=1
  local -x REVIEW_HANDOFF=""
  local -x REVIEW_LEVEL=medium
  if [ "$role" = implementation ]; then
    rm -f "$handoff/review-scope"
    REVIEW_HANDOFF="Classify the actual branch diff, including tests and affected callers. If it changes authorization or ownership checks, who can see a work or episode, or correctness under concurrent updates, write the word high to the file \`$handoff/review-scope\`. Otherwise write the word medium there. Write exactly one word."
  elif ! [ -f "$handoff/review-scope" ] || [ "$(cat "$handoff/review-scope")" != medium ]; then
    # 影響の大きい変更と、分類が欠けたときは config の深さでレビューする
    REVIEW_LEVEL=$configured_level
  fi
  if [ "$worker_provider" = codex ]; then
    LAST_LOG="$(mktemp "$LOG_DIR/$name-codex-XXXXXXXX.jsonl")"
    WORK_RESULT="$(render_prompt "$LOOP_DIR/prompts/$tmpl" |
      LOOP_MODE=normal LOOP_REPO_ROOT="$REPO_ROOT" LOOP_WT_DIR="$WT_DIR" LOOP_DEFAULT_REF="origin/$DEFAULT_BRANCH" \
      py "$LOOP_DIR/codex_worker.py" "$n" "$role" "$name" "$wt" "$LAST_LOG" "$METRICS_DIR/$n.jsonl")"
  else
    # LOOP_AGENT=codex で起動していても、Claude に割り当てた issue は Claude で動かす
    local EFFORT="$REVIEW_LEVEL"
    local -x LOOP_AGENT=claude MODEL="$CLAUDE_MODEL"
    run_agent "$tmpl" "$wt" "$name" "$MAX_COST_USD" normal
    record_metrics "$n" "$LAST_LOG" "$name"
    WORK_RESULT="$(result_of "$LAST_LOG")"
  fi
}

review_branch() {
  local round
  for round in $(seq 1 "$MAX_REVIEW_ROUNDS"); do
    export ROUND=$round MAX_ROUNDS=$MAX_REVIEW_ROUNDS REVIEW_REPORT="$handoff/review-$round.md"
    run_worker review review.md "$wt" "review-$n-a$attempt-r$round" "$n"
    case "$WORK_RESULT" in
      "RESULT: clean"|"RESULT: fixed "*) ;;
      "RESULT: escalated "*)
        record_escalation "$n" agent "review: $WORK_RESULT"
        gh issue edit "$n" --add-label loop:escalated --remove-label loop:in-progress >/dev/null
        return 1 ;;
      *) escalate_issue "$n" "review stopped: $WORK_RESULT (log: $(basename "$LAST_LOG"))"; return 1 ;;
    esac
    if [ ! -s "$REVIEW_REPORT" ] || [ -n "$(git -C "$wt" status --porcelain)" ]; then
      escalate_issue "$n" "review left an incomplete report or uncommitted changes"
      return 1
    fi
    cat "$REVIEW_REPORT" >>"$handoff/reviews.md"
    echo >>"$handoff/reviews.md"
    [ "$WORK_RESULT" != "RESULT: clean" ] || break
  done
  return 0
}

publish_feature() {
  local title
  git -C "$wt" push origin "$head:refs/heads/$branch" || return 1
  pr="$(gh pr list --state open --head "$branch" --base "$DEFAULT_BRANCH" --json url --jq '.[0].url // empty')" || return 1
  if [ -n "$pr" ]; then
    gh pr edit "$pr" --body-file "$PR_BODY" || return 1
  else
    title="$(gh issue view "$n" --json title --jq .title)" || return 1
    pr="$(gh pr create --base "$DEFAULT_BRANCH" --head "$branch" --title "$title" --body-file "$PR_BODY")" || return 1
  fi
  gh pr comment "$pr" --body-file "$handoff/reviews.md"
}

run_issue() (
  local n=$1 worker_provider=$2 branch wt handoff head pr attempt ci_status
  branch="$n-$(py "$LOOP_DIR/issues.py" slug "$n")"
  wt="$(ensure_worktree "$branch")"
  handoff="$(mktemp -d)"
  trap 'rm -rf -- "$handoff"' EXIT
  export ISSUE=$n BRANCH=$branch WORKTREE=$wt PR_BODY="$handoff/pr.md" STATUS_KEY="issue-$n"
  export CI_HISTORY="$STATE_DIR/issue-$n-ci-history"
  touch "$CI_HISTORY"
  attempt=$(($(grep -c '^Attempt ' "$CI_HISTORY" || true) + 1))
  while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
    run_worker implementation implement.md "$wt" "issue-$n-a$attempt" "$n"
    case "$WORK_RESULT" in
      "RESULT: ready-for-review") ;;
      "RESULT: replan "*) gh issue edit "$n" --add-label loop:replan --remove-label loop:in-progress,loop:ready >/dev/null; return ;;
      "RESULT: escalated "*)
        record_escalation "$n" agent "implementation: $WORK_RESULT"
        gh issue edit "$n" --add-label loop:escalated --remove-label loop:in-progress >/dev/null; return ;;
      *) escalate_issue "$n" "implementation stopped: $WORK_RESULT (log: $(basename "$LAST_LOG"))"; return ;;
    esac
    if [ ! -s "$PR_BODY" ] || [ -n "$(git -C "$wt" status --porcelain)" ]; then
      escalate_issue "$n" "missing prepared PR body or uncommitted implementation"
      return
    fi
    : >"$handoff/reviews.md"
    review_branch || return
    head="$(git -C "$wt" rev-parse HEAD)"
    if grep -Eq "^Attempt [0-9]+ $head " "$CI_HISTORY"; then
      escalate_issue "$n" "review returned a commit already submitted for CI ($head)"
      return
    fi
    if ! publish_feature; then
      escalate_issue "$n" "could not publish reviewed commit $head"
      return
    fi
    echo "Attempt $attempt $head $pr" >>"$CI_HISTORY"
    set_status waiting-ci "$pr $head"
    if py "$LOOP_DIR/feature_ci.py" "$pr" "$head" "$REQUIRED_CHECKS" "$POLL_SECONDS" "$FEATURE_CI_TIMEOUT_SECONDS" >"$handoff/ci"; then
      cat "$handoff/ci" >>"$CI_HISTORY"
      echo >>"$PR_BODY"
      cat "$handoff/ci" >>"$PR_BODY"
      if gh pr edit "$pr" --body-file "$PR_BODY" && checks_green "$pr" &&
          post_metrics "$n" "$pr" && merge_pr "$pr" "$wt" --match-head-commit "$head"; then
        gh issue edit "$n" --remove-label loop:in-progress >/dev/null || true
        log "merged #$n: $pr"
        set_status done "merged $pr"
      else
        escalate_issue "$n" "could not finalize green reviewed commit $head on $pr"
      fi
      return
    else
      ci_status=$?
    fi
    if [ "$ci_status" != 2 ]; then
      escalate_issue "$n" "could not verify CI for reviewed commit $head on $pr"
      return
    fi
    cat "$handoff/ci" >>"$CI_HISTORY"
    attempt=$((attempt + 1))
  done
  escalate_issue "$n" "feature CI attempt limit ($MAX_ATTEMPTS) reached"
)

cmd_work() {
  declare -A running=()
  local st n next_provider=claude provider
  while :; do
    git -C "$REPO_ROOT" fetch -q origin
    for n in "${!running[@]}"; do
      if ! kill -0 "${running[$n]}" 2>/dev/null; then wait "${running[$n]}" || true; unset "running[$n]"; fi
    done
    st="$(py "$LOOP_DIR/issues.py" status)"
    replan="$(py -c 'import json,sys; print(json.loads(sys.argv[1])["loop:replan"])' "$st")"
    if [ "$replan" -gt 0 ]; then
      if [ "${#running[@]}" -eq 0 ]; then plan_cycle replan.md replan || return 1; fi
    else
      while [ "${#running[@]}" -lt "$PARALLELISM" ] && ! limited_now; do
        n="$(py "$LOOP_DIR/issues.py" ready "${!running[@]}" | head -n1)"
        [ -n "$n" ] || break
        gh issue edit "$n" --add-label loop:in-progress >/dev/null
        provider=$work_provider
        if [ "$provider" = mixed ]; then
          provider=$next_provider
          if [ "$provider" = claude ]; then next_provider=codex; else next_provider=claude; fi
        fi
        run_issue "$n" "$provider" &
        running[$n]=$!
      done
    fi
    if [ "${#running[@]}" -eq 0 ] && [ "$replan" -eq 0 ]; then
      if [ "$(py -c 'import json,sys; print(json.loads(sys.argv[1])["open"])' "$st")" -eq 0 ]; then
        log "all loop issues are closed"
        remove_worktree "$WT_DIR/plan"
        return 0
      fi
      log "nothing runnable; waiting for a human (status: $st)"; return 2
    fi
    sleep "$POLL_SECONDS"
  done
}

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 0; fi

# 起動と終わり方を記録する。シグナルでも EXIT の trap が走るよう、終了コードに直して抜ける
py "$LOOP_DIR/loop_status.py" start "$STATE_DIR" "$$" "$*" "${LOOP_RUN_LOG:-}" "$REPO_ROOT" || true
trap 'rc=$?; py "$LOOP_DIR/loop_status.py" finish "$STATE_DIR" "$rc" || true' EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
trap 'exit 129' HUP

case "${1:-}" in
  bootstrap) cmd_bootstrap ;;
  plan) cmd_plan ;;
  work) work_provider=${2:-claude}; case "$work_provider" in claude|codex|mixed) cmd_work ;; *) exit 64 ;; esac ;;
  all) work_provider=claude; cmd_bootstrap && cmd_plan && cmd_work ;;
  *) sed -n '2,9p' "$0" >&2; exit 64 ;;
esac

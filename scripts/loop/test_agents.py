import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

HERE = Path(__file__).resolve().parent
# テストから本物の Orca の画面を触らない
os.environ["LOOP_ORCA"] = "0"


class AgentContracts(unittest.TestCase):
    def invoke(self, script, *args, data=None, **env):
        return subprocess.run([sys.executable, "-I", HERE / script, *args],
                              input=json.dumps(data), capture_output=True, text=True,
                              env={**os.environ, **env})

    def test_both_agents_report_final_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "events"
            event = {"type": "result", "result": "RESULT: clean"}
            log.write_text(json.dumps(event))
            self.assertEqual(self.invoke("claude_log.py", "result", log).stdout.strip(), "RESULT: clean")
            events = [{"type": "thread.started", "thread_id": "abc"}, {"type": "turn.started"},
                      {"type": "item.completed", "item": {"type": "agent_message", "text": "RESULT: clean"}},
                      {"type": "turn.completed", "usage": {"input_tokens": 7}}]
            log.write_text("\n".join(map(json.dumps, events)))
            result = self.invoke("codex_agent.py", "normalize", log, "0", "1")
            self.assertEqual(result.returncode, 0, result.stderr)
            log.write_text(result.stdout)
            self.assertEqual(self.invoke("claude_log.py", "result", log).stdout.strip(), "RESULT: clean")

    def test_codex_denies_whole_patch_if_move_destination_is_protected(self):
        data = {"tool_name": "apply_patch", "cwd": str(HERE.parents[1]), "tool_input": {
            "command": "*** Begin Patch\n*** Add File: ok\n+x\n*** Update File: a\n*** Move to: AGENTS.md\n@@\n-a\n+b\n*** End Patch"}}
        result = self.invoke("guard-hook.py", data=data, LOOP_AGENT="codex")
        self.assertEqual(json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_codex_patch_can_use_its_own_handoff_and_scratch(self):
        with tempfile.TemporaryDirectory() as directory:
            tmp = Path(directory)
            repo = self.git_repo(tmp / "repo")
            for path, allowed in [("state/tmp/scratch/draft", True), ("handoff/review", True),
                                  ("state/tmp/another-run/draft", False)]:
                data = {"tool_name": "apply_patch", "cwd": str(repo), "tool_input": {
                    "command": f"*** Begin Patch\n*** Add File: {tmp / path}\n+x\n*** End Patch"}}
                result = self.invoke("guard-hook.py", data=data, LOOP_AGENT="codex", LOOP_WT_DIR=str(tmp / "state"),
                                     LOOP_HANDOFF=str(tmp / "handoff"), TMPDIR=str(tmp / "state/tmp/scratch"))
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(not result.stdout, allowed, result.stdout)

    def test_hook_hides_canaries_from_bootstrap(self):
        # カナリアを隠すのは hook の事前の阻止だけ。bootstrap ではカナリアに触れる操作を止め、それ以外は通す
        with tempfile.TemporaryDirectory() as tmp:
            for agent in ("claude", "codex"):
                env = dict(LOOP_AGENT=agent, LOOP_MODE="bootstrap", LOOP_CANARY_DIR=tmp)
                for command, denied in [("git status", False), ("gh pr list --label loop:canary", True),
                                        (f"cat {tmp}/spec.md", True)]:
                    result = self.invoke("guard-hook.py", data={"tool_name": "Bash", "tool_input": {"command": command}}, **env)
                    decision = json.loads(result.stdout or "{}").get("hookSpecificOutput", {}).get("permissionDecision")
                    self.assertEqual(decision == "deny" or result.returncode == 2, denied, (agent, command, result.stdout, result.stderr))

    def test_partial_and_unknown_logs_cannot_report_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "raw"
            events = [{"type": "thread.started", "thread_id": "abc"},
                      {"type": "item.completed", "item": {"type": "agent_message", "text": "RESULT: fixed"}}]
            for last, code in [({"type": "unexpected"}, 0), ({"type": "turn.completed", "usage": {}}, 137)]:
                log.write_text("\n".join(map(json.dumps, [*events, last])))
                rows = self.invoke("codex_agent.py", "normalize", log, str(code), "1").stdout.splitlines()
                self.assertFalse(json.loads(rows[-1])["result"])
                self.assertTrue(json.loads(rows[-1])["is_error"])

    def test_time_limit_terminates_agent(self):
        with tempfile.TemporaryDirectory() as tmp:
            binary = Path(tmp) / "codex"
            binary.write_text("#!/bin/sh\nexec sleep 20\n")
            binary.chmod(0o755)
            result = subprocess.run(["bash", "-c", 'source "$1"; run_agent plan.md "$2" timed 30 normal; result_of "$LAST_LOG"',
                                     "test", HERE / "run.sh", tmp], capture_output=True, text=True, timeout=5,
                                    env={**os.environ, "LOOP_AGENT": "codex", "CODEX_MODEL": "mock",
                                         "CODEX_MAX_SECONDS": "1", "STATE_DIR": tmp,
                                         "PATH": tmp + os.pathsep + os.environ["PATH"]})
            self.assertEqual(result.stdout.strip(), "RESULT: none (error_max_time)", result.stderr)

    def test_stopping_the_loop_also_terminates_codex(self):
        with tempfile.TemporaryDirectory() as tmp:
            binary = Path(tmp) / "codex"
            ready = Path(tmp) / "agent.pid"
            binary.write_text('#!/bin/sh\necho "$$" >"$PROBE_PID"\nexec sleep 20\n')
            binary.chmod(0o755)
            proc = subprocess.Popen(["bash", "-c", 'source "$1"; run_agent plan.md "$2" interrupted 30 normal',
                                     "test", HERE / "run.sh", tmp], start_new_session=True,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                    env={**os.environ, "LOOP_AGENT": "codex", "CODEX_MODEL": "mock",
                                         "CODEX_MAX_SECONDS": "20", "STATE_DIR": tmp, "PROBE_PID": str(ready),
                                         "PATH": tmp + os.pathsep + os.environ["PATH"]})
            agent = None
            try:
                deadline = time.monotonic() + 3
                while (not ready.exists() or not ready.read_text().strip()) and time.monotonic() < deadline:
                    time.sleep(0.02)
                agent = int(ready.read_text())
                os.killpg(proc.pid, signal.SIGTERM)
                proc.wait(timeout=3)
                state = Path(f"/proc/{agent}/status")
                deadline = time.monotonic() + 1
                while state.exists() and "\nState:\tZ" not in state.read_text() and time.monotonic() < deadline:
                    time.sleep(0.02)
                self.assertTrue(not state.exists() or "\nState:\tZ" in state.read_text(), "Codex survived loop stop")
            finally:
                if proc.poll() is None:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait()
                if agent:
                    try:
                        os.kill(agent, signal.SIGKILL)
                    except ProcessLookupError:
                        pass

    def test_default_claude_launch_and_metrics(self):
        with tempfile.TemporaryDirectory() as tmp:
            binary = Path(tmp) / "claude"
            binary.write_text("#!/bin/sh\n" + """case "$*" in
                *--max-budget-usd*--settings*--output-format*stream-json*) ;;
                *) exit 1 ;;
            esac
            echo '{"type":"result","result":"RESULT: planned","total_cost_usd":1.25}'
            """)
            binary.chmod(0o755)
            env = {**os.environ, "STATE_DIR": tmp, "PATH": tmp + os.pathsep + os.environ["PATH"]}
            env.pop("LOOP_AGENT", None)
            result = subprocess.run(["bash", "-c", 'source "$1"; run_agent plan.md "$2" planner 30 normal; result_of "$LAST_LOG"; record_metrics 1 "$LAST_LOG" planner',
                                     "test", HERE / "run.sh", tmp], capture_output=True, text=True, env=env)
            self.assertEqual(result.stdout.strip(), "RESULT: planned", result.stderr)
            metrics = json.loads((Path(tmp) / "metrics/1.jsonl").read_text())
            self.assertEqual((metrics["agent"], metrics["api_equivalent_cost_usd"]), ("claude", 1.25))
            self.assertEqual((metrics["model"], metrics["reasoning_effort"]), ("claude-opus-5-5", "high"))

    def run_codex_worker(self, tmp, script, **overrides):
        main = self.git_repo(tmp / "repo")
        repo = tmp / "work"
        subprocess.run(["git", "-C", main, "worktree", "add", "-q", "--detach", repo], check=True)
        handoff = tmp / "handoff"
        handoff.mkdir()
        binary = tmp / "codex"
        binary.write_text("""#!/usr/bin/env python3
import json, os, sys
from pathlib import Path

args = sys.argv[1:]
if "app-server" in args:
    command = next(a for a in args if a.startswith("hooks.PreToolUse="))
    command = json.JSONDecoder().raw_decode(command.split("command=", 1)[1])[0]
    for line in sys.stdin:
        request = json.loads(line)
        hook = dict(source="sessionFlags", enabled=True, eventName="preToolUse", command=command,
                    key="guard", currentHash="hash",
                    trustStatus="trusted" if any(a.startswith("hooks.state=") for a in args) else "untrusted")
        print(json.dumps(dict(id=request["id"], result={"data": [{"errors": [], "hooks": [hook]}]})), flush=True)
    sys.exit()

def emit(kind, **fields):
    print(json.dumps(dict(type=kind, **fields)), flush=True)
""" + script)
        binary.chmod(0o755)
        sleep = tmp / "sleep"
        sleep.write_text("#!/bin/sh\nexit 0\n")
        sleep.chmod(0o755)
        date = tmp / "date"
        date.write_text("""#!/bin/sh
if [ "$1" = +%s ]; then
    if [ -e "$PROBE_DIR/reset-clock" ]; then echo 1700000120
    else touch "$PROBE_DIR/reset-clock"; echo 1700000000
    fi
else
    exec /bin/date "$@"
fi
""")
        date.chmod(0o755)
        env = {**os.environ, "LOOP_AGENT": "claude", "STATE_DIR": str(tmp / "state"),
               "PATH": str(tmp) + os.pathsep + os.environ["PATH"], "PROBE_DIR": str(tmp),
               "PR_BODY": str(handoff / "pr.md"), "CODEX_MAX_SECONDS": "10", "PROBE_ROLE": "implementation",
               "CODEX_IMPLEMENTATION_MODEL": "gpt-6.2-sol", **overrides}
        return subprocess.run(["bash", "-c", '''
source "$1"
worker_provider=codex
handoff=$(dirname "$PR_BODY")
export STATUS_KEY=issue-7
if [ "$PROBE_ROLE" = review ]; then
    printf '%s\\n' "$PROBE_SCOPE" >"$handoff/review-scope"
    export REVIEW_REPORT="$handoff/review-1.md"
    run_worker review review.md "$2" review-7-a1-r1 7
else
    run_worker implementation implement.md "$2" issue-7-a1 7
fi
printf '%s\\n' "$WORK_RESULT" "$LAST_LOG"
''', "test", HERE / "run.sh", repo], capture_output=True, text=True, env=env, timeout=8)

    def test_codex_worker_resumes_and_records_one_run(self):
        with tempfile.TemporaryDirectory() as directory:
            tmp = Path(directory)
            result = self.run_codex_worker(tmp, """
root = Path(os.environ["PROBE_DIR"])
scratch = Path(os.environ["TMPDIR"])
assert scratch.parent == root / "state/tmp"
assert os.environ["LOOP_AGENT"] == "codex"
assert 'approval_policy="never"' in args
assert 'sandbox_mode="workspace-write"' in args
assert 'sandbox_workspace_write.network_access=true' in args
roots = json.loads(next(a.split("=", 1)[1] for a in args if a.startswith("sandbox_workspace_write.writable_roots=")))
assert set(map(Path, roots)) == {root / "repo/.git", root / "repo/.git/worktrees/work", root / "handoff", scratch}
status = json.loads((root / "state/status/issue-7.json").read_text())
assert status["step"] == "agent" and "gpt-6.2-sol, effort medium" in status["detail"]
emit("thread.started", thread_id="test-session")
if "resume" not in args:
    (root / "scratch-path").write_text(str(scratch))
    emit("turn.failed", error={"message": "usage limit reached|1700000001"})
    sys.exit(1)
assert "test-session" in args
assert str(scratch) == (root / "scratch-path").read_text()
assert (root / "reset-clock").exists()
if not (scratch / "resumed").exists():
    (scratch / "resumed").touch()
    emit("turn.failed", error={"message": "stream disconnected before completion"})
    sys.exit(1)
Path(os.environ["PR_BODY"]).write_text("draft")
emit("item.completed", item={"type": "agent_message", "text": "RESULT: ready-for-review"})
emit("turn.completed", usage={"input_tokens": 7, "cached_input_tokens": 3, "output_tokens": 2})
""")
            self.assertEqual(result.returncode, 0, result.stderr)
            outcome, path = result.stdout.splitlines()
            self.assertEqual(outcome, "RESULT: ready-for-review", result.stderr)
            log = Path(path)
            meta = json.loads(log.read_text().splitlines()[0])
            self.assertEqual(meta, {"type": "loop_meta", "agent": "codex", "model": "gpt-6.2-sol",
                                    "reasoning_effort": "medium"})
            self.assertTrue(log.with_suffix(".done").exists())
            self.assertFalse(Path((tmp / "scratch-path").read_text()).exists())
            self.assertEqual((tmp / "handoff/pr.md").read_text(), "draft")
            metrics = json.loads((tmp / "state/metrics/7.jsonl").read_text())
            self.assertIn("usage limit reached; waiting", result.stderr)
            self.assertIn("temporary API error; retrying", result.stderr)
            self.assertEqual((metrics["resumes"], metrics["exit_code"], metrics["usage"]["input_tokens"]), (2, 0, 7))

    def test_codex_worker_times_out_and_finishes_the_tab(self):
        with tempfile.TemporaryDirectory() as directory:
            tmp = Path(directory)
            result = self.run_codex_worker(tmp, "os.execv('/bin/sleep', ['sleep', '20'])\n", CODEX_MAX_SECONDS="1")
            self.assertEqual(result.returncode, 0, result.stderr)
            outcome, path = result.stdout.splitlines()
            self.assertIn("error_max_time", outcome)
            self.assertTrue(Path(path).with_suffix(".done").exists())
            self.assertEqual(list((tmp / "state/tmp").iterdir()), [])

    def test_codex_worker_uses_the_review_handoff_and_model(self):
        for scope, effort in (("medium", "medium"), ("invalid", "high")):
            with self.subTest(scope=scope), tempfile.TemporaryDirectory() as directory:
                tmp = Path(directory)
                result = self.run_codex_worker(tmp, """
assert args[args.index("--model") + 1] == "review-model"
assert f'model_reasoning_effort="{os.environ["PROBE_EFFORT"]}"' in args
report = Path(os.environ["REVIEW_REPORT"])
assert str(report) in args[-1]
report.write_text("clean")
emit("thread.started", thread_id="review-session")
emit("item.completed", item={"type": "agent_message", "text": "RESULT: clean"})
emit("turn.completed", usage={"input_tokens": 7, "cached_input_tokens": 3, "output_tokens": 2})
""", PROBE_ROLE="review", PROBE_SCOPE=scope, PROBE_EFFORT=effort, CODEX_REVIEW_MODEL="review-model")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.splitlines()[0], "RESULT: clean", result.stderr)
                self.assertEqual((tmp / "handoff/review-1.md").read_text(), "clean")
                row = json.loads((tmp / "state/metrics/7.jsonl").read_text())
                self.assertEqual((row["role"], row["model"], row["reasoning_effort"]), ("review", "review-model", effort))


    def run_bootstrap_stage(self, tmp, commit_each_session, fail_sessions, stale_head_reads=0):
        """スタブの claude と gh で bootstrap の green 段階を動かす。CI はセッション番号が fail_sessions に入る間だけ落ちる。
        PR の head は、最初の stale_head_reads 回だけ push 前のコミットを返す(GitHub の反映の遅れ)"""
        tmp = Path(tmp)
        wt = tmp / "wt"
        subprocess.run(["git", "init", "-q", wt], check=True)
        git = ["git", "-C", str(wt), "-c", "user.name=t", "-c", "user.email=t@example.com"]
        subprocess.run([*git, "commit", "-q", "--allow-empty", "-m", "base"], check=True)
        (tmp / "claude").write_text("#!/bin/sh\n" + f"""
            n=$(( $(cat "{tmp}/sessions" 2>/dev/null || echo 0) + 1 )); echo $n >"{tmp}/sessions"
            for a in "$@"; do last=$a; done
            printf '%s' "$last" >"{tmp}/prompt-$n"
            {"git -c user.name=t -c user.email=t@example.com commit -q --allow-empty -m s$n" if commit_each_session else ":"}
            echo '{{"type":"result","result":"RESULT: pushed https://example.com/pr/2","total_cost_usd":0.1}}'
            """)
        (tmp / "gh").write_text(f"""#!/usr/bin/env python3
import json, os, subprocess, sys
args = sys.argv[1:]
open("{tmp}/gh-calls", "a").write(" ".join(args) + "\\n")
head = subprocess.check_output(["git", "-C", "{wt}", "rev-parse", "HEAD"], text=True).strip()
session = int(open("{tmp}/sessions").read())
if args[:2] == ["pr", "view"] and "headRefOid,statusCheckRollup" in args:
    conclusion = "FAILURE" if session in {sorted(fail_sessions)!r} else "SUCCESS"
    jobs = [{{"name": n, "status": "COMPLETED", "conclusion": conclusion if n == "guard" else "SUCCESS",
              "detailsUrl": "https://example.com/actions/runs/7/job/" + n}} for n in "{'backend frontend e2e mutation visual ac-coverage guard'}".split()]
    print(json.dumps({{"headRefOid": head, "statusCheckRollup": jobs}}))
elif args[:2] == ["pr", "view"]:
    reads = int(open("{tmp}/head-reads").read()) if os.path.exists("{tmp}/head-reads") else 0
    open("{tmp}/head-reads", "w").write(str(reads + 1))
    if reads < {stale_head_reads}:
        head = subprocess.check_output(["git", "-C", "{wt}", "rev-parse", "HEAD~1"], text=True).strip()
    print(head)
elif args[:1] == ["api"]:
    print("[]")
""")
        (tmp / "orca").write_text(f"#!/bin/sh\nprintf '%s\\n' \"$*\" >>{tmp}/orca-calls\n"
                                  "case \"$1 $2\" in \"terminal create\") echo '{\"result\":{\"terminal\":{\"handle\":\"term_x\"}}}' ;; esac\n")
        for f in ("claude", "gh", "orca"):
            (tmp / f).chmod(0o755)
        env = {**os.environ, "STATE_DIR": str(tmp / "state"), "PATH": str(tmp) + os.pathsep + os.environ["PATH"],
               "BOOT_PR_HEAD_POLL_SECONDS": "0", "LOOP_ORCA": "1", "LOOP_ORCA_BIN": str(tmp / "orca")}
        env.pop("LOOP_AGENT", None)
        script = ('source "$1"; export WORKTREE="$2" ROUND=1 MAX_ROUNDS=4 BOOT_CI_HISTORY="$3/history"; touch "$BOOT_CI_HISTORY"; '
                  'rc=0; bootstrap_stage 1 finish finish green || rc=$?; echo "rc=$rc pr=$BOOT_PR"')
        result = subprocess.run(["bash", "-c", script, "test", HERE / "run.sh", wt, tmp],
                                capture_output=True, text=True, env=env, timeout=60)
        return result, tmp

    def test_bootstrap_stage_waits_for_ci_and_reports_failures_to_a_new_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, tmp = self.run_bootstrap_stage(tmp, commit_each_session=True, fail_sessions={1})
            self.assertEqual(result.stdout.strip(), "rc=0 pr=https://example.com/pr/2", result.stderr)
            self.assertEqual((tmp / "sessions").read_text().strip(), "2")
            self.assertNotIn("--resume", (tmp / "prompt-2").read_text())
            second = (tmp / "prompt-2").read_text()
            self.assertIn("The required checks failed on your last push", second)
            self.assertIn("guard FAILURE https://example.com/actions/runs/7/job/guard", second)
            self.assertNotIn("required checks failed", (tmp / "prompt-1").read_text())
            # bootstrap は BOOTSTRAP_EFFORT で動かすので、その推論量が metrics に残る
            rows = [json.loads(l) for l in (tmp / "state/metrics/1.jsonl").read_text().splitlines()]
            self.assertEqual({r["reasoning_effort"] for r in rows}, {"medium"})
            # 状態は status に残り、エージェントごとに Orca のタブが開き、終わった印が付く
            main = json.loads((tmp / "state/status/main.json").read_text())
            self.assertEqual((main["step"], main["detail"].split()[0]), ("waiting-ci", "https://example.com/pr/2"))
            creates = [c for c in (tmp / "orca-calls").read_text().splitlines() if c.startswith("terminal create")]
            self.assertEqual(len(creates), 2)
            self.assertIn("--title bootstrap-finish-r1", creates[0])
            # 2回目のセッションは、同じ worktree の前回のタブを閉じてから開く
            self.assertIn("terminal close --terminal term_x --tab", (tmp / "orca-calls").read_text())
            for c in creates:
                self.assertTrue(Path(c.split(" follow ")[1].split(" --json")[0] + ".done").exists(), c)

    def test_bootstrap_stage_escalates_when_a_session_pushes_nothing_after_a_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, tmp = self.run_bootstrap_stage(tmp, commit_each_session=False, fail_sessions={1, 2, 3})
            self.assertEqual(result.stdout.strip(), "rc=1 pr=https://example.com/pr/2", result.stderr)
            self.assertEqual((tmp / "sessions").read_text().strip(), "2")
            self.assertIn("issue edit 1 --add-label loop:escalated", (tmp / "gh-calls").read_text())
            main = json.loads((tmp / "state/status/main.json").read_text())
            self.assertEqual(main["step"], "escalated")
            self.assertIn("pushed nothing new", main["detail"])


    def test_bootstrap_stage_waits_for_the_pr_head_to_catch_up_after_a_push(self):
        # push 直後は GitHub の PR の head がまだ前のコミットを指すことがある。追いつくまで待ち、セッションを増やさない
        with tempfile.TemporaryDirectory() as tmp:
            result, tmp = self.run_bootstrap_stage(tmp, commit_each_session=True, fail_sessions=set(), stale_head_reads=3)
            self.assertEqual(result.stdout.strip(), "rc=0 pr=https://example.com/pr/2", result.stderr)
            self.assertEqual((tmp / "sessions").read_text().strip(), "1")

    def git_repo(self, path):
        subprocess.run(["git", "init", "-q", path], check=True)
        subprocess.run(["git", "-C", path, "-c", "user.name=t", "-c", "user.email=t@example.com",
                        "commit", "-q", "--allow-empty", "-m", "base"], check=True)
        return Path(path)

    def test_run_agent_removes_its_temporary_files_and_the_worktrees_it_left(self):
        # エージェントの一時ディレクトリ(scratchpad を含む)と、その中に作った worktree を実行後に残さない
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            repo = self.git_repo(tmp / "repo")
            (tmp / "claude").write_text(f"""#!/bin/sh
echo "$TMPDIR" >"{tmp}/agent-tmpdir"
touch "$TMPDIR/scratch.txt"
git worktree add -q --detach "$TMPDIR/sim" >/dev/null 2>&1
echo '{{"type":"result","result":"RESULT: done","total_cost_usd":0.1}}'
""")
            (tmp / "claude").chmod(0o755)
            env = {**os.environ, "STATE_DIR": str(tmp / "state"), "PATH": str(tmp) + os.pathsep + os.environ["PATH"]}
            env.pop("LOOP_AGENT", None)
            result = subprocess.run(["bash", "-c", 'source "$1"; run_agent plan.md "$2" planner 30 normal; result_of "$LAST_LOG"',
                                     "test", HERE / "run.sh", repo], capture_output=True, text=True, env=env, timeout=60)
            self.assertEqual(result.stdout.strip(), "RESULT: done", result.stderr)
            agent_tmp = Path((tmp / "agent-tmpdir").read_text().strip())
            self.assertTrue(str(agent_tmp).startswith(str(tmp / "state")), agent_tmp)
            self.assertFalse(agent_tmp.exists())
            worktrees = subprocess.run(["git", "-C", repo, "worktree", "list"], capture_output=True, text=True).stdout
            self.assertEqual(len(worktrees.splitlines()), 1, worktrees)

    def test_remove_worktree_also_deletes_files_it_cannot_remove_directly(self):
        # 開発用コンテナが root で作ったファイルは、コンテナの中で持ち主を戻してから消す
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            repo = self.git_repo(tmp / "repo")
            wt = tmp / "wt"
            subprocess.run(["git", "-C", repo, "worktree", "add", "-q", "--detach", wt], check=True)
            locked = wt / "vendor"
            locked.mkdir()
            (locked / "pkg").write_text("x")
            locked.chmod(0o555)
            self.addCleanup(lambda: locked.exists() and locked.chmod(0o755))
            (tmp / "docker").write_text(f"""#!/bin/sh
printf '%s\\n' "$*" >>"{tmp}/docker-calls"
case "$1" in
  run) for a in "$@"; do case "$a" in *:/w) chmod -R u+rwX "${{a%:/w}}" ;; esac; done ;;
esac
""")
            (tmp / "docker").chmod(0o755)
            env = {**os.environ, "STATE_DIR": str(tmp / "state"), "PATH": str(tmp) + os.pathsep + os.environ["PATH"]}
            env.pop("LOOP_AGENT", None)
            result = subprocess.run(["bash", "-c", 'source "$1"; remove_worktree "$2" "$3"', "test", HERE / "run.sh", wt, repo],
                                    capture_output=True, text=True, env=env, timeout=60)
            self.assertFalse(wt.exists(), result.stderr)
            self.assertIn("run --rm -v", (tmp / "docker-calls").read_text())
            worktrees = subprocess.run(["git", "-C", repo, "worktree", "list"], capture_output=True, text=True).stdout
            self.assertEqual(len(worktrees.splitlines()), 1, worktrees)

    def land(self, tmp, main_change=None, ci="SUCCESS", whole_issue=False):
        """CI を通った issue のブランチをマージする段階(land_feature)を、手元の origin とスタブの gh で動かす。
        main_change: ブランチを作った後に main に入る変更(ファイル名, 中身)。None なら main は進まない。
        whole_issue: 実装とレビューをスタブにして、run_issue を push の前から動かす"""
        tmp = Path(tmp)
        g = ["-c", "user.name=t", "-c", "user.email=t@example.com"]
        origin, seed = tmp / "origin.git", tmp / "seed"
        wt = tmp / "state/worktrees/7-feature" if whole_issue else tmp / "wt"
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", origin], check=True)
        subprocess.run(["git", "clone", "-q", origin, seed], check=True, capture_output=True)
        (seed / "shared.md").write_text("base\n")
        subprocess.run(["git", "-C", seed, *g, "add", "-A"], check=True)
        subprocess.run(["git", "-C", seed, *g, "commit", "-q", "-m", "base"], check=True)
        subprocess.run(["git", "-C", seed, "push", "-q", "origin", "HEAD:main"], check=True)
        subprocess.run(["git", "-C", seed, "worktree", "add", "-q", "-b", "7-feature", wt], check=True)
        (wt / "feature.md").write_text("feature\n")
        (wt / "shared.md").write_text("feature edit\n")
        subprocess.run(["git", "-C", wt, *g, "commit", "-q", "-am", "feature", "--allow-empty"], check=True)
        subprocess.run(["git", "-C", wt, *g, "add", "-A"], check=True)
        subprocess.run(["git", "-C", wt, *g, "commit", "-q", "-m", "feature files"], check=True)
        subprocess.run(["git", "-C", wt, "push", "-q", "origin", "7-feature"], check=True)
        if main_change:
            other = tmp / "other"
            subprocess.run(["git", "clone", "-q", origin, other], check=True, capture_output=True)
            (other / main_change[0]).write_text(main_change[1])
            subprocess.run(["git", "-C", other, *g, "add", "-A"], check=True)
            subprocess.run(["git", "-C", other, *g, "commit", "-q", "-m", "other issue"], check=True)
            subprocess.run(["git", "-C", other, "push", "-q", "origin", "HEAD:main"], check=True)
        (tmp / "gh").write_text(f"""#!/usr/bin/env python3
import json, subprocess, sys
args = sys.argv[1:]
open("{tmp}/gh-calls", "a").write(" ".join(args) + "\\n")
if args[:2] == ["issue", "view"]:
    print(json.dumps({{"title": "feature"}}))
elif args[:2] == ["pr", "view"]:
    head = subprocess.check_output(["git", "-C", "{origin}", "rev-parse", "refs/heads/7-feature"], text=True).strip()
    jobs = [{{"name": n, "status": "COMPLETED", "conclusion": "{ci}" if n == "e2e" else "SUCCESS",
              "detailsUrl": "https://example.com/actions/runs/9/job/" + n}} for n in "{'backend frontend e2e mutation visual ac-coverage guard'}".split()]
    print(json.dumps({{"headRefOid": head, "statusCheckRollup": jobs}}))
elif args[:1] == ["api"]:
    print("[]")
""")
        (tmp / "gh").chmod(0o755)
        env = {**os.environ, "STATE_DIR": str(tmp / "state"), "PATH": str(tmp) + os.pathsep + os.environ["PATH"],
               "POLL_SECONDS": "0"}
        env.pop("LOOP_AGENT", None)
        (tmp / "pr.md").write_text("Closes #7\n")
        script = ('source "$1"; n=7 pr=https://example.com/pr/8 wt="$2" branch=7-feature handoff="$3"; '
                  'head="$(git -C "$wt" rev-parse HEAD)"; PR_BODY="$3/pr.md" CI_HISTORY="$3/history"; touch "$CI_HISTORY"; '
                  'REPO_ROOT="$4"; rc=0; land_feature || rc=$?; echo "rc=$rc"')
        if whole_issue:
            script = ('source "$1"; REPO_ROOT="$4"; TESTDIR="$3"; '
                      'run_worker() { WORK_RESULT="RESULT: ready-for-review"; echo "Closes #7" >"$PR_BODY"; }; '
                      'review_branch() { return 0; }; '
                      'publish_feature() { git -C "$wt" push -q origin "$head:refs/heads/$branch"; pr=https://example.com/pr/8; '
                      'echo "$head" >>"$TESTDIR/published"; }; '
                      'rc=0; run_issue 7 claude || rc=$?; cp "$STATE_DIR/issue-7-ci-history" "$TESTDIR/history"; echo "rc=$rc"')
        result = subprocess.run(["bash", "-c", script, "test", HERE / "run.sh", wt, tmp, seed],
                                capture_output=True, text=True, env=env, timeout=120)
        calls = (tmp / "gh-calls").read_text() if (tmp / "gh-calls").exists() else ""
        return result, calls, origin, wt, tmp

    def test_land_merges_directly_when_main_has_not_moved(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, calls, origin, wt, tmp = self.land(tmp)
            self.assertEqual(result.stdout.strip().splitlines()[-1], "rc=0", result.stderr)
            self.assertIn("pr merge https://example.com/pr/8 --squash --match-head-commit", calls)
            self.assertFalse(wt.exists())

    def test_land_merges_main_into_the_branch_and_reruns_ci_before_merging(self):
        # strict なブランチ保護では、先に進んだ main を取り込まないとマージできない
        with tempfile.TemporaryDirectory() as tmp:
            result, calls, origin, wt, tmp = self.land(tmp, main_change=("other.md", "other\n"))
            self.assertEqual(result.stdout.strip().splitlines()[-1], "rc=0", result.stderr)
            # マージしたのは、main の変更を取り込んで push し直したコミット(ブランチはマージ後に消える)
            merged_head = calls.split("--match-head-commit ")[1].split()[0]
            history = subprocess.run(["git", "-C", origin, "log", "--format=%s", merged_head],
                                     capture_output=True, text=True).stdout
            self.assertIn("other issue", history)
            self.assertIn("feature files", history)
            self.assertEqual(calls.count("pr merge"), 1)
            self.assertIn("merged main", (tmp / "history").read_text())

    def test_land_sends_a_conflict_back_to_the_implementation(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, calls, origin, wt, tmp = self.land(tmp, main_change=("shared.md", "other edit\n"))
            self.assertEqual(result.stdout.strip().splitlines()[-1], "rc=2", result.stderr)
            self.assertNotIn("pr merge", calls)
            history = (tmp / "history").read_text()
            self.assertIn("conflicted in: shared.md", history)
            self.assertEqual(subprocess.run(["git", "-C", wt, "status", "--porcelain"], capture_output=True,
                                            text=True).stdout, "")

    def test_land_sends_a_ci_failure_after_merging_main_back_to_the_implementation(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, calls, origin, wt, tmp = self.land(tmp, main_change=("other.md", "other\n"), ci="FAILURE")
            self.assertEqual(result.stdout.strip().splitlines()[-1], "rc=2", result.stderr)
            self.assertNotIn("pr merge", calls)
            self.assertIn("e2e FAILURE", (tmp / "history").read_text())

    def test_issue_merges_main_before_pushing_so_ci_runs_once(self):
        # 実装中に main が進んでいたら、push の前に取り込む。最初の CI から最新の main で確かめ、CI を2回回さない
        with tempfile.TemporaryDirectory() as tmp:
            result, calls, origin, wt, tmp = self.land(tmp, main_change=("other.md", "other\n"), whole_issue=True)
            self.assertEqual(result.stdout.strip().splitlines()[-1], "rc=0", result.stderr)
            published = (tmp / "published").read_text().split()
            self.assertEqual(len(published), 1)
            history = subprocess.run(["git", "-C", origin, "log", "--format=%s", published[0]],
                                     capture_output=True, text=True).stdout
            self.assertIn("other issue", history)
            self.assertNotIn("Update ", (tmp / "history").read_text())
            self.assertEqual(calls.count("pr merge"), 1)

if __name__ == "__main__":
    unittest.main()

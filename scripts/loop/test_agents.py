import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent


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


    def run_bootstrap_stage(self, tmp, commit_each_session, fail_sessions):
        """スタブの claude と gh で bootstrap の green 段階を動かす。CI はセッション番号が fail_sessions に入る間だけ落ちる"""
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
import json, subprocess, sys
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
    print(head)
elif args[:1] == ["api"]:
    print("[]")
""")
        for f in ("claude", "gh"):
            (tmp / f).chmod(0o755)
        env = {**os.environ, "STATE_DIR": str(tmp / "state"), "PATH": str(tmp) + os.pathsep + os.environ["PATH"]}
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

    def test_bootstrap_stage_escalates_when_a_session_pushes_nothing_after_a_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, tmp = self.run_bootstrap_stage(tmp, commit_each_session=False, fail_sessions={1, 2, 3})
            self.assertEqual(result.stdout.strip(), "rc=1 pr=https://example.com/pr/2", result.stderr)
            self.assertEqual((tmp / "sessions").read_text().strip(), "2")
            self.assertIn("issue edit 1 --add-label loop:escalated", (tmp / "gh-calls").read_text())


if __name__ == "__main__":
    unittest.main()

import json
import os
from pathlib import Path
from select import select
import subprocess
import sys
import tempfile
import time
import unittest

HERE = Path(__file__).resolve().parent
# テストから本物の Orca の画面を触らない
os.environ["LOOP_ORCA"] = "0"


class LoopStatus(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name)
        self.calls = self.state / "orca-calls"
        (self.state / "bin").mkdir()
        stub = self.state / "bin" / "orca"
        stub.write_text(f"""#!/bin/sh
printf '%s\\n' "$*" >>"{self.calls}"
case "$1 $2" in
  "terminal create") echo '{{"ok":true,"result":{{"terminal":{{"handle":"term_new"}}}}}}' ;;
esac
""")
        stub.chmod(0o755)
        self.env = {**os.environ, "LOOP_ORCA": "1", "LOOP_ORCA_BIN": str(stub)}
        self.addCleanup(self.tmp.cleanup)

    def st(self, *args, **kw):
        return subprocess.run([sys.executable, "-I", HERE / "loop_status.py", *map(str, args)],
                              capture_output=True, text=True, env=self.env, timeout=30, **kw)

    def fake_run_sh(self):
        # pid の取り違え防止で cmdline に run.sh を含むことを見るので、そう見えるプロセスを立てる
        proc = subprocess.Popen(["bash", "-c", "exec -a run.sh sleep 60"])
        self.addCleanup(proc.kill)
        return proc

    def orca_calls(self):
        return self.calls.read_text().splitlines() if self.calls.exists() else []

    def test_status_tells_running_stopped_and_waiting_for_a_human_apart(self):
        proc = self.fake_run_sh()
        self.st("start", self.state, proc.pid, "bootstrap", self.state / "run.log", "/repo")
        self.st("set", self.state, "main", "agent", "bootstrap-fix-guard-r4", "")
        out = self.st("status", self.state).stdout
        self.assertTrue(out.startswith("動作中  bootstrap"), out)
        self.assertIn("main: エージェント実行中 — bootstrap-fix-guard-r4", out)
        self.assertEqual(self.st("running", self.state).returncode, 0)

        proc.kill(); proc.wait()
        out = self.st("status", self.state).stdout
        self.assertTrue(out.startswith("停止"), out)
        self.assertIn("終了の記録がない", out)
        self.assertEqual(self.st("running", self.state).returncode, 1)

        self.st("set", self.state, "main", "escalated", "#1 canaries did not match", "")
        self.assertTrue(self.st("status", self.state).stdout.startswith("人間待ち"))

    def test_status_is_reflected_on_the_orca_workspace(self):
        self.st("start", self.state, os.getpid(), "bootstrap", "", "/repo")
        self.st("set", self.state, "main", "waiting-ci", "PR #2", "")
        self.st("set", self.state, "main", "escalated", "#1 stuck", "")
        calls = self.orca_calls()
        self.assertIn("worktree set --worktree path:/repo --workspace-status in-progress --comment loop main: CI 待ち — PR #2", calls)
        self.assertIn("worktree set --worktree path:/repo --workspace-status in-review --comment loop main: 人間待ち — #1 stuck --unread", calls)

    def test_finish_keeps_an_escalation_and_marks_other_failures_as_stopped(self):
        for rc, before, after in [(0, "agent", "done"), (1, "escalated", "escalated"), (143, "waiting-ci", "stopped"),
                                  (2, "agent", "escalated")]:
            self.st("start", self.state, os.getpid(), "bootstrap", "", "/repo")
            self.st("set", self.state, "main", before, "x", "")
            self.st("finish", self.state, rc)
            main = json.loads((self.state / "status/main.json").read_text())
            self.assertEqual(main["step"], after, (rc, before))
            self.assertEqual(json.loads((self.state / "status/run.json").read_text())["exit"], rc)

    def test_watch_shows_the_log_and_renames_its_own_tab(self):
        log = self.state / "run.log"
        log.write_text("[t] claude: bootstrap-fix-guard-r4\n")
        proc = self.fake_run_sh()
        self.st("start", self.state, proc.pid, "bootstrap", log, "/repo")
        self.st("set", self.state, "main", "waiting-ci", "PR #2", "")
        self.env["ORCA_TERMINAL_HANDLE"] = "term_watch"
        out = self.st("watch", self.state, "--once").stdout
        self.assertIn("claude: bootstrap-fix-guard-r4", out)
        self.assertIn("main: CI 待ち — PR #2", out)
        self.assertIn("terminal rename --terminal term_watch --title loop ⏳ CI 待ち PR #2", self.orca_calls())

    def test_follow_renders_an_agent_run_across_resumes_and_ends(self):
        base = self.state / "log"
        tool = {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Bash", "input": {"command": "git status"}}]}}
        err = {"type": "user", "message": {"content": [{"type": "tool_result", "is_error": True, "content": "BLOCKED by hook"}]}}
        result = {"type": "result", "result": "done\nRESULT: pushed https://example.com/pr/2", "num_turns": 3, "total_cost_usd": 0.5}
        Path(f"{base}.part1.jsonl").write_text(json.dumps(tool) + "\n" + json.dumps(err) + "\n")
        Path(f"{base}.part2.jsonl").write_text(json.dumps(result) + "\n")
        Path(f"{base}.done").write_text("")
        out = self.st("follow", base).stdout
        self.assertIn("$ Bash: git status", out)
        self.assertIn("✗ BLOCKED by hook", out)
        self.assertIn("再開(part 2)", out)
        self.assertIn("■ RESULT: pushed https://example.com/pr/2  ターン 3  $0.5", out)

    def test_follow_reads_codex_events_before_the_run_finishes(self):
        base = self.state / "codex"
        raw = Path(f"{base}.part1.raw.jsonl")
        raw.write_text('{"type":"item.started","item":{"type":"command_execution","command":"git status"}}\n')
        with subprocess.Popen([sys.executable, "-I", HERE / "loop_status.py", "follow", base],
                              stdout=subprocess.PIPE, text=True, env=self.env) as proc:
            try:
                self.assertTrue(select([proc.stdout], [], [], 3)[0])
                self.assertIn("$ Bash: git status", proc.stdout.readline())
                Path(f"{base}.part1.jsonl").write_text(
                    '{"type":"result","result":"RESULT: clean","num_turns":1}\n')
                Path(f"{base}.done").touch()
                self.assertIn("■ RESULT: clean", proc.communicate(timeout=3)[0])
            finally:
                if proc.poll() is None:
                    proc.kill()

    def test_agent_tab_replaces_the_previous_tab_of_the_same_worktree(self):
        wt = self.state / "wt"
        subprocess.run(["git", "init", "-q", wt], check=True)
        for name in ("first", "second"):
            self.st("agent-tab", self.state, wt, name, self.state / name, "/repo")
        calls = self.orca_calls()
        creates = [c for c in calls if c.startswith("terminal create")]
        self.assertEqual(len(creates), 2)
        self.assertIn(f"--worktree path:{wt} --title second", creates[1])
        self.assertIn(f"follow {self.state / 'second'}", creates[1])
        self.assertIn("terminal close --terminal term_new --tab", calls)

    def test_agent_tab_retries_until_orca_knows_a_new_worktree(self):
        # 作ったばかりの worktree は、Orca が認識するまで少しかかる
        stub = self.state / "bin" / "orca"
        stub.write_text(f"""#!/bin/sh
printf '%s\\n' "$*" >>"{self.calls}"
n=$(grep -c '^terminal create' "{self.calls}")
[ "$n" -ge 3 ] || exit 1
echo '{{"ok":true,"result":{{"terminal":{{"handle":"term_late"}}}}}}'
""")
        self.env["LOOP_ORCA_RETRY_SECONDS"] = "0"
        self.st("agent-tab", self.state, self.state, "plan-r1", self.state / "base", "/repo")
        self.assertEqual(json.loads((self.state / "orca/agent-tabs.json").read_text()), {"/repo": "term_late"})

    def test_forget_tab_closes_the_tab_of_a_removed_worktree(self):
        (self.state / "orca").mkdir()
        (self.state / "orca/agent-tabs.json").write_text(json.dumps({"/wt/a": "term_a", "/wt/b": "term_b"}))
        self.st("forget-tab", self.state, "/wt/a")
        self.assertIn("terminal close --terminal term_a --tab", self.orca_calls())
        self.assertEqual(json.loads((self.state / "orca/agent-tabs.json").read_text()), {"/wt/b": "term_b"})

    def test_ctl_refuses_to_start_a_second_loop(self):
        proc = self.fake_run_sh()
        self.st("start", self.state, proc.pid, "bootstrap", "", "/repo")
        r = subprocess.run(["bash", HERE / "ctl.sh", "start", "bootstrap"], capture_output=True, text=True,
                           env={**self.env, "STATE_DIR": str(self.state)}, timeout=30)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("already running", r.stdout)

    def test_stop_ends_the_run_and_its_process_group(self):
        proc = subprocess.Popen(["setsid", "bash", "-c", "exec -a run.sh bash -c 'sleep 60 & wait'"])
        self.addCleanup(proc.kill)
        time.sleep(0.3)
        self.st("start", self.state, proc.pid, "bootstrap", "", "/repo")
        r = self.st("stop", self.state)
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertEqual(self.st("running", self.state).returncode, 1)


if __name__ == "__main__":
    unittest.main()

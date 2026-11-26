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

    def test_missing_audit_evidence_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "log"
            log.write_text('{}\n')
            result = self.invoke("canaries.py", "audit", log, LOOP_AGENT="codex", LOOP_CANARY_DIR=tmp)
            self.assertNotEqual(result.returncode, 0)

    def test_claude_audit_ignores_broken_lines_and_missing_result(self):
        # Claude のセッションが異常終了しただけで、カナリアを覗いたとして無効にしない
        tool = {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Bash", "input": {"command": "git status"}}]}}
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "log"
            env = dict(LOOP_CANARY_DIR=tmp)
            for text in [json.dumps(tool) + "\n", json.dumps(tool) + '\n{"type":"resu\n[1]\n']:
                log.write_text(text)
                result = self.invoke("canaries.py", "audit", log, LOOP_AGENT="claude", **env)
                self.assertEqual(result.returncode, 0, result.stdout)

    def test_claude_audit_still_detects_canary_search(self):
        tool = {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Bash", "input": {"command": "gh pr list --label loop:canary"}}]}}
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "log"
            log.write_text(json.dumps(tool) + '\n{"type":"resu\n')
            result = self.invoke("canaries.py", "audit", log, LOOP_AGENT="claude", LOOP_CANARY_DIR=tmp)
            self.assertNotEqual(result.returncode, 0, result.stdout)

    def test_codex_audit_rejects_broken_lines(self):
        hook = {"type": "assistant", "source": "codex_hook", "message": {"content": []}}
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "log"
            log.write_text(json.dumps(hook) + '\n{"type":"resu\n{"type":"result"}\n')
            result = self.invoke("canaries.py", "audit", log, LOOP_AGENT="codex", LOOP_CANARY_DIR=tmp)
            self.assertNotEqual(result.returncode, 0, result.stdout)

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

    def test_hook_audit_detects_attempt_even_when_cli_omits_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "tools"
            env = dict(LOOP_AGENT="codex", LOOP_MODE="bootstrap", LOOP_TOOL_LOG=str(log), LOOP_CANARY_DIR=tmp)
            for command, denied in [("git status", False), ("gh pr list --label loop:canary", True)]:
                self.invoke("guard-hook.py", data={"tool_name": "Bash", "tool_input": {"command": command}}, **env)
                with log.open("a") as out:
                    print(json.dumps({"type": "result"}), file=out)
                result = self.invoke("canaries.py", "audit", log, **env)
                self.assertEqual(result.returncode != 0, denied, result.stdout)

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


if __name__ == "__main__":
    unittest.main()

import json
from pathlib import Path
import runpy
import tempfile
import unittest


quota = runpy.run_path(str(Path(__file__).with_name("worker_quota.py")))
select = quota["select"]
assign = quota["assign"]


class WorkerQuota(unittest.TestCase):
    def setUp(self):
        sandbox = tempfile.TemporaryDirectory()
        self.addCleanup(sandbox.cleanup)
        self.state = Path(sandbox.name)
        self.sessions = self.state / "sessions"

    def write_event(self, path, event):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(event) + "\n")

    def claude(self, utilization, reset):
        self.write_event(self.state / "logs/claude-issue-1.part1.jsonl", {
            "type": "rate_limit_event",
            "rate_limit_info": {"unifiedWindows": {"five_hour": {
                "utilization": utilization, "resetsAt": reset,
            }}},
        })

    def codex(self, percent, reset):
        self.write_event(self.sessions / "2026/11/27/rollout.jsonl", {
            "type": "event_msg",
            "payload": {"type": "token_count", "rate_limits": {
                "limit_id": "codex", "primary": {"used_percent": percent, "resets_at": reset},
            }},
        })

    def provider(self, preferred, now=100):
        return select(self.state, self.sessions, preferred, now)

    def test_no_telemetry_and_exactly_ninety_keep_the_preferred_worker(self):
        self.assertEqual(self.provider("claude"), "claude")
        self.assertEqual(self.provider("codex"), "codex")
        self.claude(0.9, 500)
        self.codex(90, 500)
        self.assertEqual(self.provider("claude"), "claude")
        self.assertEqual(self.provider("codex"), "codex")

    def test_high_usage_selects_the_other_worker_in_both_directions(self):
        self.claude(0.91, 500)
        self.codex(90, 600)
        self.assertEqual(self.provider("claude"), "codex")
        self.claude(0.9, 500)
        self.codex(91, 600)
        self.assertEqual(self.provider("codex"), "claude")

    def test_both_above_threshold_wait_until_one_workers_quota_resets(self):
        self.claude(0.91, 500)
        self.codex(91, 600)
        self.assertEqual(self.provider("codex"), "500")
        self.assertEqual(self.provider("codex", now=500), "claude")
        self.assertEqual(self.provider("codex", now=600), "codex")

    def test_explicit_limit_is_provider_specific_without_telemetry(self):
        (self.state / "mixed-limited-until-codex").write_text("300\n")
        self.assertEqual(self.provider("codex"), "claude")
        self.assertEqual(self.provider("codex", now=300), "codex")
        (self.state / "limited-until").write_text("400\n")
        self.assertEqual(self.provider("claude"), "300")

    def test_alternation_continues_across_restarts(self):
        # ループを起動し直すたびに Claude から始めると、escalation のたびに Claude に偏る
        picks = [assign(self.state, self.sessions, 100)[0] for _ in range(3)]
        self.assertEqual(picks, ["claude", "codex", "claude"])
        restarted = runpy.run_path(str(Path(__file__).with_name("worker_quota.py")))["assign"]
        self.assertEqual(restarted(self.state, self.sessions, 100), ("codex", "codex"))

    def test_fallback_keeps_the_turn_with_the_worker_that_was_skipped(self):
        self.claude(0.91, 500)
        self.assertEqual(assign(self.state, self.sessions, 100), ("codex", "claude"))
        self.assertEqual(assign(self.state, self.sessions, 100), ("codex", "claude"))
        self.assertEqual(assign(self.state, self.sessions, 500), ("claude", "claude"))
        self.assertEqual(assign(self.state, self.sessions, 500), ("codex", "codex"))

    def test_waiting_for_a_reset_does_not_move_the_turn(self):
        self.claude(0.91, 500)
        self.codex(91, 600)
        self.assertEqual(assign(self.state, self.sessions, 100), ("500", "claude"))
        self.assertEqual(assign(self.state, self.sessions, 500), ("claude", "claude"))

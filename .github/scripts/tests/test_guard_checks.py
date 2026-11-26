"""guard_checks.py の試験(docs/adr/0012)。"""

from __future__ import annotations

import io
import sys
import unittest
import urllib.error
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from guard_checks import escalate  # noqa: E402

SHA = "a" * 40
OWN = "100"


def job(check_id: int, run: str, status: str = "completed", conclusion: str | None = "success") -> dict:
    return {"id": check_id, "name": "guard", "status": status, "conclusion": conclusion,
            "details_url": f"https://github.com/o/r/actions/runs/{run}/job/{check_id}", "external_id": ""}


class FakeApi:
    """Checks API の、guard_checks.py が使う部分をメモリ上の状態で真似る。"""

    def __init__(self, runs: list[dict], forbid_patch: bool = False) -> None:
        self.runs = runs
        self.forbid_patch = forbid_patch
        self.next_id = 1000
        self.ticks: list[callable] = []

    def guard_runs(self, sha: str) -> list[dict]:
        return [dict(r) for r in self.runs if r["name"] == "guard" and r.get("head_sha", SHA) == sha]

    def call(self, method: str, path: str, body: dict | None = None) -> dict:
        if method == "POST" and path == "/check-runs":
            run = {"id": self.next_id, "details_url": None, **body}
            self.next_id += 1
            self.runs.append(run)
            return run
        if method == "PATCH" and path.startswith("/check-runs/"):
            if self.forbid_patch:
                raise urllib.error.HTTPError(path, 403, "Forbidden", {}, None)
            run = next(r for r in self.runs if r["id"] == int(path.rsplit("/", 1)[1]))
            run.update(body)
            return run
        raise AssertionError(f"unexpected call {method} {path}")

    def by_id(self, check_id: int) -> dict:
        return next(r for r in self.runs if r["id"] == check_id)


class Clock:
    def __init__(self, api: FakeApi) -> None:
        self.now = 0.0
        self.api = api

    def sleep(self, seconds: float) -> None:
        self.now += seconds
        for tick in list(self.api.ticks):
            tick(self.now)

    def __call__(self) -> float:
        return self.now


def run(api: FakeApi, wait: int = 300) -> Clock:
    clock = Clock(api)
    with redirect_stdout(io.StringIO()):
        escalate(api, SHA, OWN, wait, 10, sleep=clock.sleep, clock=clock)
    return clock


class EscalateTest(unittest.TestCase):
    def test_a_guard_that_succeeded_in_another_workflow_is_marked_failed(self) -> None:
        api = FakeApi([job(1, OWN, "in_progress", None), job(2, "200"), job(3, "300", conclusion="failure")])
        run(api)
        self.assertEqual(api.by_id(2)["conclusion"], "failure")
        self.assertEqual(api.by_id(3)["conclusion"], "failure")
        self.assertEqual(api.by_id(1)["status"], "in_progress")

    def test_a_failed_guard_check_run_is_added_with_its_own_run_id(self) -> None:
        api = FakeApi([job(1, OWN, "in_progress", None)])
        run(api)
        added = [r for r in api.runs if r["id"] >= 1000]
        self.assertEqual(len(added), 1)
        self.assertEqual((added[0]["name"], added[0]["conclusion"], added[0]["external_id"], added[0]["head_sha"]),
                         ("guard", "failure", OWN, SHA))

    def test_waits_for_a_guard_still_running_and_then_marks_its_success_failed(self) -> None:
        api = FakeApi([job(1, OWN, "in_progress", None), job(2, "200", "in_progress", None)])

        def finish(now: float) -> None:
            if now >= 30:
                api.by_id(2).update(status="completed", conclusion="success")
        api.ticks.append(finish)
        clock = run(api)
        self.assertEqual(api.by_id(2)["conclusion"], "failure")
        self.assertLess(clock.now, 300)

    def test_does_not_wait_for_a_guard_that_already_reported_its_failure(self) -> None:
        other = job(2, "200", "in_progress", None)
        marker = {"id": 50, "name": "guard", "status": "completed", "conclusion": "failure",
                  "details_url": None, "external_id": "200"}
        api = FakeApi([job(1, OWN, "in_progress", None), other, marker])
        clock = run(api)
        self.assertEqual(clock.now, 0)

    def test_gives_up_waiting_at_the_deadline(self) -> None:
        api = FakeApi([job(1, OWN, "in_progress", None), job(2, "200", "in_progress", None)])
        clock = run(api, wait=60)
        self.assertGreaterEqual(clock.now, 60)
        self.assertLess(clock.now, 80)
        self.assertEqual(api.by_id(2)["status"], "in_progress")

    def test_a_refused_patch_still_leaves_the_added_failure(self) -> None:
        api = FakeApi([job(1, OWN, "in_progress", None), job(2, "200")], forbid_patch=True)
        run(api)
        self.assertEqual(api.by_id(2)["conclusion"], "success")
        self.assertTrue(any(r["id"] >= 1000 and r["conclusion"] == "failure" for r in api.runs))


if __name__ == "__main__":
    unittest.main()

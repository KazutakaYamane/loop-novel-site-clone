"""changed_code.py と metrics.py の試験。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from changed_code import line_ranges, stryker_targets, ui_check  # noqa: E402
from difflib_git import FileDiff, parse_unified  # noqa: E402
from metrics import build_row, ci_counts, parse_metrics_comment  # noqa: E402

DIFF = """diff --git a/frontend/lib/a.ts b/frontend/lib/a.ts
index 1..2 100644
--- a/frontend/lib/a.ts
+++ b/frontend/lib/a.ts
@@ -3,0 +4,2 @@ x
+const a = 1;
+const b = 2;
@@ -10 +12 @@ y
-old
+new
diff --git a/frontend/lib/a.test.ts b/frontend/lib/a.test.ts
new file mode 100644
--- /dev/null
+++ b/frontend/lib/a.test.ts
@@ -0,0 +1 @@
+test("a", () => {});
diff --git a/e2e/visual/__screenshots__/x.png b/e2e/visual/__screenshots__/x.png
new file mode 100644
Binary files /dev/null and b/e2e/visual/__screenshots__/x.png differ
"""


class DiffTest(unittest.TestCase):
    def test_parse_unified(self) -> None:
        files = parse_unified(DIFF)
        self.assertEqual(files["frontend/lib/a.ts"].added, [(4, "const a = 1;"), (5, "const b = 2;"), (12, "new")])
        self.assertEqual(files["frontend/lib/a.ts"].removed, ["old"])
        self.assertEqual(files["frontend/lib/a.test.ts"].status, "A")
        self.assertTrue(files["e2e/visual/__screenshots__/x.png"].binary)
        self.assertEqual(files["e2e/visual/__screenshots__/x.png"].status, "A")

    def test_line_ranges(self) -> None:
        self.assertEqual(line_ranges([5, 4, 12, 13, 20]), [(4, 5), (12, 13), (20, 20)])

    def test_stryker_targets_only_production_code(self) -> None:
        self.assertEqual(stryker_targets(parse_unified(DIFF)), ["lib/a.ts:4-5", "lib/a.ts:12-12"])

    def test_ui_change_without_baseline(self) -> None:
        files = {"frontend/app/page.tsx": FileDiff("frontend/app/page.tsx", "M"), "frontend/app/x.module.css": FileDiff("frontend/app/x.module.css", "A")}
        self.assertEqual(ui_check(files), (["frontend/app/page.tsx", "frontend/app/x.module.css"], []))

    def test_ui_change_with_new_baseline(self) -> None:
        ui, baselines = ui_check(parse_unified(DIFF) | {"frontend/app/page.tsx": FileDiff("frontend/app/page.tsx", "M")})
        self.assertEqual(ui, ["frontend/app/page.tsx"])
        self.assertEqual(baselines, ["e2e/visual/__screenshots__/x.png"])

    def test_non_ui_change(self) -> None:
        self.assertEqual(ui_check(parse_unified(DIFF))[0], [])


COMMENT = """<!-- loop-metrics -->
```jsonl
{"run": "issue-3", "api_equivalent_cost_usd": 1.25, "duration_ms": 1000, "num_turns": 10, "resumes": 0}
{"run": "review-3-r1", "api_equivalent_cost_usd": 0.5, "duration_ms": 500, "num_turns": 4, "resumes": 1}
```
"""

RUNS = [
    {"name": "CI", "event": "pull_request", "head_sha": "a", "conclusion": "failure", "pull_requests": [{"number": 7}]},
    {"name": "CI", "event": "pull_request", "head_sha": "b", "conclusion": "failure", "pull_requests": []},
    {"name": "CI", "event": "pull_request", "head_sha": "c", "conclusion": "success", "pull_requests": [{"number": 7}]},
    {"name": "CI", "event": "pull_request", "head_sha": "d", "conclusion": "success", "pull_requests": [{"number": 8}]},
    {"name": "Metrics", "event": "pull_request", "head_sha": "c", "conclusion": "failure", "pull_requests": [{"number": 7}]},
]


class MetricsTest(unittest.TestCase):
    def test_parse_comment(self) -> None:
        rows = parse_metrics_comment([{"body": "hello"}, {"body": COMMENT}])
        self.assertEqual([r["run"] for r in rows or []], ["issue-3", "review-3-r1"])

    def test_no_comment(self) -> None:
        self.assertIsNone(parse_metrics_comment([{"body": "hello"}]))

    def test_ci_counts(self) -> None:
        self.assertEqual(ci_counts(RUNS, "CI", 7), {"attempts": 3, "ci_runs": 3, "ci_failures": 2})

    def test_build_row(self) -> None:
        pr = {"number": 7, "title": "t", "body": "Closes #3\nAC:", "head": {"ref": "3-x"}, "merged_at": "2026-01-01T00:00:00Z"}
        row = build_row(pr, [{"body": COMMENT}], RUNS, "CI")
        self.assertEqual(row["issue"], 3)
        self.assertEqual(row["totals"], {"api_equivalent_cost_usd": 1.75, "duration_ms": 1500, "num_turns": 14, "resumes": 1})
        self.assertEqual(row["ci_failures"], 2)
        self.assertTrue(row["metrics_comment_found"])


if __name__ == "__main__":
    unittest.main()

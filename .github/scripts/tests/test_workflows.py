"""guard ジョブの置き方の試験(docs/adr/0009)。

PR が 1 つのワークフローの guard を「何もせずに成功する」ように書き換えても、他のワークフローの guard が
その書き換えを保護パスの変更として落とせるよう、guard は互いに独立した複数のワークフローに置く。
リポジトリのルートをカレントディレクトリにして走らせる(CI の guard ジョブもそうしている)。
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

WORKFLOWS = Path(".github/workflows")
JOB = re.compile(r"^  ([A-Za-z_][\w-]*):\s*$", re.M)


def jobs(text: str) -> dict[str, str]:
    """トップレベルの jobs: の下のジョブ ID と、その定義のテキスト。"""
    start = re.search(r"^jobs:\s*$", text, re.M)
    if not start:
        return {}
    body = text[start.end():]
    end = re.search(r"^\S", body, re.M)
    if end:
        body = body[:end.start()]
    found = list(JOB.finditer(body))
    return {m.group(1): body[m.end():(found[i + 1].start() if i + 1 < len(found) else len(body))]
            for i, m in enumerate(found)}


def on_block(text: str) -> str:
    m = re.search(r"^on:\s*\n((?:[ #].*\n|\n)*)", text, re.M)
    return m.group(1) if m else ""


def guard_workflows() -> dict[Path, str]:
    result = {}
    for path in sorted(WORKFLOWS.glob("*.y*ml")):
        text = path.read_text()
        job = jobs(text).get("guard")
        if job is not None:
            result[path] = job
    return result


class GuardPlacementTest(unittest.TestCase):
    def test_guard_is_defined_in_at_least_three_workflows(self) -> None:
        self.assertGreaterEqual(len(guard_workflows()), 3, list(guard_workflows()))

    def test_no_workflow_uses_pull_request_target(self) -> None:
        # pull_request_target は既定のブランチのワークフローで動き、PR の base のものを使わない。
        # 公開リポジトリでは 2026-12-02 から既定で止められる
        for path in WORKFLOWS.glob("*.y*ml"):
            self.assertNotIn("pull_request_target", on_block(path.read_text()), path)

    def test_every_guard_runs_on_every_pull_request(self) -> None:
        for path in guard_workflows():
            block = on_block(path.read_text())
            self.assertRegex(block, r"(?m)^  pull_request:", path)
            self.assertNotRegex(block, r"(?m)^\s+(branches|branches-ignore|paths|paths-ignore):", path)

    def test_every_guard_is_unconditional(self) -> None:
        for path, job in guard_workflows().items():
            self.assertNotRegex(job, r"(?m)^    if:", path)
            self.assertNotRegex(job, r"(?m)^    name:", path)
            self.assertNotRegex(job, r"(?m)^    needs:", path)

    def test_every_guard_is_self_contained(self) -> None:
        # 共有のファイル(ci-scripts.sh、ローカルの action、再利用のワークフロー)を 1 つ書き換えれば
        # すべての guard が止まる、ということが無いよう、各 guard は手順を自分の中に書く
        for path, job in guard_workflows().items():
            self.assertNotIn("ci-scripts.sh", job, path)
            self.assertNotRegex(job, r"uses:\s*\./", path)
            self.assertIn("git archive", job, path)
            self.assertRegex(job, r"guard\.py\"? --base", path)
            self.assertIn("unittest discover", job, path)


if __name__ == "__main__":
    unittest.main()

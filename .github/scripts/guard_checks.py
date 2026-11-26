"""guard が落ちたとき、同じ commit の他の `guard` チェックもすべて失敗にする(docs/adr/0012)。

guard は 3 つのワークフローに同じ手順で置いてある(docs/adr/0009)。PR が 1 つの guard を「何もせずに成功する」
ように書き換えると、`guard` という名前のチェックが成功と失敗の両方で並ぶ。名前ごとに 1 つの結果だけを見る
集計(後から来たものが勝つ辞書など)では、書き換えた方の成功が残ることがある。書き換えられていない guard は
同じ base のスクリプトを同じ差分に走らせるので、同じ commit で成功した guard は、書き換えられた guard しかない。
そこで、落ちた guard は失敗の `guard` を 1 つ足し、他の guard の終わりを待って、成功した `guard` を失敗に書き換える。
足す失敗のチェックの external_id には自分のワークフローの実行の ID を入れる。落ちた guard どうしが互いの終わりを
待ち続けないよう、そう印の付いた実行の guard は待たない。

標準ライブラリだけを使う。GITHUB_TOKEN に checks: write が要る。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

NAME = "guard"
# 書き換えられた guard は、他の PR のジョブでランナーが埋まっていると、何十分も待たされてから始まることがある
DEFAULT_WAIT = 40 * 60
TITLE = "another guard check on this commit failed"
SUMMARY = (
    "同じ commit の別の guard が AGENTS.md の違反を見つけた。guard は 3 つのワークフローに同じ手順で置いてあり"
    "(docs/adr/0009)、そのうち 1 つだけが成功するのは、PR がその guard を書き換えたときだけなので、"
    "この成功も失敗として扱う(docs/adr/0012)。"
)


def workflow_run(run: dict) -> str | None:
    m = re.search(r"/actions/runs/(\d+)(?:/|$)", run.get("details_url") or "")
    return m.group(1) if m else None


def others(runs: list[dict], run_id: str) -> list[dict]:
    return [r for r in runs if r.get("name") == NAME and workflow_run(r) != run_id]


def pending(runs: list[dict], run_id: str) -> list[dict]:
    """まだ終わっておらず、落ちたと印も付けていない、他のワークフローの guard。"""
    failed = {r.get("external_id") for r in runs
              if r.get("name") == NAME and r.get("conclusion") == "failure" and r.get("external_id")}
    return [r for r in others(runs, run_id) if r.get("status") != "completed" and workflow_run(r) not in failed]


def to_fail(runs: list[dict], run_id: str) -> list[dict]:
    return [r for r in others(runs, run_id)
            if r.get("status") == "completed" and r.get("conclusion") in ("success", "neutral", "skipped")]


class Api:
    def __init__(self, base: str, repo: str, token: str) -> None:
        self.base, self.repo, self.token = base.rstrip("/"), repo, token

    def call(self, method: str, path: str, body: dict | None = None) -> dict:
        req = urllib.request.Request(
            f"{self.base}/repos/{self.repo}{path}", method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read() or b"{}")

    def guard_runs(self, sha: str) -> list[dict]:
        return self.call("GET", f"/commits/{sha}/check-runs?check_name={NAME}&filter=all&per_page=100")["check_runs"]


def escalate(api, sha: str, run_id: str, wait: int, interval: int, sleep=time.sleep, clock=time.monotonic) -> None:
    output = {"title": TITLE, "summary": SUMMARY}
    # 名前ごとに 1 つの結果だけを見る集計のために、失敗の guard を 1 つ足す
    try:
        api.call("POST", "/check-runs", {"name": NAME, "head_sha": sha, "external_id": run_id,
                                         "status": "completed", "conclusion": "failure", "output": output})
        print("guard: added a failed guard check run")
    except urllib.error.HTTPError as e:
        print(f"::warning::guard: could not add a failed guard check run: {e}")

    # 書き換えられた guard が終わる前に書き換えても、終わったときに成功で上書きされるので、終わりを待つ
    deadline = clock() + wait
    runs = api.guard_runs(sha)
    while pending(runs, run_id) and clock() < deadline:
        sleep(interval)
        runs = api.guard_runs(sha)

    succeeded = to_fail(runs, run_id)
    for run in succeeded:
        try:
            api.call("PATCH", f"/check-runs/{run['id']}",
                     {"status": "completed", "conclusion": "failure", "output": output})
            print(f"guard: marked {run.get('details_url')} as failed")
        except urllib.error.HTTPError as e:
            print(f"::warning::guard: could not mark {run.get('details_url')} as failed: {e}")

    # 書き換えを断られても、最後に終わった `guard` が失敗になるよう、成功した guard が終わった後にもう 1 つ足す
    if not succeeded:
        return
    try:
        api.call("POST", "/check-runs", {"name": NAME, "head_sha": sha, "external_id": run_id,
                                         "status": "completed", "conclusion": "failure", "output": output})
    except urllib.error.HTTPError as e:
        print(f"::warning::guard: could not add the last failed guard check run: {e}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--sha", required=True)
    p.add_argument("--wait", type=int, default=DEFAULT_WAIT, help="他の guard の終わりを待つ最長の秒数")
    p.add_argument("--interval", type=int, default=10)
    a = p.parse_args(argv)
    api = Api(os.environ.get("GITHUB_API_URL", "https://api.github.com"),
              os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_TOKEN"])
    escalate(api, a.sha, os.environ["GITHUB_RUN_ID"], a.wait, a.interval)
    return 0


if __name__ == "__main__":
    sys.exit(main())

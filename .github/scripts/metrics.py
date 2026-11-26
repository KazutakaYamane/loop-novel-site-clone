"""マージされた PR の metrics を 1 行の JSON にする。.github/workflows/metrics.yml が metrics ブランチの metrics/metrics.jsonl に追記する。

- まとめ役(scripts/loop/run.sh)がマージ直前に書く `<!-- loop-metrics -->` のコメントから、各実行の費用・時間・ターン数を読む
- GitHub Actions の記録から、その PR の CI の実行回数、失敗回数、push の回数(attempt)を数える

使い方: GH_TOKEN=... python3 .github/scripts/metrics.py --repo owner/name --pr 12 [--workflow CI]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.parse
from datetime import datetime, timezone

MARKER = "<!-- loop-metrics -->"
FAILED = {"failure", "timed_out", "startup_failure"}


def gh_api(path: str) -> list[dict]:
    """gh api --paginate の結果を、配列の要素または workflow_runs の要素の並びにする。"""
    jq = ".workflow_runs[]" if "/actions/runs" in path else ".[]"
    out = subprocess.run(["gh", "api", "--paginate", path, "--jq", jq], check=True, capture_output=True, text=True).stdout
    return [json.loads(line) for line in out.splitlines() if line.strip()]


def parse_metrics_comment(comments: list[dict]) -> list[dict] | None:
    """最後の metrics のコメントにある JSON Lines を読む。コメントが無ければ None。"""
    bodies = [c.get("body") or "" for c in comments if (c.get("body") or "").lstrip().startswith(MARKER)]
    if not bodies:
        return None
    rows = []
    for line in bodies[-1].splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(row, dict):
            rows.append(row)
    return rows


def totals(rows: list[dict]) -> dict[str, float]:
    keys = ("api_equivalent_cost_usd", "duration_ms", "num_turns", "resumes")
    out: dict[str, float] = {}
    for k in keys:
        vals = [r[k] for r in rows if isinstance(r.get(k), (int, float))]
        out[k] = round(sum(vals), 4) if k == "api_equivalent_cost_usd" else int(sum(vals))
    return out


def ci_counts(runs: list[dict], workflow: str, pr_number: int) -> dict[str, int]:
    """CI の実行を数える。1 回の push が 1 回の CI の実行を起こすので、head の SHA の数を attempt とする。"""
    mine = []
    for run in runs:
        if run.get("name") != workflow or run.get("event") != "pull_request":
            continue
        prs = [p.get("number") for p in run.get("pull_requests") or []]
        if prs and pr_number not in prs:
            continue
        mine.append(run)
    return {
        "attempts": len({r.get("head_sha") for r in mine}),
        "ci_runs": len(mine),
        "ci_failures": sum(1 for r in mine if r.get("conclusion") in FAILED),
    }


def closing_issue(body: str) -> int | None:
    m = re.search(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)", body or "", flags=re.I)
    return int(m.group(1)) if m else None


def build_row(pr: dict, comments: list[dict], runs: list[dict], workflow: str) -> dict:
    rows = parse_metrics_comment(comments)
    return {
        "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "pr": pr["number"],
        "issue": closing_issue(pr.get("body") or ""),
        "title": pr.get("title"),
        "branch": (pr.get("head") or {}).get("ref"),
        "created_at": pr.get("created_at"),
        "merged_at": pr.get("merged_at"),
        **ci_counts(runs, workflow, pr["number"]),
        "metrics_comment_found": rows is not None,
        "totals": totals(rows or []),
        "runs": rows or [],
    }


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--pr", type=int, required=True)
    ap.add_argument("--workflow", default="CI")
    a = ap.parse_args(argv)
    pr = json.loads(subprocess.run(["gh", "api", f"repos/{a.repo}/pulls/{a.pr}"], check=True, capture_output=True, text=True).stdout)
    comments = gh_api(f"repos/{a.repo}/issues/{a.pr}/comments?per_page=100")
    branch = pr["head"]["ref"]
    runs = gh_api(f"repos/{a.repo}/actions/runs?event=pull_request&per_page=100&branch={urllib.parse.quote(branch, safe='')}")
    print(json.dumps(build_row(pr, comments, runs, a.workflow), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

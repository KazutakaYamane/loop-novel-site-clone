"""ループの issue を読む・検証する・ラベルを付け替える。

使い方(オーケストレーターから python3 -I で呼ぶ):
  issues.py validate          分割の機械的な検証(validate-plan.sh の本体)
  issues.py ready [N ...]     着手できる issue 番号を昇順に出す。引数は除外する番号
  issues.py status            ラベルごとの件数を JSON で出す
  issues.py promote           検証を通った issue を loop:ready にする
  issues.py slug N            ブランチ名に使う slug を出す
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LOOP_LABELS = ["loop:planned", "loop:ready", "loop:in-progress", "loop:replan", "loop:escalated"]
REQUIRED_SECTIONS = ["ac", "depends on", "likely files", "scope", "out of scope"]


def gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def fetch_issues() -> dict[int, dict]:
    issues: dict[int, dict] = {}
    for label in LOOP_LABELS:
        out = gh("issue", "list", "--state", "all", "--label", label, "--limit", "500",
                 "--json", "number,title,body,state,labels")
        for i in json.loads(out):
            i["labels"] = {l["name"] for l in i["labels"]}
            issues[i["number"]] = i
    return issues


def sections(body: str | None) -> dict[str, str]:
    out: dict[str, list[str]] = {}
    cur = None
    for line in (body or "").splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            cur = m.group(1).strip().lower()
            out[cur] = []
        elif cur is not None:
            out[cur].append(line)
    return {k: re.sub(r"<!--.*?-->", "", "\n".join(v), flags=re.S).strip() for k, v in out.items()}


def ac_ids(issue: dict) -> list[str]:
    return re.findall(r"AC-F\d+-\d+", sections(issue["body"]).get("ac", ""))


def deps(issue: dict) -> list[int]:
    return [int(n) for n in re.findall(r"#(\d+)", sections(issue["body"]).get("depends on", ""))]


def likely_files(issue: dict) -> list[str]:
    files = []
    for line in sections(issue["body"]).get("likely files", "").splitlines():
        m = re.match(r"^\s*-\s+`?([^`\s]+)`?", line)
        if m:
            files.append(m.group(1))
    return files


def prefix(pattern: str) -> str:
    # glob の最初のワイルドカードより前を、重なり判定に使う
    return re.split(r"[*?\[]", pattern, maxsplit=1)[0]


def overlaps(a: list[str], b: list[str]) -> list[tuple[str, str]]:
    hits = []
    for x in a:
        for y in b:
            px, py_ = prefix(x), prefix(y)
            if px.startswith(py_) or py_.startswith(px):
                hits.append((x, y))
    return hits


# どの機能も自分の分を足すだけのファイル。並列の PR が同時に触っても、オーケストレーターが main を取り込むときに
# iteration が両方を残して解ける。ここが重なりに数えられると、ほぼすべての issue が一列に並び、1 件の escalation で全体が止まる
SHARED_ADDITIVE = ["docs/adr/**", "README.md", "docs/harness/**", "backend/AGENTS.md", "frontend/AGENTS.md",
                   "backend/routes/api.php", "docs/kakuyomu-reference/**",
                   # migration は issue ごとに日時つきの新しいファイルを足すだけ(既存の変更は人間の承認が要る)
                   "backend/database/migrations/**"]


def shared_additive(pattern: str) -> bool:
    for s in SHARED_ADDITIVE:
        if pattern == s or (s.endswith("/**") and prefix(pattern).startswith(s[:-2])):
            return True
    return False


def conflicts(a: list[str], b: list[str]) -> list[tuple[str, str]]:
    """同じソースのファイルを触りそうな組。足すだけの共有ファイルは数えない。"""
    return overlaps([x for x in a if not shared_additive(x)], [y for y in b if not shared_additive(y)])


def requirement_ids() -> list[str]:
    text = (REPO_ROOT / "docs" / "requirements.md").read_text(encoding="utf-8")
    return re.findall(r"^- (AC-F\d+-\d+)", text, flags=re.M)


def reachable(issues: dict[int, dict], start: int, goal: int) -> bool:
    seen, stack = set(), [start]
    while stack:
        n = stack.pop()
        if n == goal:
            return True
        if n in seen or n not in issues:
            continue
        seen.add(n)
        stack.extend(deps(issues[n]))
    return False


def validate() -> int:
    # 質問だけを書いた escalation の issue(テンプレートの見出しが無いもの)は分割に含めない
    issues = {n: i for n, i in fetch_issues().items()
              if not ("loop:escalated" in i["labels"] and "ac" not in sections(i["body"]))}
    errors: list[str] = []
    max_ac = int(os.environ.get("MAX_AC_PER_ISSUE", "6"))
    open_ = {n: i for n, i in issues.items() if i["state"] == "OPEN"}

    for n, i in sorted(issues.items()):
        secs = sections(i["body"])
        for s in REQUIRED_SECTIONS:
            if not secs.get(s):
                errors.append(f"#{n}: section '## {s}' is missing or empty")
        if len(ac_ids(i)) > max_ac:
            errors.append(f"#{n}: covers {len(ac_ids(i))} AC IDs (max {max_ac})")
        for d in deps(i):
            if d == n:
                errors.append(f"#{n}: depends on itself")
            elif d not in issues:
                errors.append(f"#{n}: depends on #{d}, which is not a loop issue")

    req = requirement_ids()
    owners: dict[str, list[int]] = {}
    for n, i in issues.items():
        for a in ac_ids(i):
            owners.setdefault(a, []).append(n)
    for a in req:
        if a not in owners:
            errors.append(f"{a}: not covered by any issue")
        elif len(set(owners[a])) > 1:
            errors.append(f"{a}: covered by more than one issue: " + ", ".join(f"#{x}" for x in sorted(set(owners[a]))))
    for a in owners:
        if a not in req:
            errors.append(f"{a}: not in docs/requirements.md (issues " + ", ".join(f"#{x}" for x in owners[a]) + ")")

    for n in open_:
        for d in deps(issues[n]):
            if d in issues and reachable(issues, d, n):
                errors.append(f"#{n}: dependency cycle through #{d}")

    nums = sorted(open_)
    for idx, a in enumerate(nums):
        for b in nums[idx + 1:]:
            hits = conflicts(likely_files(open_[a]), likely_files(open_[b]))
            if hits and not (reachable(issues, a, b) or reachable(issues, b, a)):
                sample = ", ".join(f"{x} ~ {y}" for x, y in hits[:3])
                errors.append(f"#{a} and #{b}: likely files overlap ({sample}) but neither depends on the other")

    if errors:
        print("validate-plan: FAILED")
        for e in errors:
            print(f"- {e}")
        return 1
    print(f"validate-plan: OK ({len(issues)} issues, {len(req)} AC IDs)")
    return 0


def is_closed(issues: dict[int, dict], n: int) -> bool:
    if n in issues:
        return issues[n]["state"] == "CLOSED"
    return json.loads(gh("issue", "view", str(n), "--json", "state"))["state"] == "CLOSED"


def ready(exclude: set[int]) -> int:
    issues = fetch_issues()
    blocked = {"loop:in-progress", "loop:escalated", "loop:replan"}
    for n, i in sorted(issues.items()):
        if n in exclude or i["state"] != "OPEN" or "loop:ready" not in i["labels"] or i["labels"] & blocked:
            continue
        if all(is_closed(issues, d) for d in deps(i)):
            print(n)
    return 0


def status() -> int:
    issues = fetch_issues()
    counts = {l: sum(1 for i in issues.values() if i["state"] == "OPEN" and l in i["labels"]) for l in LOOP_LABELS}
    counts["open"] = sum(1 for i in issues.values() if i["state"] == "OPEN")
    print(json.dumps(counts))
    return 0


def promote() -> int:
    for n, i in sorted(fetch_issues().items()):
        if i["state"] != "OPEN":
            continue
        if "loop:planned" in i["labels"] or "loop:replan" in i["labels"]:
            gh("issue", "edit", str(n), "--add-label", "loop:ready", "--remove-label", "loop:planned,loop:replan")
            print(f"#{n} -> loop:ready")
    return 0


def slug(n: int) -> int:
    title = json.loads(gh("issue", "view", str(n), "--json", "title"))["title"]
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40].strip("-")
    print(s or "issue")
    return 0


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "validate":
        return validate()
    if cmd == "ready":
        return ready({int(x) for x in argv[2:]})
    if cmd == "status":
        return status()
    if cmd == "promote":
        return promote()
    if cmd == "slug" and len(argv) == 3:
        return slug(int(argv[2]))
    print(__doc__, file=sys.stderr)
    return 64


if __name__ == "__main__":
    sys.exit(main(sys.argv))

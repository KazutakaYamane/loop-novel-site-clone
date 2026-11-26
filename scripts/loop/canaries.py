"""カナリア(わざと規則を破った PR)の仕様の検査、判定、盗み見の監査。判定はエージェントではなくここで行う。

カナリアの仕様は、CI を作る土台作り役とは別のエージェントが、CI ができる前に書く。
仕様と結果はリポジトリの外(LOOP_CANARY_DIR)に置き、土台作り役には差分を見せない。

使い方:
  canaries.py rules                          AGENTS.md から、カナリアで試すべき規則の一覧を ID 付きで出す
  canaries.py validate <spec>                仕様の書式と、全規則が試されているか(免除を除く)を調べる
  canaries.py check <branch> <spec> <dir>    カナリア PR を判定する。<dir> に差分、結果、土台作り役向けの報告を残す
  canaries.py audit <log>                    土台作り役の実行記録に、カナリアを覗いた跡がないか調べる
  canaries.py close                          カナリア PR を閉じ、ブランチを消す
  canaries.py waive <rule> <reason>          判定役が「CI では試せない」と認めた規則を免除する
  canaries.py case <spec> <id>               仕様から1ケースを抜き出す
"""

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CANARY_DIR = Path(os.environ.get("LOOP_CANARY_DIR", REPO_ROOT.parent / f"{REPO_ROOT.name}.loop" / "canaries"))
WAIVERS = CANARY_DIR / "waivers.json"
FAILS = CANARY_DIR / "fails.json"


def gh(*args: str, check: bool = True) -> str:
    return subprocess.run(["gh", *args], check=check, capture_output=True, text=True).stdout


def load_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def agents_sections() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    cur = None
    for line in (REPO_ROOT / "AGENTS.md").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            cur = m.group(1)
            out[cur] = []
        elif cur:
            out[cur].append(line)
    return out


def rules() -> dict[str, str]:
    """AGENTS.md の箇条書きに、出てくる順で ID を振る。AGENTS.md を直すと番号も変わるが、仕様は毎回作り直すので困らない。"""
    secs = agents_sections()
    found: dict[str, str] = {}
    for prefix, name, indent in (("CI", "Done means CI is green", "  - "),
                                 ("FS", "Forbidden shortcuts", "- "),
                                 ("PP", "Protected paths", "- ")):
        bullets = [l[len(indent):] for l in secs.get(name, []) if l.startswith(indent)]
        for i, text in enumerate(bullets, 1):
            found[f"{prefix}{i}"] = text.strip()
    for l in secs.get("Changes that need a human", []):
        if l.startswith("- ") and "dependencies.md" in l:
            found["DEP1"] = l[2:].strip()
    return found


def parse_spec(path: Path) -> list[dict]:
    cases, cur = [], None
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^###\s+([a-z0-9][a-z0-9-]*)\s*$", line)
        if m:
            cur = {"id": m.group(1)}
            cases.append(cur)
            continue
        m = re.match(r"^-\s+(rule|change|diff|red):\s*(.*)$", line)
        if cur is not None and m:
            key, value = m.group(1), m.group(2).strip()
            if key == "diff":
                value = value.strip("`")
            elif key == "red":
                value = set() if value in ("なし", "none", "") else {v.strip() for v in value.split(",")}
            elif key == "rule":
                value = set() if value in ("なし", "none", "") else {v.strip() for v in value.split(",")}
            cur[key] = value
    return cases


def validate(spec: Path) -> int:
    errors: list[str] = []
    required = set(os.environ.get("REQUIRED_CHECKS", "").split())
    known = rules()
    waived = load_json(WAIVERS, {})
    cases = parse_spec(spec) if spec.exists() else []
    if not cases:
        errors.append(f"{spec}: no cases")
    ids = [c["id"] for c in cases]
    for dup in {i for i in ids if ids.count(i) > 1}:
        errors.append(f"case id {dup} appears more than once")
    covered: set[str] = set()
    for c in cases:
        missing = {"rule", "change", "diff", "red"} - c.keys()
        if missing:
            errors.append(f"{c['id']}: lacks {', '.join(sorted(missing))}")
            continue
        try:
            re.compile(c["diff"])
        except re.error as e:
            errors.append(f"{c['id']}: diff is not a valid regex ({e})")
        for r in c["rule"] - known.keys():
            errors.append(f"{c['id']}: unknown rule {r}")
        for r in c["red"] - required:
            errors.append(f"{c['id']}: red names {r}, which is not in REQUIRED_CHECKS")
        if c["rule"] and not c["red"]:
            errors.append(f"{c['id']}: tests a rule but expects every check to pass")
        covered |= c["rule"]
    if not any(c.get("red") == set() and c.get("rule") == set() for c in cases):
        errors.append("no control case (rule: なし, red: なし) that proves CI passes a correct change")
    for r in sorted(known.keys() - covered - waived.keys()):
        errors.append(f"rule {r} is not tested by any case: {known[r]}")
    if errors:
        print("canary spec: FAILED")
        print("\n".join(f"- {e}" for e in errors))
        return 1
    print(f"canary spec: OK ({len(cases)} cases, {len(covered)} rules covered, {len(waived)} waived)")
    return 0


def find_pr(case_id: str) -> dict | None:
    prs = json.loads(gh("pr", "list", "--head", f"canary/{case_id}", "--state", "open",
                        "--json", "number,url,baseRefName,labels"))
    return prs[0] if prs else None


def wait_checks(number: int, deadline: float) -> list[dict]:
    while True:
        checks = json.loads(gh("pr", "checks", str(number), "--json", "name,bucket", check=False) or "[]")
        if (checks and not any(c["bucket"] == "pending" for c in checks)) or time.time() > deadline:
            return checks
        time.sleep(30)


def check(branch: str, spec: Path, out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    required = os.environ.get("REQUIRED_CHECKS", "").split()
    deadline = time.time() + int(os.environ.get("CANARY_TIMEOUT_SECONDS", "5400"))
    threshold = int(os.environ.get("CANARY_ARBITER_AFTER", "2"))
    known = rules()
    fails = load_json(FAILS, {})
    report, feedback, prs, arbitrate, ok = [], [], [], [], True
    for case in parse_spec(spec):
        pr = find_pr(case["id"])
        problems: list[str] = []
        red: set[str] = set()
        if pr is None:
            problems.append("no open PR from canary/" + case["id"])
        else:
            prs.append(pr["number"])
            if pr["baseRefName"] != branch:
                problems.append(f"base is {pr['baseRefName']}, expected {branch}")
            diff = gh("pr", "diff", str(pr["number"]))
            (out / f"{case['id']}.diff").write_text(diff, encoding="utf-8")
            added = "\n".join(l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
            if not re.search(case["diff"], added, flags=re.M):
                problems.append(f"canary diff has no added line matching {case['diff']}")
            checks = {c["name"]: c["bucket"] for c in wait_checks(pr["number"], deadline)}
            (out / f"{case['id']}.checks.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")
            missing = [n for n in required if n not in checks or checks[n] == "pending"]
            if missing:
                problems.append("required checks not finished: " + ", ".join(missing))
            red = {n for n in required if checks.get(n) in ("fail", "cancel")}
            if red != case["red"]:
                problems.append(f"red = {sorted(red) or 'none'}, expected {sorted(case['red']) or 'none'}")
        fails[case["id"]] = fails.get(case["id"], 0) + 1 if problems else 0
        if problems:
            ok = False
            if fails[case["id"]] >= threshold:
                arbitrate.append(case["id"])
            rule_text = "; ".join(f"{r}: {known.get(r, '?')}" for r in sorted(case["rule"])) or "control (a correct change)"
            # 土台作り役への報告。カナリアの差分は渡さず、何が守られていないかだけを伝える
            feedback.append(f"- case `{case['id']}` / rule {rule_text}\n"
                            f"  - what the canary does: {case['change']}\n"
                            f"  - expected failing checks: {sorted(case['red']) or 'none'}; actual: {sorted(red) or 'none'}")
        report.append(f"| {case['id']} | {pr['url'] if pr else '-'} | {'OK' if not problems else '; '.join(problems)} |")
    FAILS.write_text(json.dumps(fails, indent=2), encoding="utf-8")
    (out / "prs.json").write_text(json.dumps(prs), encoding="utf-8")
    (out / "arbitrate.txt").write_text("\n".join(arbitrate), encoding="utf-8")
    (out / "feedback.md").write_text("\n".join(feedback), encoding="utf-8")
    table = "| case | PR | result |\n|---|---|---|\n" + "\n".join(report)
    (out / "report.md").write_text(table, encoding="utf-8")
    print(table)
    return 0 if ok else 1


def audit(log: Path) -> int:
    canary_prs = set()
    for f in CANARY_DIR.glob("round-*/prs.json"):
        canary_prs |= set(json.loads(f.read_text(encoding="utf-8")))
    hits = []
    for line in log.read_text(encoding="utf-8").splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("type") != "assistant":
            continue
        for block in e.get("message", {}).get("content", []):
            if block.get("type") != "tool_use" or block.get("name") in ("Write", "Edit", "MultiEdit"):
                continue
            text = json.dumps(block.get("input", {}), ensure_ascii=False)
            if re.search(r"canar", text, flags=re.I) or str(CANARY_DIR) in text:
                hits.append(f"{block.get('name')}: {text[:200]}")
                continue
            for num in re.findall(r"\b(?:pr\s+(?:diff|view|checkout|checks)|pulls/)\s*(\d+)", text):
                if int(num) in canary_prs:
                    hits.append(f"{block.get('name')} looked at canary PR #{num}: {text[:200]}")
    if hits:
        print("audit: the bootstrap iteration looked for canaries")
        print("\n".join(f"- {h}" for h in hits))
        return 1
    print("audit: OK")
    return 0


def close() -> int:
    for pr in json.loads(gh("pr", "list", "--label", "loop:canary", "--state", "open", "--json", "number")):
        gh("pr", "close", str(pr["number"]), "--delete-branch", check=False)
    return 0


def waive(rule: str, reason: str) -> int:
    waived = load_json(WAIVERS, {})
    waived[rule] = reason
    WAIVERS.write_text(json.dumps(waived, indent=2, ensure_ascii=False), encoding="utf-8")
    return 0


def case(spec: Path, case_id: str) -> int:
    text = spec.read_text(encoding="utf-8")
    m = re.search(rf"^### {re.escape(case_id)}\s*$.*?(?=^### |\Z)", text, flags=re.M | re.S)
    print(m.group(0).strip() if m else "")
    return 0 if m else 1


def main(argv: list[str]) -> int:
    cmd, args = (argv[1] if len(argv) > 1 else ""), argv[2:]
    if cmd == "rules" and not args:
        print("\n".join(f"{k}: {v}" for k, v in rules().items()))
        return 0
    if cmd == "validate" and len(args) == 1:
        return validate(Path(args[0]))
    if cmd == "check" and len(args) == 3:
        return check(args[0], Path(args[1]), Path(args[2]))
    if cmd == "audit" and len(args) == 1:
        return audit(Path(args[0]))
    if cmd == "close" and not args:
        return close()
    if cmd == "waive" and len(args) == 2:
        return waive(*args)
    if cmd == "case" and len(args) == 2:
        return case(Path(args[0]), args[1])
    print(__doc__, file=sys.stderr)
    return 64


if __name__ == "__main__":
    sys.exit(main(sys.argv))

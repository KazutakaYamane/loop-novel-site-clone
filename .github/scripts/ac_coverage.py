"""CI の ac-coverage ジョブ。PR の本文の `AC:` 行にある受け入れ条件の ID ごとに、その ID のタグが付いたテストがあるかを確かめる。

タグの付け方(README.md の「テストと受け入れ条件」):
- Playwright: test("...", { tag: "@AC-F2-7" }, ...) または題名に @AC-F2-7
- Vitest: test か describe の題名に @AC-F5-1
- Pest: ->group('AC-F9-2')

テストの一覧は各ツール自身に出させたもの(コメントや、スイートに入らないファイルは数えない)を受け取る:
  --playwright-json  `npx playwright test --list --reporter=json` の出力
  --vitest-json      `npx vitest list --json` の出力
  --pest-groups      `vendor/bin/pest --list-groups` の出力
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ID = re.compile(r"AC-F\d+-\d+")


def strip_html_comments(text: str) -> str:
    return re.sub(r"<!--.*?-->", "", text, flags=re.S)


def parse_ac_line(body: str) -> list[str] | None:
    """PR の本文から `AC:` 行の ID を取り出す。行が無ければ None。ID 以外の語があれば ValueError。"""
    for line in strip_html_comments(body).splitlines():
        m = re.match(r"^\s*(?:[-*]\s*)?(?:\*\*)?AC(?:\*\*)?\s*[:：]\s*(.*)$", line)
        if not m:
            continue
        rest = m.group(1).strip()
        ids = ID.findall(rest)
        leftover = ID.sub("", rest)
        leftover = re.sub(r"[\s,、`]+", "", leftover)
        if leftover:
            raise ValueError(f"the AC: line contains something other than acceptance criteria IDs: {rest!r}")
        return list(dict.fromkeys(ids))
    return None


def issue_ac_ids(issue_body: str) -> list[str] | None:
    """issue の `## AC` 節にある ID。節が無ければ None。"""
    m = re.search(r"^##\s*AC\s*$(.*?)(?=^##\s|\Z)", strip_html_comments(issue_body), flags=re.M | re.S)
    if not m:
        return None
    return list(dict.fromkeys(ID.findall(m.group(1))))


def closing_issue(body: str) -> int | None:
    m = re.search(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)", strip_html_comments(body), flags=re.I)
    return int(m.group(1)) if m else None


def tags_in(text: str) -> set[str]:
    return {m.group(1) for m in re.finditer(r"@(AC-F\d+-\d+)(?!\d)", text)}


def playwright_tags(report: dict) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}

    def walk(suite: dict, titles: list[str]) -> None:
        here = titles + ([suite["title"]] if suite.get("title") else [])
        for spec in suite.get("specs", []):
            # test.skip() や test.fixme() で走らないテストは数えない
            if not any(t.get("expectedStatus") != "skipped" for t in spec.get("tests", [])):
                continue
            name = " > ".join(here + [spec.get("title", "")])
            tags = set()
            for t in spec.get("tags", []):
                tags |= tags_in(t if t.startswith("@") else "@" + t)
            tags |= tags_in(name)
            for tag in tags:
                found.setdefault(tag, []).append(f"e2e: {name}")
        for child in suite.get("suites", []):
            walk(child, here)

    for suite in report.get("suites", []):
        walk(suite, [])
    return found


def vitest_tags(items: list[dict]) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for item in items:
        name = item.get("name", "")
        for tag in tags_in(name):
            found.setdefault(tag, []).append(f"vitest: {name}")
    return found


def pest_tags(text: str) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for m in re.finditer(r"^\s*-\s*@?(AC-F\d+-\d+)\s+\((\d+) tests?\)", text, flags=re.M):
        if int(m.group(2)) > 0:
            found.setdefault(m.group(1), []).append(f"pest: group {m.group(1)} ({m.group(2)} tests)")
    return found


def merge(*maps: dict[str, list[str]]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for m in maps:
        for k, v in m.items():
            out.setdefault(k, []).extend(v)
    return out


def check(pr_body: str, requirements: str, tagged: dict[str, list[str]], issue_body: str | None) -> list[str]:
    errors: list[str] = []
    try:
        ids = parse_ac_line(pr_body)
    except ValueError as e:
        return [str(e)]
    if ids is None:
        return ["the PR description has no `AC:` line (.github/pull_request_template.md)"]
    known = set(ID.findall(requirements))
    for ac in ids:
        if ac not in known:
            errors.append(f"{ac}: not an acceptance criteria ID in docs/requirements.md")
        elif ac not in tagged:
            errors.append(f"{ac}: no test is tagged with it (Playwright tag @{ac}, Vitest title @{ac}, or Pest ->group('{ac}'))")
    if issue_body is not None:
        expected = issue_ac_ids(issue_body)
        if expected is not None:
            for ac in expected:
                if ac not in ids:
                    errors.append(f"{ac}: listed in the closed issue but missing from the PR's AC: line")
            for ac in ids:
                if ac not in expected:
                    errors.append(f"{ac}: on the PR's AC: line but not listed in the closed issue")
    return errors


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pr-body-file", required=True)
    ap.add_argument("--issue-body-file")
    ap.add_argument("--requirements", default="docs/requirements.md")
    ap.add_argument("--playwright-json", required=True)
    ap.add_argument("--vitest-json", required=True)
    ap.add_argument("--pest-groups", required=True)
    a = ap.parse_args(argv)

    pr_body = Path(a.pr_body_file).read_text(encoding="utf-8")
    issue_body = Path(a.issue_body_file).read_text(encoding="utf-8") if a.issue_body_file else None
    tagged = merge(
        playwright_tags(json.loads(Path(a.playwright_json).read_text(encoding="utf-8"))),
        vitest_tags(json.loads(Path(a.vitest_json).read_text(encoding="utf-8"))),
        pest_tags(Path(a.pest_groups).read_text(encoding="utf-8")),
    )
    errors = check(pr_body, Path(a.requirements).read_text(encoding="utf-8"), tagged, issue_body)
    try:
        ids = parse_ac_line(pr_body) or []
    except ValueError:
        ids = []
    for ac in ids:
        for t in tagged.get(ac, []):
            print(f"{ac}: {t}")
    if errors:
        for e in errors:
            print(f"::error::{e}")
        return 1
    print(f"ac-coverage: {len(ids)} acceptance criteria, each with at least one tagged test")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

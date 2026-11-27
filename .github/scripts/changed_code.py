"""PR が変えたコードを、mutation と visual のジョブに渡す形で出す。

  changed_code.py stryker-mutate --base origin/main
      frontend の本番コードのうち、PR が追加・変更した行を Stryker の --mutate の形(app/x.ts:3-7)で 1 行ずつ出す
  changed_code.py ui-check --base origin/main
      画面の見た目に関わるファイルを変えたのに、見た目の基準画像(e2e/visual/**.png)を足しも変えもしていなければ失敗する
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from difflib_git import FileDiff, pr_diff
from guard import is_js_prod


def line_ranges(lines: list[int]) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    for n in sorted(set(lines)):
        if ranges and n == ranges[-1][1] + 1:
            ranges[-1] = (ranges[-1][0], n)
        else:
            ranges.append((n, n))
    return ranges


# minimatch がグロブとみなすパス(Next.js の [id]、[...slug] など)。Stryker はグロブと行範囲の併用を設定エラーにする
GLOB_MAGIC = re.compile(r"[*?\[\]{}]|[!+@*?]\(")


def stryker_literal(path: str) -> str:
    # Stryker はパターンの \ を / に変えるので、バックスラッシュではなく 1 文字の文字クラスで特殊文字を打ち消す
    return re.sub(r"[*?\[\]{}()]", lambda m: f"[{m.group(0)}]", path)


def stryker_targets(files: dict[str, FileDiff]) -> list[str]:
    out = []
    for path, fd in sorted(files.items()):
        if fd.status == "D" or fd.binary or not is_js_prod(path) or path.endswith(".d.ts"):
            continue
        rel = path.removeprefix("frontend/")
        ranges = line_ranges([n for n, _ in fd.added])
        if not ranges:
            continue
        if GLOB_MAGIC.search(rel):
            # 行範囲を付けられないので、このファイルだけは全体を変異させる
            out.append(stryker_literal(rel))
            continue
        for start, end in ranges:
            out.append(f"{rel}:{start}-{end}")
    return out


def is_ui(path: str) -> bool:
    if not path.startswith("frontend/"):
        return False
    if path.startswith("frontend/public/"):
        return True
    return (is_js_prod(path) and path.endswith((".tsx", ".jsx"))) or path.endswith((".css", ".scss"))


def is_baseline(path: str) -> bool:
    return re.match(r"e2e/visual/.*\.png$", path) is not None


def ui_check(files: dict[str, FileDiff]) -> tuple[list[str], list[str]]:
    ui = sorted(p for p, fd in files.items() if is_ui(p))
    baselines = sorted(p for p, fd in files.items() if is_baseline(p) and fd.status != "D")
    return ui, baselines


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["stryker-mutate", "ui-check"])
    ap.add_argument("--base", required=True)
    ap.add_argument("--head", default="HEAD")
    a = ap.parse_args(argv)
    files = pr_diff(a.base, a.head)
    if a.command == "stryker-mutate":
        for t in stryker_targets(files):
            print(t)
        return 0
    ui, baselines = ui_check(files)
    if ui and not baselines:
        print("::error::This PR changes the UI but adds or updates no visual regression baseline under e2e/visual/ "
              "(AGENTS.md: visual regression tests for UI changes). UI files: " + ", ".join(ui))
        return 1
    print(f"visual: UI files changed: {len(ui)}, baselines added or updated: {len(baselines)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

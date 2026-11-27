"""Next.js の動的ルートのように、グロブの特殊文字を含むパスを Stryker に渡す形の試験。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from changed_code import stryker_targets  # noqa: E402
from difflib_git import parse_unified  # noqa: E402


def added(path: str, lines: list[int]) -> str:
    hunks = "".join(f"@@ -{n - 1},0 +{n} @@\n+x\n" for n in lines)
    return f"diff --git a/{path} b/{path}\nindex 1..2 100644\n--- a/{path}\n+++ b/{path}\n{hunks}"


class StrykerGlobPathTest(unittest.TestCase):
    def test_dynamic_route_is_passed_whole_file_with_escaped_brackets(self) -> None:
        diff = added("frontend/app/my/works/[id]/page.tsx", [3, 4, 9])
        self.assertEqual(stryker_targets(parse_unified(diff)), ["app/my/works/[[]id[]]/page.tsx"])

    def test_catch_all_route(self) -> None:
        diff = added("frontend/app/(site)/[...slug]/page.tsx", [1])
        self.assertEqual(stryker_targets(parse_unified(diff)), ["app/[(]site[)]/[[]...slug[]]/page.tsx"])

    def test_route_group_without_magic_keeps_line_ranges(self) -> None:
        diff = added("frontend/app/(site)/page.tsx", [2, 3])
        self.assertEqual(stryker_targets(parse_unified(diff)), ["app/(site)/page.tsx:2-3"])

    def test_plain_path_keeps_line_ranges(self) -> None:
        diff = added("frontend/lib/a.ts", [5, 6, 10])
        self.assertEqual(stryker_targets(parse_unified(diff)), ["lib/a.ts:5-6", "lib/a.ts:10-10"])


if __name__ == "__main__":
    unittest.main()

"""ac_coverage.py の試験。"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ac_coverage import check, issue_ac_ids, merge, parse_ac_line, pest_tags, playwright_tags, vitest_tags  # noqa: E402

REQUIREMENTS = "- AC-F1-1: a\n- AC-F1-2: b\n- AC-F2-7: c\n- AC-F5-1: d\n- AC-F5-10: e\n"


def spec(title: str, tags: list[str] | None = None, status: str = "passed") -> dict:
    return {"title": title, "tags": tags or [], "tests": [{"expectedStatus": status}]}


PLAYWRIGHT = {
    "suites": [
        {
            "title": "tests/login.spec.ts",
            "specs": [spec("logs out", ["@AC-F1-1"]), spec("skipped one", ["@AC-F2-7"], status="skipped")],
            "suites": [{"title": "demo @AC-F1-2", "specs": [spec("starts")], "suites": []}],
        }
    ]
}


class ParseTest(unittest.TestCase):
    def test_empty_ac_line(self) -> None:
        self.assertEqual(parse_ac_line("Closes #1\n\nAC:\n"), [])

    def test_ids_on_the_ac_line(self) -> None:
        self.assertEqual(parse_ac_line("AC: AC-F1-1, AC-F2-7 AC-F1-1"), ["AC-F1-1", "AC-F2-7"])

    def test_html_comment_is_ignored(self) -> None:
        self.assertEqual(parse_ac_line("AC: <!-- e.g. AC-F1-1 -->\n"), [])

    def test_missing_line(self) -> None:
        self.assertIsNone(parse_ac_line("Closes #1\n"))

    def test_non_id_text_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            parse_ac_line("AC: TBD")

    def test_issue_ac_section(self) -> None:
        body = "## AC\n\n- AC-F1-1\n- AC-F1-2\n\n## Depends on\n\n- AC-F9-9 mentioned elsewhere\n"
        self.assertEqual(issue_ac_ids(body), ["AC-F1-1", "AC-F1-2"])


class TagTest(unittest.TestCase):
    def test_playwright_tags_and_titles(self) -> None:
        found = playwright_tags(PLAYWRIGHT)
        self.assertIn("AC-F1-1", found)
        self.assertIn("AC-F1-2", found)

    def test_skipped_playwright_test_does_not_count(self) -> None:
        self.assertNotIn("AC-F2-7", playwright_tags(PLAYWRIGHT))

    def test_vitest_title(self) -> None:
        found = vitest_tags([{"name": "notation > @AC-F5-1 ruby", "file": "x"}, {"name": "@AC-F5-10 other", "file": "y"}])
        self.assertEqual(sorted(found), ["AC-F5-1", "AC-F5-10"])
        self.assertEqual(len(found["AC-F5-1"]), 1)

    def test_pest_groups(self) -> None:
        found = pest_tags(" INFO  Available test groups:\n\n - AC-F2-7 (2 tests)\n - arch (5 tests)\n - default (5 tests).\n")
        self.assertEqual(list(found), ["AC-F2-7"])


class CheckTest(unittest.TestCase):
    tagged = merge(playwright_tags(PLAYWRIGHT), pest_tags(" - AC-F2-7 (1 test)\n"))

    def test_empty_ac_passes(self) -> None:
        self.assertEqual(check("Closes #1\nAC:\n", REQUIREMENTS, {}, None), [])

    def test_every_id_tagged_passes(self) -> None:
        self.assertEqual(check("AC: AC-F1-1, AC-F2-7", REQUIREMENTS, self.tagged, None), [])

    def test_untagged_id_fails(self) -> None:
        errors = check("AC: AC-F1-1, AC-F5-1", REQUIREMENTS, self.tagged, None)
        self.assertEqual(len(errors), 1)
        self.assertIn("AC-F5-1", errors[0])

    def test_unknown_id_fails(self) -> None:
        errors = check("AC: AC-F99-1", REQUIREMENTS, self.tagged, None)
        self.assertIn("not an acceptance criteria ID", errors[0])

    def test_missing_ac_line_fails(self) -> None:
        self.assertIn("no `AC:` line", check("Closes #3", REQUIREMENTS, self.tagged, None)[0])

    def test_issue_ids_must_all_be_listed(self) -> None:
        errors = check("AC: AC-F1-1", REQUIREMENTS, self.tagged, "## AC\n\n- AC-F1-1\n- AC-F2-7\n")
        self.assertEqual(len(errors), 1)
        self.assertIn("AC-F2-7", errors[0])

    def test_ids_outside_the_issue_fail(self) -> None:
        errors = check("AC: AC-F1-1, AC-F2-7", REQUIREMENTS, self.tagged, "## AC\n\n- AC-F1-1\n")
        self.assertIn("not listed in the closed issue", errors[0])

    def test_issue_without_ac_section_is_not_compared(self) -> None:
        self.assertEqual(check("AC:", REQUIREMENTS, {}, "bootstrap issue body"), [])


if __name__ == "__main__":
    unittest.main()

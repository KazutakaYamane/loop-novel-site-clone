"""issues.py の分割の検証(AGENTS.md「Planning」)の試験。"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import issues  # noqa: E402


class OverlapTest(unittest.TestCase):
    def test_the_same_source_file_overlaps(self):
        self.assertTrue(issues.conflicts(["frontend/app/page.tsx"], ["frontend/app/page.tsx"]))
        self.assertTrue(issues.conflicts(["frontend/lib/auth/**"], ["frontend/lib/auth/session.ts"]))

    def test_different_files_in_one_directory_do_not_overlap(self):
        self.assertFalse(issues.conflicts(["e2e/tests/login.spec.ts"], ["e2e/tests/logout.spec.ts"]))

    def test_files_every_issue_only_adds_to_do_not_overlap(self):
        # ADR、README、ルートの定義、規則の追記は並列の PR が足し合うだけで、衝突は main の取り込みで解ける
        shared = ["docs/adr/**", "docs/adr/README.md", "README.md", "docs/harness/**", "backend/AGENTS.md",
                  "frontend/AGENTS.md", "backend/routes/api.php", "docs/kakuyomu-reference/**", "backend/database/migrations/**"]
        self.assertFalse(issues.conflicts(shared, shared))

    def test_a_broad_pattern_that_covers_a_shared_file_still_overlaps(self):
        self.assertTrue(issues.conflicts(["backend/routes/**"], ["backend/routes/web.php"]))


if __name__ == "__main__":
    unittest.main()

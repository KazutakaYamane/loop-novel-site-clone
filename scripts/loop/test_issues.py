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


class ApprovalTest(unittest.TestCase):
    REQUEST = ("4. 次の既存テストを変える承認をお願いします。\n\n" + issues.TEST_CHANGE_REQUEST + "\n"
               "- `backend/tests/Feature/Auth/DemoSessionTest.php`: 保存名の完全一致をやめる\n"
               "- `e2e/tests/login.spec.ts`: デモ読者で確かめる\n\n以上です。\n- `not/listed.ts`\n")

    def test_the_latest_request_lists_the_paths_and_reasons(self):
        comments = [{"body": issues.TEST_CHANGE_REQUEST + "\n- `old/OldTest.php`\n"}, {"body": "途中経過"}, {"body": self.REQUEST}]
        self.assertEqual(issues.latest_request(comments), [
            ("backend/tests/Feature/Auth/DemoSessionTest.php", "保存名の完全一致をやめる"),
            ("e2e/tests/login.spec.ts", "デモ読者で確かめる")])

    def test_only_the_owners_approval_comment_counts(self):
        # ループは bot のアカウントで動くので、ループが同じ形のコメントを書いても承認にならない
        body = issues.approval_comment([("e2e/tests/login.spec.ts", "デモ読者で確かめる")])
        comments = [{"author": {"login": "loop-bot"}, "body": issues.approval_comment([("e2e/tests/other.spec.ts", "")])},
                    {"author": {"login": "Owner"}, "body": body},
                    {"author": {"login": "owner"}, "body": "- `e2e/tests/plain.spec.ts`"}]
        self.assertEqual(issues.approved_tests(comments, "owner"), ["e2e/tests/login.spec.ts"])
        self.assertEqual(issues.approved_tests(comments, ""), [])

    def test_the_approval_reads_the_same_as_the_ci_guard(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / ".github/scripts"))
        import guard  # noqa: E402
        self.assertEqual(guard.APPROVAL_MARK, issues.APPROVAL_MARK)
        comments = [{"author": {"login": "owner"},
                     "body": issues.approval_comment([("e2e/tests/a.spec.ts", "理由: x"), ("backend/tests/Feature/BTest.php", "")])}]
        self.assertEqual(guard.approved_tests(comments, "owner"), issues.approved_tests(comments, "owner"))

    def test_only_test_case_files_can_be_approved(self):
        self.assertTrue(issues.is_test_case_file("backend/tests/Feature/Auth/DemoSessionTest.php"))
        self.assertTrue(issues.is_test_case_file("e2e/tests/login.spec.ts"))
        for path in ["backend/tests/Arch/ArchTest.php", "backend/tests/Pest.php", "e2e/tests/helpers.ts", "backend/app/User.php"]:
            self.assertFalse(issues.is_test_case_file(path), path)


if __name__ == "__main__":
    unittest.main()

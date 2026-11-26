"""guard.py の試験。一時的な git リポジトリに base と head を作り、guard を実際に走らせる。"""

from __future__ import annotations

import io
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import guard  # noqa: E402

ALLOWLIST = """| エコシステム | パッケージ | 制約 |
|---|---|---|
| composer | php | ^8.5 |
| composer | laravel/framework | ^13.0 |
| composer | pestphp/pest | ^5.0 |
| npm | next | ^16.0 |
| npm | vitest | ^5.0 |
| npm | @types/node | * |
"""


class Repo:
    def __init__(self, with_codeowners: bool = True) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.email", "t@example.com")
        self.git("config", "user.name", "t")
        base = {
            "scripts/loop/dependencies.md": ALLOWLIST,
            "backend/composer.json": '{"require": {"php": "^8.5", "laravel/framework": "^13.17"}, "require-dev": {"pestphp/pest": "^5.0"}}',
            "frontend/package.json": '{"dependencies": {"next": "16.4.6"}, "devDependencies": {"vitest": "^5.1.2", "@types/node": "^26"}}',
            "backend/tests/Feature/ExistingTest.php": "<?php\n\ntest('x', function () {\n    expect(1 + 1)->toBe(2);\n});\n",
            "frontend/app/page.test.tsx": 'test("a", () => { expect(sum(1, 1)).toBe(2); });\n',
            "frontend/app/page.tsx": "export default function Page() { return null; }\n",
            "backend/app/Models/User.php": "<?php\n\nclass User {}\n",
            "e2e/tests/existing.spec.ts": 'test("e", async () => {});\n',
            "e2e/visual/__screenshots__/top.png": "PNG",
            "docs/adr/0001-first.md": "# 1\n",
            "docs/adr/README.md": "| 1 | first |\n",
            "backend/AGENTS.md": "# rules\n- rule one\n",
            "backend/phpstan.neon": "parameters:\n    level: max\n",
            "AGENTS.md": "rules\n",
        }
        if with_codeowners:
            base[".github/CODEOWNERS"] = "* @owner\n"
        for path, text in base.items():
            self.write(path, text)
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "base")
        self.git("branch", "base")

    def git(self, *args: str) -> str:
        return subprocess.run(["git", *args], cwd=self.root, check=True, capture_output=True, text=True).stdout

    def write(self, path: str, text: str) -> None:
        p = self.root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)

    def delete(self, path: str) -> None:
        (self.root / path).unlink()

    def commit(self) -> None:
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", "head")

    def run_guard(self) -> tuple[int, str]:
        cwd = os.getcwd()
        os.chdir(self.root)
        buf = io.StringIO()
        try:
            with redirect_stdout(buf):
                code = guard.main(["--base", "base"])
        finally:
            os.chdir(cwd)
        return code, buf.getvalue()

    def close(self) -> None:
        self.tmp.cleanup()


class GuardTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = Repo()

    def tearDown(self) -> None:
        self.repo.close()

    def assertViolation(self, needle: str) -> None:
        self.repo.commit()
        code, out = self.repo.run_guard()
        self.assertEqual(code, 1, out)
        self.assertIn(needle, out)

    def assertClean(self) -> None:
        self.repo.commit()
        code, out = self.repo.run_guard()
        self.assertEqual(code, 0, out)


class ControlTest(GuardTestCase):
    def test_a_correct_change_passes(self) -> None:
        self.repo.write("backend/app/Services/Sum.php", "<?php\n\nfinal class Sum\n{\n    public function of(int $a, int $b): int\n    {\n        return $a + $b;\n    }\n}\n")
        self.repo.write("backend/tests/Unit/SumTest.php", "<?php\n\ntest('sums', function () {\n    expect((new Sum)->of(1, 2))->toBe(3);\n})->group('AC-F1-1');\n")
        self.repo.write("frontend/lib/format.ts", "export function format(n: number): string {\n  return n.toFixed(1);\n}\n")
        self.repo.write("frontend/lib/format.test.ts", 'test("formats @AC-F1-2", () => {\n  expect(format(1)).toBe("1.0");\n});\n')
        self.repo.write("e2e/tests/new.spec.ts", 'test("x", { tag: "@AC-F1-1" }, async ({ page }) => {\n  await expect(page.getByRole("heading")).toBeVisible();\n});\n')
        self.repo.write("docs/adr/0002-second.md", "# 2\n")
        self.repo.write("docs/adr/README.md", "| 1 | first |\n| 2 | second |\n")
        self.repo.write("backend/AGENTS.md", "# rules\n- rule one\n- rule two\n")
        self.repo.write("frontend/package.json", '{"dependencies": {"next": "^16.1.0"}, "devDependencies": {"vitest": "^5.1.2", "@types/node": "^26"}}')
        self.assertClean()


class ForbiddenPatternTest(GuardTestCase):
    def test_runningUnitTests_in_production_code(self) -> None:
        self.repo.write("backend/app/Models/User.php", "<?php\n\nclass User { public function x() { return app()->runningUnitTests() ? 1 : 2; } }\n")
        self.assertViolation("runningUnitTests")

    def test_node_env_test_branch_in_production_code(self) -> None:
        self.repo.write("frontend/app/page.tsx", 'export default function Page() { if (process.env.NODE_ENV === "test") return 1; return null; }\n')
        self.assertViolation("special-casing")

    def test_vitest_env_in_production_code(self) -> None:
        self.repo.write("frontend/lib/a.ts", "export const a = process.env.VITEST ? 1 : 2;\n")
        self.assertViolation("special-casing")

    def test_environment_testing_in_production_code(self) -> None:
        self.repo.write("backend/app/A.php", "<?php\nif (App::environment('testing')) { return; }\n")
        self.assertViolation("special-casing")

    def test_webdriver_detection(self) -> None:
        self.repo.write("frontend/lib/a.ts", "export const bot = navigator.webdriver;\n")
        self.assertViolation("automated browser")

    def test_pest_skip(self) -> None:
        self.repo.write("backend/tests/Unit/NewTest.php", "<?php\ntest('a', function () {\n    expect(f())->toBe(1);\n})->skip();\n")
        self.assertViolation("skipping")

    def test_pest_todo_and_only(self) -> None:
        self.repo.write("backend/tests/Unit/NewTest.php", "<?php\ntest('a')->todo();\ntest('b', fn () => expect(f())->toBe(1))->only();\n")
        self.assertViolation("skipping")

    def test_phpunit_mark_skipped(self) -> None:
        self.repo.write("backend/tests/Unit/NewTest.php", "<?php\n$this->markTestSkipped('later');\n")
        self.assertViolation("skipping")

    def test_js_skip_only_variants(self) -> None:
        for line in ['test.skip("a", () => {});', 'it.only("a", () => {});', 'describe.skip("a", () => {});',
                     'test.describe.only("a", () => {});', 'test.fixme("a", async () => {});', 'xit("a", () => {});',
                     'test.todo("a");', 'test.skipIf(true)("a", () => {});', 'test("a", async () => { test.skip(); });',
                     'test.fail("a", async () => {});']:
            with self.subTest(line=line):
                self.tearDown()
                self.setUp()
                self.repo.write("frontend/lib/a.test.ts", line + "\n")
                self.assertViolation("skipping")

    def test_e2e_skip(self) -> None:
        self.repo.write("e2e/tests/new.spec.ts", 'test.skip("x", async ({ page }) => {});\n')
        self.assertViolation("skipping")

    def test_group_exclusion_in_package_json(self) -> None:
        self.repo.write("frontend/package.json", '{"scripts": {"test": "vitest run --exclude app/**"}, "dependencies": {"next": "16.4.6"}, "devDependencies": {"vitest": "^5.1.2", "@types/node": "^26"}}')
        self.assertViolation("exclusion")

    def test_phpstan_ignore(self) -> None:
        self.repo.write("backend/app/A.php", "<?php\n/** @phpstan-ignore-next-line */\n$a = 1;\n")
        self.assertViolation("suppressing")

    def test_phpstan_ignore_identifier(self) -> None:
        self.repo.write("backend/app/A.php", "<?php\n$a = foo(); // @phpstan-ignore argument.type\n")
        self.assertViolation("suppressing")

    def test_eslint_disable(self) -> None:
        self.repo.write("frontend/lib/a.ts", "// eslint-disable-next-line no-console\nconsole.log(1);\n")
        self.assertViolation("suppressing")

    def test_ts_ignore_and_expect_error(self) -> None:
        for comment in ["// @ts-ignore", "// @ts-expect-error", "/* @ts-ignore */", "// @ts-nocheck"]:
            with self.subTest(comment=comment):
                self.tearDown()
                self.setUp()
                self.repo.write("frontend/lib/a.ts", f"{comment}\nexport const a: number = 'x';\n")
                self.assertViolation("suppressing")

    def test_any(self) -> None:
        for line in ["export const a: any = 1;", "export function f(x: any) { return x; }", "const b = c as any;",
                     "let d: Array<any> = [];", "let e: Record<string, any> = {};", "let f: any[] = [];", "type T = any;"]:
            with self.subTest(line=line):
                self.tearDown()
                self.setUp()
                self.repo.write("frontend/lib/a.ts", line + "\n")
                self.assertViolation("TypeScript any")

    def test_any_in_words_is_allowed(self) -> None:
        self.repo.write("frontend/lib/a.ts", '// any value is fine here\nexport const label = "Pick any";\nexport const company = 1;\n')
        self.assertClean()

    def test_assertion_on_literal(self) -> None:
        for path, line in [("frontend/lib/a.test.ts", "expect(true).toBe(true);"),
                           ("e2e/tests/n.spec.ts", "expect(1).toBe(1);"),
                           ("backend/tests/Unit/NTest.php", "<?php\n$this->assertTrue(true);"),
                           ("backend/tests/Unit/NTest.php", "<?php\nexpect(true)->toBeTrue();"),
                           ("backend/tests/Unit/NTest.php", "<?php\n$this->assertSame(1, 1);")]:
            with self.subTest(line=line):
                self.tearDown()
                self.setUp()
                self.repo.write(path, line + "\n")
                self.assertViolation("cannot fail")

    def test_pest_arch_expectations_on_namespaces_are_allowed(self) -> None:
        self.repo.write("backend/tests/Arch/NewArchTest.php", "<?php\narch('a')\n    ->expect('App')\n    ->toUseStrictTypes();\narch('b')->expect('App\\\\Models')->not->toUse(['env']);\n")
        self.assertClean()

    def test_pest_value_expectation_on_a_string_literal(self) -> None:
        self.repo.write("backend/tests/Unit/NTest.php", "<?php\nexpect('abc')->toBe('abc');\n")
        self.assertViolation("cannot fail")

    def test_zero_retries_is_allowed(self) -> None:
        self.repo.write("e2e/tests/new.spec.ts", "test.describe.configure({ retries: 0 });\n")
        self.assertClean()

    def test_self_comparison(self) -> None:
        self.repo.write("frontend/lib/a.test.ts", "expect(result).toEqual(result);\n")
        self.assertViolation("cannot fail")

    def test_no_assertion_marker(self) -> None:
        self.repo.write("backend/tests/Unit/NTest.php", "<?php\n$this->expectNotToPerformAssertions();\n")
        self.assertViolation("cannot fail")

    def test_waits_and_retries_in_tests(self) -> None:
        for path, line in [("e2e/tests/n.spec.ts", "await page.waitForTimeout(1000);"),
                           ("e2e/tests/n.spec.ts", "test.describe.configure({ retries: 2 });"),
                           ("e2e/tests/n.spec.ts", "await expect(async () => { check(); }).toPass();"),
                           ("e2e/tests/n.spec.ts", "await expect(x).toBeVisible({ timeout: 30000 });"),
                           ("frontend/lib/a.test.ts", 'test("a", { retry: 3 }, () => {});'),
                           ("frontend/lib/a.test.ts", "await new Promise((r) => setTimeout(r, 100));"),
                           ("backend/tests/Unit/NTest.php", "<?php\nsleep(1);"),
                           ("backend/tests/Unit/NTest.php", "<?php\ntest('a', fn () => expect(f())->toBe(1))->repeat(3);")]:
            with self.subTest(line=line):
                self.tearDown()
                self.setUp()
                self.repo.write(path, line + "\n")
                self.assertViolation("retrying or adding waits")

    def test_settimeout_allowed_in_production_ui(self) -> None:
        self.repo.write("frontend/lib/debounce.ts", "export const d = (f: () => void) => setTimeout(f, 100);\n")
        self.assertClean()


class HardCodedSpecialCaseTest(GuardTestCase):
    """テストの入力にだけ、テストが期待する値を返す特別扱い(Forbidden shortcuts の hard-coded expected values)。"""

    PHP_TEST = (
        "<?php\n\nuse App\\Support\\ReadingTime;\n\n"
        "test('読了時間', function () {\n"
        "    expect(ReadingTime::minutes(str_repeat('あ', 1200)))->toBe(3);\n"
        "    expect(ReadingTime::minutes(str_repeat('あ', 1000)))->toBe(2);\n"
        "});\n"
    )

    def php(self, body: str) -> str:
        return (
            "<?php\n\ndeclare(strict_types=1);\n\nnamespace App\\Support;\n\nclass ReadingTime\n{\n"
            "    public static function minutes(string $text): int\n    {\n" + body + "    }\n}\n"
        )

    def test_if_returning_the_expected_value_for_the_test_input(self) -> None:
        self.repo.write("backend/app/Support/ReadingTime.php", self.php(
            "        if (mb_strlen($text) === 1200) {\n            return 3;\n        }\n\n"
            "        return intdiv(mb_strlen($text), 500);\n"))
        self.repo.write("backend/tests/Unit/ReadingTimeTest.php", self.PHP_TEST)
        self.assertViolation("hard-coded")

    def test_if_on_one_line_and_literal_on_the_left(self) -> None:
        self.repo.write("backend/app/Support/ReadingTime.php", self.php(
            "        if (1200 == mb_strlen($text)) return 3;\n        return intdiv(mb_strlen($text), 500);\n"))
        self.repo.write("backend/tests/Unit/ReadingTimeTest.php", self.PHP_TEST)
        self.assertViolation("hard-coded")

    def test_ternary_in_typescript(self) -> None:
        self.repo.write("frontend/lib/reading-time.ts",
                        "export function minutes(text: string): number {\n"
                        "  return text.length === 1200\n    ? 3\n    : Math.floor(text.length / 500);\n}\n")
        self.repo.write("frontend/lib/reading-time.test.ts",
                        'test("minutes", () => {\n  expect(minutes("あ".repeat(1200))).toBe(3);\n});\n')
        self.assertViolation("hard-coded")

    def test_string_input_without_braces_in_typescript(self) -> None:
        self.repo.write("frontend/lib/slug.ts",
                        'export function slug(title: string): string {\n  if (title === "Hello World") return "hello_world";\n'
                        '  return title.toLowerCase().replace(/ /g, "-");\n}\n')
        self.repo.write("frontend/lib/slug.test.ts",
                        'test("slug", () => {\n  expect(slug("Hello World")).toBe("hello_world");\n});\n')
        self.assertViolation("hard-coded")

    def test_test_title_in_production_code(self) -> None:
        self.repo.write("backend/app/Support/Title.php",
                        "<?php\n\nfunction title(string $name): bool\n{\n    return $name === '作品のタイトルを保存する';\n}\n")
        self.repo.write("backend/tests/Unit/TitleTest.php",
                        "<?php\n\ntest('作品のタイトルを保存する', function () {\n    expect(title('x'))->toBeFalse();\n});\n")
        self.assertViolation("test name")

    def test_base_case_with_a_trivial_literal_is_allowed(self) -> None:
        self.repo.write("backend/app/Support/ReadingTime.php", self.php(
            "        if ($text === '') {\n            return 0;\n        }\n\n"
            "        return intdiv(mb_strlen($text) + 499, 500);\n"))
        self.repo.write("backend/tests/Unit/ReadingTimeTest.php",
                        "<?php\n\ntest('空', function () {\n    expect(ReadingTime::minutes(''))->toBe(0);\n"
                        "    expect(ReadingTime::minutes(str_repeat('あ', 1200)))->toBe(3);\n});\n")
        self.assertClean()

    def test_label_mapping_is_allowed(self) -> None:
        self.repo.write("frontend/lib/status-label.ts",
                        'export function statusLabel(status: string): string {\n  if (status === "draft") {\n    return "下書き";\n  }\n'
                        '  return "公開中";\n}\n')
        self.repo.write("frontend/lib/status-label.test.ts",
                        'test("labels", () => {\n  expect(statusLabel("draft")).toBe("下書き");\n'
                        '  expect(statusLabel("public")).toBe("公開中");\n});\n')
        self.assertClean()

    def test_literal_that_no_test_uses_is_allowed(self) -> None:
        self.repo.write("backend/app/Support/ReadingTime.php", self.php(
            "        if (mb_strlen($text) === 100000) {\n            return 200;\n        }\n\n"
            "        return intdiv(mb_strlen($text) + 499, 500);\n"))
        self.repo.write("backend/tests/Unit/ReadingTimeTest.php", self.PHP_TEST)
        self.assertClean()


class ProtectedPathTest(GuardTestCase):
    def test_modifying_an_existing_test(self) -> None:
        self.repo.write("backend/tests/Feature/ExistingTest.php", "<?php\n\ntest('x', function () {\n    expect(1 + 1)->toBe(3);\n});\n")
        self.assertViolation("backend/tests/Feature/ExistingTest.php: [Protected paths]")

    def test_deleting_an_existing_test(self) -> None:
        self.repo.delete("frontend/app/page.test.tsx")
        self.assertViolation("frontend/app/page.test.tsx: [Protected paths]")

    def test_renaming_an_existing_e2e_test(self) -> None:
        self.repo.git("mv", "e2e/tests/existing.spec.ts", "e2e/tests/renamed.spec.ts")
        self.assertViolation("e2e/tests/existing.spec.ts: [Protected paths]")

    def test_updating_a_visual_baseline(self) -> None:
        self.repo.write("e2e/visual/__screenshots__/top.png", "PNG2")
        self.assertViolation("e2e/visual/__screenshots__/top.png: [Protected paths]")

    def test_check_configuration(self) -> None:
        for path in ["backend/phpstan.neon", "backend/phpstan-baseline.neon", "frontend/eslint.config.mjs", "frontend/tsconfig.json",
                     "backend/infection.json5", "frontend/stryker.config.mjs", "backend/phpunit.xml", "frontend/vitest.config.mts",
                     "e2e/playwright.config.ts", ".github/workflows/ci.yml", ".claude/settings.json", "scripts/loop/config",
                     "AGENTS.md", "CLAUDE.md", "docs/requirements.md", "docs/kakuyomu-reference.md", ".gitignore",
                     "metrics/metrics.jsonl", ".github/CODEOWNERS"]:
            with self.subTest(path=path):
                self.tearDown()
                self.setUp()
                self.repo.write(path, "changed\n")
                self.assertViolation(f"{path}: [Protected paths]")

    def test_existing_adr(self) -> None:
        self.repo.write("docs/adr/0001-first.md", "# 1 changed\n")
        self.assertViolation("docs/adr/0001-first.md: [Protected paths]")

    def test_removing_an_existing_rule(self) -> None:
        self.repo.write("backend/AGENTS.md", "# rules\n- rule one changed\n")
        self.assertViolation("backend/AGENTS.md: [Protected paths]")

    def test_new_frontend_agents_md_is_allowed(self) -> None:
        self.repo.write("frontend/AGENTS.md", "# new rules\n")
        self.assertClean()

    def test_bootstrap_without_codeowners_on_base_is_exempt(self) -> None:
        self.repo.close()
        self.repo = Repo(with_codeowners=False)
        self.repo.write("backend/phpstan.neon", "changed\n")
        self.repo.write("backend/tests/Feature/ExistingTest.php", "<?php\n// changed\n")
        self.assertClean()


class DependencyTest(GuardTestCase):
    def test_unlisted_package(self) -> None:
        self.repo.write("frontend/package.json", '{"dependencies": {"next": "16.4.6", "left-pad": "^1.0.0"}, "devDependencies": {"vitest": "^5.1.2", "@types/node": "^26"}}')
        self.assertViolation("left-pad")

    def test_upgrade_beyond_the_allowed_major(self) -> None:
        self.repo.write("backend/composer.json", '{"require": {"php": "^8.5", "laravel/framework": "^14.0"}, "require-dev": {"pestphp/pest": "^5.0"}}')
        self.assertViolation("laravel/framework")

    def test_unlisted_composer_package(self) -> None:
        self.repo.write("backend/composer.json", '{"require": {"php": "^8.5", "laravel/framework": "^13.17", "guzzlehttp/guzzle": "^7.0"}, "require-dev": {"pestphp/pest": "^5.0"}}')
        self.assertViolation("guzzlehttp/guzzle")

    def test_new_package_json_with_unlisted_dependency(self) -> None:
        self.repo.write("tools/package.json", '{"devDependencies": {"lodash": "^4.0.0"}}')
        self.assertViolation("lodash")

    def test_git_url_dependency(self) -> None:
        self.repo.write("frontend/package.json", '{"dependencies": {"next": "github:vercel/next.js"}, "devDependencies": {"vitest": "^5.1.2", "@types/node": "^26"}}')
        self.assertViolation("next")

    def test_overrides(self) -> None:
        self.repo.write("frontend/package.json", '{"dependencies": {"next": "16.4.6"}, "devDependencies": {"vitest": "^5.1.2", "@types/node": "^26"}, "overrides": {"react": "18.0.0"}}')
        self.assertViolation("overrides")

    def test_removing_a_dependency_is_allowed(self) -> None:
        self.repo.write("frontend/package.json", '{"dependencies": {"next": "16.4.6"}, "devDependencies": {"@types/node": "^26"}}')
        self.assertClean()


if __name__ == "__main__":
    unittest.main()

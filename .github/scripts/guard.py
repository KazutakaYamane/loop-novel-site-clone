"""CI の guard ジョブ。AGENTS.md の次の規則を、PR の差分(base...head)に対して機械的に確かめる。

1. Forbidden shortcuts: 追加された行に禁止パターンがないか
2. Protected paths: 保護されたパスを変えていないか(base に .github/CODEOWNERS があるときだけ)
3. 依存: composer.json と package.json の依存の追加・変更が scripts/loop/dependencies.md の表に収まるか

使い方: python3 .github/scripts/guard.py --base origin/main [--head HEAD]
違反があれば一覧を出して終了コード 1 で終わる。
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import re
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from difflib_git import FileDiff, git, pr_diff, show
from semver_range import Unparseable, is_subset

# ---------------------------------------------------------------------------
# ファイルの分類
# ---------------------------------------------------------------------------

JS_EXT = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts")


def is_php_test(p: str) -> bool:
    return p.startswith("backend/tests/") and p.endswith(".php")


def is_js_test(p: str) -> bool:
    if not p.endswith(JS_EXT):
        return False
    if p.startswith("e2e/"):
        return not re.match(r"e2e/playwright\.config\.", p)
    if p.startswith("frontend/"):
        name = p.rsplit("/", 1)[-1]
        return (
            re.search(r"\.(test|spec)\.[cm]?[jt]sx?$", name) is not None
            or "/__tests__/" in p
            or "/__mocks__/" in p
            or name.startswith("vitest.setup.")
        )
    return False


def is_php_prod(p: str) -> bool:
    return p.startswith("backend/") and p.endswith(".php") and not is_php_test(p) and "/vendor/" not in p


def is_js_prod(p: str) -> bool:
    return (
        p.startswith("frontend/")
        and p.endswith(JS_EXT)
        and not is_js_test(p)
        and "/node_modules/" not in p
        and not re.match(r"frontend/[^/]+\.config\.[cm]?[jt]s$", p)
    )


def is_ts(p: str) -> bool:
    return p.endswith((".ts", ".tsx", ".mts", ".cts"))


def is_code(p: str) -> bool:
    return p.endswith((".php", ".neon", ".json5", ".xml", ".json", ".yml", ".yaml", *JS_EXT))


def is_test(p: str) -> bool:
    return is_php_test(p) or is_js_test(p)


def is_test_runner_config(p: str) -> bool:
    """テストの走らせ方を決めるファイル。ここでテストを除外・再試行させられる。"""
    name = p.rsplit("/", 1)[-1]
    return (
        name in ("package.json", "composer.json", "phpunit.xml", "phpunit.xml.dist", "infection.json5")
        or re.match(r"(playwright|vitest|stryker|vite)\.config\.", name) is not None
        or p.startswith(".github/workflows/")
    )


# guard 自身とその試験、ワークフローは禁止パターンを文字列として含むので、パターンの検査から外す。
# これらは保護パス(.github/)なので、変更は 2 の検査と CODEOWNERS で止まる
PATTERN_EXEMPT = (".github/",)


def pattern_target(p: str) -> bool:
    if p.startswith(PATTERN_EXEMPT):
        return False
    if p.endswith(".md"):
        return False
    return is_code(p)


# ---------------------------------------------------------------------------
# 1. 禁止パターン
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Rule:
    rule: str  # AGENTS.md のどの項目か
    what: str
    regex: re.Pattern[str]
    applies: Callable[[str], bool]


def r(p: str, flags: int = 0) -> re.Pattern[str]:
    return re.compile(p, flags)


LIT_JS = r"""(?:true|false|null|undefined|NaN|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|`[^`$]*`)"""
LIT_PHP = r"""(?:true|false|null|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*")"""
SPECIAL = "Forbidden shortcuts: special-casing production code for tests"
SKIP = "Forbidden shortcuts: skipping or disabling tests"
SUPPRESS = "Forbidden shortcuts: suppressing checks"
WEAK = "Tests: assertions that cannot fail"
RETRY = "Forbidden shortcuts: retrying or adding waits"

RULES: list[Rule] = [
    # --- テスト環境での特別扱い(本番のコードだけ) ---
    Rule(SPECIAL, "runningUnitTests()", r(r"runningUnitTests\s*\("), is_php_prod),
    Rule(SPECIAL, "environment check for testing", r(r"environment\s*\(\s*\[?\s*['\"](testing|test|ci|e2e)['\"]", re.I), is_php_prod),
    Rule(SPECIAL, "string literal naming a test environment or tool",
         r(r"""['"](testing|test|e2e|ci|playwright|pest|phpunit|dusk|vitest|jest|stryker|infection)['"]""", re.I),
         lambda p: is_php_prod(p) or is_js_prod(p)),
    Rule(SPECIAL, "reads $_ENV/$_SERVER/getenv directly", r(r"\$_(ENV|SERVER)\s*\[|\bgetenv\s*\("), is_php_prod),
    Rule(SPECIAL, "environment variable that only test runners set",
         r(r"\b(?:process\.env|import\.meta\.env)\s*(?:\.\s*|\[\s*['\"])(VITEST\w*|JEST_WORKER_ID|PLAYWRIGHT\w*|CI|GITHUB_ACTIONS|TEST\w*|MODE)\b"),
         is_js_prod),
    Rule(SPECIAL, "NODE_ENV compared with test", r(r"NODE_ENV\W{1,8}['\"`]test|['\"`]test['\"`]\W{1,8}(?:process\.env\.)?NODE_ENV"),
         lambda p: is_js_prod(p) or is_php_prod(p)),
    Rule(SPECIAL, "detects an automated browser", r(r"navigator\s*\.\s*webdriver|HeadlessChrome|\bplaywright\b|\bwebdriver\b", re.I),
         lambda p: is_js_prod(p) or is_php_prod(p)),
    # --- テストを飛ばす・止める ---
    Rule(SKIP, "Pest/PHPUnit skip, todo or only", r(r"->\s*(skip\w*|todo|wip)\s*\(|->\s*only\w*\s*\(\s*\)|\bmarkTest(Skipped|Incomplete)\b|#\[\s*Requires\w*"), is_php_test),
    Rule(SKIP, "JS test skip, only, todo, fixme or fail", r(
        r"\b(?:test|it|describe|suite|context|bench|step)(?:\s*\.\s*\w+)*\s*\.\s*(skip|only|todo|fixme|fails?|skipIf|runIf)\b"
        r"|\b(?:xit|xtest|xdescribe|fit|fdescribe)\s*\("
        r"|\btestInfo\s*\.\s*(skip|fixme|fail)\b|\.\s*skip\s*\(\s*\)"), is_js_test),
    Rule(SKIP, "test exclusion option", r(
        r"--exclude-group|excludeGroup|<exclude>|--grep-invert|grepInvert|testIgnore|--testPathIgnorePatterns|--exclude\b|--passWithNoTests|passWithNoTests\s*:\s*true|allowOnly\s*:\s*true|--allow-only|--no-fail-on|failOn\w+=\"false\""),
         lambda p: is_test_runner_config(p) or is_test(p)),
    # --- 検査を黙らせる ---
    Rule(SUPPRESS, "PHPStan/Psalm suppression", r(r"@phpstan-ignore|phpstan-ignore-(line|next-line)|@psalm-suppress|\bignoreErrors\s*:|phpstan-baseline|@SuppressWarnings"), lambda p: True),
    Rule(SUPPRESS, "ESLint inline configuration", r(r"eslint-disable|eslint-enable|/\*\s*eslint\s|/\*\s*global\s"), lambda p: True),
    Rule(SUPPRESS, "TypeScript suppression comment", r(r"@ts-(ignore|expect-error|nocheck)"), lambda p: True),
    Rule(SUPPRESS, "coverage or mutation suppression", r(r"@codeCoverageIgnore|@infection-ignore|Stryker\s+(disable|restore)|istanbul\s+ignore|[cv]8\s+ignore", re.I), lambda p: True),
    Rule(SUPPRESS, "TypeScript any", r(r"(?:[:<,|&=]|\bas|\bextends|\bkeyof)\s*any\b(?!-)|\bany\s*\[\s*\]"), is_ts),
    # --- 失敗しようのない確認 ---
    Rule(WEAK, "expect() on a literal", r(rf"\bexpect\s*\(\s*{LIT_JS}\s*\)"), is_js_test),
    Rule(WEAK, "value compared with itself", r(
        r"\bexpect\s*\(\s*([\w$.\[\]'\"]+?)\s*\)\s*(?:\.\s*not\s*)?\.\s*(?:toBe|toEqual|toStrictEqual)\s*\(\s*\1\s*\)"), is_js_test),
    # Pest の arch() は expect('App') のように名前空間の文字列を受け取るので、文字列は値の確認が続くときだけ止める
    Rule(WEAK, "expect() on a literal", r(
        r"(?<![>\w$])expect\s*\(\s*(?:true|false|null|-?\d+(?:\.\d+)?)\s*\)"
        r"|\bexpect\s*\(\s*(?:'[^']*'|\"[^\"]*\")\s*\)\s*->\s*(?:not\s*->\s*)?+"
        r"(?!toUse|toHave(?:Suffix|Prefix|Method|Attribute|Constructor|Destructor|PrivateMethods|PublicMethods|ProtectedMethods|FileSystemPermissions|LineCountLessThan)"
        r"|toExtend|toImplement|toOnly|toBeUsed|toBeClasses|toBeInterfaces|toBeEnums|toBeTraits|toBeAbstract|toBeFinal|toBeReadonly"
        r"|toBeInvokable|toBeCasedCorrectly|toBeStringBackedEnums|toBeIntBackedEnums|ignoring|classes|interfaces|traits|enums)\w"), is_php_test),
    Rule(WEAK, "assertion on a literal", r(
        rf"assert(?:True|False|Null|NotNull|Empty|NotEmpty)\s*\(\s*{LIT_PHP}\s*[,)]|assert(?:Same|Equals|NotSame|NotEquals)\s*\(\s*({LIT_PHP})\s*,\s*{LIT_PHP}\s*[,)]"), is_php_test),
    Rule(WEAK, "value compared with itself", r(
        r"expect\s*\(\s*(\$[\w\->\[\]'\"]+)\s*\)\s*->\s*(?:not\s*->\s*)?(?:toBe|toEqual)\s*\(\s*\1\s*\)"
        r"|assert(?:Same|Equals)\s*\(\s*(\$[\w\->\[\]'\"]+)\s*,\s*\2\s*[,)]"), is_php_test),
    Rule(WEAK, "test that asserts nothing", r(r"expectNotToPerformAssertions|throwsNoExceptions|addToAssertionCount|requireAssertions\s*:\s*false"), lambda p: True),
    # --- 再試行と待ち時間 ---
    Rule(RETRY, "retries or repeated runs", r(r"\bretries\b(?!\s*:\s*0\b)|\bretry\b(?!\s*:\s*0\b)|--retries|--repeat-each|\brepeatEach\b|->\s*repeat\s*\(", re.I),
         lambda p: is_test(p) or is_test_runner_config(p)),
    Rule(RETRY, "fixed wait or timeout", r(
        r"waitForTimeout|\bsetTimeout\s*\(|\btimeout\s*:\s*\d|setTimeout\s*\(|\.slow\s*\(|\bsleep\s*\(|\busleep\s*\(|Sleep::(for|sleep|usleep)|\.toPass\s*\(|\bintervals\s*:"),
         is_test),
]


def strip_comment_ts(line: str) -> str:
    """TypeScript の行末コメントを落とす(`any` の誤検出を避ける)。文字列の中の // は残す。"""
    out, quote = [], None
    i = 0
    while i < len(line):
        c = line[i]
        if quote:
            out.append(c)
            if c == "\\" and i + 1 < len(line):
                out.append(line[i + 1])
                i += 1
            elif c == quote:
                quote = None
        elif c in "'\"`":
            quote = c
            out.append(c)
        elif line.startswith("//", i):
            break
        else:
            out.append(c)
        i += 1
    return "".join(out)


def check_patterns(files: dict[str, FileDiff]) -> list[str]:
    errors = []
    for path, fd in sorted(files.items()):
        if fd.binary or not pattern_target(path):
            continue
        for line_no, line in fd.added:
            for rule in RULES:
                if not rule.applies(path):
                    continue
                text = strip_comment_ts(line) if (rule.what == "TypeScript any") else line
                if rule.regex.search(text):
                    errors.append(f"{path}:{line_no}: [{rule.rule}] {rule.what}: {line.strip()[:160]}")
    return errors


# ---------------------------------------------------------------------------
# 2. 保護されたパス
# ---------------------------------------------------------------------------

# 追加も変更も削除も認めない(検査の設定、ハーネス、規則、要件書、CI が書くもの)
ANY_CHANGE = [
    ".github/**", ".claude/**", "scripts/loop/**", "AGENTS.md", "CLAUDE.md",
    "docs/requirements.md", "docs/kakuyomu-reference.md", ".gitignore", "metrics/**",
    "backend/phpstan.neon", "backend/phpstan*.neon", "backend/phpstan.neon.dist", "**/*baseline*.neon",
    "**/eslint.config.*", "**/.eslintrc*", "eslint.config.*", ".eslintrc*",
    "**/tsconfig*.json", "tsconfig*.json",
    "backend/infection.json5", "backend/infection.json*", "frontend/stryker.config.*", "frontend/stryker.conf.*",
    "backend/phpunit.xml", "backend/phpunit.xml.dist", "backend/pint.json",
    "frontend/vitest.config.*", "frontend/vitest.setup.*", "frontend/vite.config.*",
    "e2e/playwright.config.*",
]
# base にあるファイルの変更と削除を認めない(新しいファイルの追加は認める)
EXISTING = [
    "backend/tests/**", "frontend/**/*.test.*", "frontend/**/*.spec.*", "frontend/**/__tests__/**",
    "e2e/**", "docs/adr/**",
]
# base にあるファイルの行を消してはいけない(末尾などへの追記は認める)
APPEND_ONLY = ["backend/AGENTS.md", "frontend/AGENTS.md", "docs/adr/README.md"]


def match(path: str, patterns: list[str]) -> bool:
    for pat in patterns:
        if pat.endswith("/**") and (path + "/").startswith(pat[:-2]):
            return True
        if pat.startswith("**/") and (fnmatch.fnmatchcase(path, pat[3:]) or fnmatch.fnmatchcase(path, pat)):
            return True
        if fnmatch.fnmatchcase(path, pat):
            return True
    return False


def check_protected(files: dict[str, FileDiff], base: str) -> list[str]:
    errors = []
    for path, fd in sorted(files.items()):
        existed = show(base, path) is not None
        if path in APPEND_ONLY or match(path, APPEND_ONLY):
            if existed and (fd.status == "D" or fd.removed):
                errors.append(f"{path}: [Protected paths] existing lines were changed or removed; only additions are allowed")
            continue
        if match(path, ANY_CHANGE):
            errors.append(f"{path}: [Protected paths] check or harness configuration cannot be changed ({fd.status})")
        elif match(path, EXISTING) and existed:
            errors.append(f"{path}: [Protected paths] existing file cannot be changed or deleted ({fd.status})")
    return errors


# ---------------------------------------------------------------------------
# 3. 依存
# ---------------------------------------------------------------------------

COMPOSER_SECTIONS = ("require", "require-dev")
NPM_SECTIONS = ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "overrides", "resolutions")


def load_allowlist(text: str) -> dict[tuple[str, str], str]:
    allowed = {}
    for line in text.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == 3 and cells[0] in ("composer", "npm"):
            allowed[(cells[0], cells[1].strip("`"))] = cells[2].strip("`")
    return allowed


def deps_of(text: str | None, eco: str) -> dict[str, str]:
    if not text:
        return {}
    data = json.loads(text)
    out: dict[str, str] = {}
    for section in COMPOSER_SECTIONS if eco == "composer" else NPM_SECTIONS:
        entries = data.get(section) or {}
        if isinstance(entries, list):  # bundleDependencies などの配列形式
            entries = {name: "*" for name in entries}
        for name, constraint in entries.items():
            key = f"{section}:{name}" if section in ("overrides", "resolutions") else name
            out[key] = json.dumps(constraint) if not isinstance(constraint, str) else constraint
    return out


def manifest_paths(base: str, head: str) -> list[str]:
    paths = set()
    for ref in (base, head):
        for p in git("ls-tree", "-r", "--name-only", ref).splitlines():
            name = p.rsplit("/", 1)[-1]
            if "node_modules/" in p or "vendor/" in p:
                continue
            if name in ("package.json", "composer.json"):
                paths.add(p)
    return sorted(paths)


def check_dependencies(base: str, head: str, allowlist_text: str) -> list[str]:
    allowed = load_allowlist(allowlist_text)
    errors = []
    for path in manifest_paths(base, head):
        eco = "composer" if path.endswith("composer.json") else "npm"
        before = deps_of(show(base, path), eco)
        after = deps_of(show(head, path), eco)
        errors += compare_deps(path, eco, before, after, allowed)
    return errors


def compare_deps(path: str, eco: str, before: dict[str, str], after: dict[str, str],
                 allowed: dict[tuple[str, str], str]) -> list[str]:
    errors = []
    for name, constraint in sorted(after.items()):
        if before.get(name) == constraint:
            continue
        what = "added" if name not in before else f"changed from {before[name]!r}"
        if ":" in name and name.split(":", 1)[0] in ("overrides", "resolutions"):
            errors.append(f"{path}: [dependencies] {name} {what}: overrides are not in scripts/loop/dependencies.md")
            continue
        rule = allowed.get((eco, name))
        if rule is None:
            errors.append(f"{path}: [dependencies] {eco} package {name} {what} to {constraint!r} is not in scripts/loop/dependencies.md")
            continue
        try:
            ok = is_subset(constraint, rule, eco)
        except Unparseable as e:
            errors.append(f"{path}: [dependencies] {name} {constraint!r}: cannot verify the constraint ({e})")
            continue
        if not ok:
            errors.append(f"{path}: [dependencies] {name} {constraint!r} allows versions outside {rule!r} in scripts/loop/dependencies.md")
    return errors


# ---------------------------------------------------------------------------


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="base branch ref, e.g. origin/main")
    ap.add_argument("--head", default="HEAD")
    args = ap.parse_args(argv)

    files = pr_diff(args.base, args.head)
    errors: list[str] = []
    errors += check_patterns(files)

    if show(args.base, ".github/CODEOWNERS") is not None:
        errors += check_protected(files, args.base)
    else:
        print("guard: .github/CODEOWNERS is not on the base branch; protected paths are not checked (bootstrap)")

    # 許可リストは base のものを使う(PR が表を書き換えて通すのを防ぐ)
    allowlist = show(args.base, "scripts/loop/dependencies.md") or ""
    if not load_allowlist(allowlist):
        errors.append("scripts/loop/dependencies.md: [dependencies] the allowlist table is missing on the base branch")
    errors += check_dependencies(args.base, args.head, allowlist)

    print(f"guard: checked {len(files)} changed files against {args.base}")
    if errors:
        print(f"guard: {len(errors)} violation(s) of AGENTS.md:")
        for e in errors:
            print(f"  {e}")
            # GitHub の注釈として PR の該当行に出す
            m = re.match(r"([^:]+):(\d+): (.*)", e)
            if m:
                print(f"::error file={m.group(1)},line={m.group(2)}::{m.group(3)}")
            else:
                print(f"::error::{e}")
        return 1
    print("guard: no violations")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

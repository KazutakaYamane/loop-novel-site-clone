"""CI の guard ジョブ。AGENTS.md の次の規則を、PR の差分(base...head)に対して機械的に確かめる。

1. Forbidden shortcuts: 追加された行に禁止パターンがないか
2. Protected paths: 保護されたパスを変えていないか(base に .github/CODEOWNERS があるときだけ)
3. 依存: composer.json と package.json の依存の追加・変更が scripts/loop/dependencies.md の表に収まるか

使い方: python3 .github/scripts/guard.py --base origin/main [--head HEAD] [--issue-body-file FILE]
--issue-body-file は PR が閉じる issue の本文。その "## Likely files" に名指しされた見た目の基準画像だけ、変更を認める。
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
# 1b. テストの入力や名前の特別扱い(hard-coded expected values)
# ---------------------------------------------------------------------------
# 「テストの入力 X なら、テストが期待する Y を返し、それ以外は一般の計算をする」形を探す。
# 正しい一般の計算は変異テストでも見分けられないので、形で止める。
# 誤検出を抑えるため、次をすべて満たすときだけ止める:
#   - 本番コードの追加行の if か三項演算子が、値をリテラル X と == / === で比べている(0、1、-1、空文字は除く)
#   - その分岐はリテラル Y を返すだけである
#   - X と Y の両方が、PR が変えたテストファイルに現れる
#   - その後に(三項演算子なら else 側に)リテラルではない式を返す一般の経路がある

HARDCODED = "Forbidden shortcuts: special-casing production code for test inputs or test names"
_NUM = r"-?\d[\d_]*(?:\.\d+)?"
_STR = r"""'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`$\\\n]*`"""
_LIT = rf"(?:(?<![\w$.]){_NUM}(?![\w.])|{_STR})"
LITERAL = re.compile(_LIT)
FULL_LITERAL = re.compile(rf"\s*\(?\s*({_LIT})\s*\)?\s*;?\s*")
EQ = r"(?<![!=<>])===?(?!=)"
EQ_LITERAL = re.compile(rf"{EQ}\s*({_LIT})|({_LIT})\s*{EQ}")
IF_START = re.compile(r"(?<![\w$])if\s*\(")
IF_BODY = re.compile(rf"\s*(\{{)?\s*return\s+({_LIT})\s*;?\s*(\}})?")
RETURN = re.compile(r"(?<![\w$])return\b([^;\n]*)")
TERNARY_ELSE = re.compile(rf"\s*\)?\s*\?(?![.?>-])\s*({_LIT})\s*:\s*([^;\n]+)")
TEST_TITLE = re.compile(rf"(?<![\w$>])(?:test|it|describe|context)\s*(?:\.\s*\w+\s*)*\(\s*({_STR})")
TRIVIAL = {"n:0", "n:1", "n:-1", "s:"}
MATCH_START = re.compile(r"(?<![\w$>:])match\s*\(")
MATCH_ARM = re.compile(rf"(?:^|[{{,])\s*((?:{_LIT}\s*,\s*)*{_LIT})\s*=>\s*({_LIT})\s*(?=,|$)")
MATCH_DEFAULT = re.compile(r"(?:^|[{,])\s*default\s*=>\s*(.+?)\s*,?\s*$", re.S)
SWITCH_CASE = re.compile(rf"(?<![\w$])case\s+({_LIT})\s*:\s*(?:\{{\s*)?return\s+({_LIT})\s*;")


def literal_key(token: str) -> str:
    if token[0] in "'\"`":
        return "s:" + token[1:-1]
    try:
        n = float(token.replace("_", ""))
    except ValueError:
        return "n:" + token
    return "n:" + (str(int(n)) if n.is_integer() else repr(n))


def is_literal_expr(expr: str) -> bool:
    return FULL_LITERAL.fullmatch(expr) is not None


def closing_paren(text: str, start: int, pair: str = "()") -> int:
    """text[start] の開き括弧(pair[0])に対応する閉じ括弧の位置。文字列の中の括弧は数えない。"""
    depth, quote, i = 0, None, start
    while i < len(text):
        c = text[i]
        if quote:
            if c == "\\":
                i += 1
            elif c == quote:
                quote = None
        elif c in "'\"`":
            quote = c
        elif c == pair[0]:
            depth += 1
        elif c == pair[1]:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def general_return_follows(text: str, pos: int) -> bool:
    """pos より後の同じ関数の中に、リテラルではない式を返す return があるか(次の 3 つまで見る)。"""
    for i, m in enumerate(RETURN.finditer(text, pos)):
        if i >= 3:
            break
        expr = m.group(1).strip()
        if expr and not is_literal_expr(expr):
            return True
    return False


def special_cases(text: str, test_literals: set[str]) -> list[tuple[int, str]]:
    found: list[tuple[int, str]] = []

    def known(token: str) -> bool:
        key = literal_key(token)
        return key not in TRIVIAL and key in test_literals

    for m in IF_START.finditer(text):
        open_at = m.end() - 1
        close_at = closing_paren(text, open_at)
        if close_at < 0:
            continue
        cond = text[open_at + 1:close_at]
        if "typeof" in cond:
            continue
        body = IF_BODY.match(text, close_at + 1)
        if not body or (body.group(1) is not None) != (body.group(3) is not None):
            continue
        for eq in EQ_LITERAL.finditer(cond):
            x = eq.group(1) or eq.group(2)
            if known(x) and known(body.group(2)) and general_return_follows(text, body.end()):
                found.append((line_of(text, m.start()), f"if ... {x} returns {body.group(2)}"))
                break

    for eq in EQ_LITERAL.finditer(text):
        x = eq.group(1) or eq.group(2)
        # 右辺がリテラルのときはその直後、左辺のときは比べる相手の式の後に ? が来る
        after = eq.end() if eq.group(1) else re.compile(r"[\w$.\->()\[\]'\"]*").match(text, eq.end()).end()
        t = TERNARY_ELSE.match(text, after)
        if not t:
            continue
        else_expr = t.group(2).strip().rstrip(";)").strip()
        if known(x) and known(t.group(1)) and else_expr and not is_literal_expr(else_expr):
            found.append((line_of(text, eq.start()), f"{x} ? {t.group(1)} : ..."))

    # PHP の match: テストの入力の腕がテストの期待値を返し、default が一般の計算をする
    for m in MATCH_START.finditer(text):
        close_at = closing_paren(text, m.end() - 1)
        open_brace = text.find("{", close_at)
        if close_at < 0 or open_brace < 0 or text[close_at + 1:open_brace].strip():
            continue
        end = closing_paren(text, open_brace, "{}")
        if end < 0:
            continue
        body = text[open_brace + 1:end]
        default = MATCH_DEFAULT.search(body)
        if not default or is_literal_expr(default.group(1)):
            continue
        for arm in MATCH_ARM.finditer(body):
            if known(arm.group(2)) and any(known(x) for x in LITERAL.findall(arm.group(1))):
                found.append((line_of(text, open_brace + 1 + arm.start(1)), f"match arm {arm.group(1)} => {arm.group(2)}"))

    # switch: テストの入力の case がテストの期待値を返し、その後に一般の計算を返す
    for m in SWITCH_CASE.finditer(text):
        if known(m.group(1)) and known(m.group(2)) and general_return_follows(text, m.end()):
            found.append((line_of(text, m.start()), f"case {m.group(1)}: return {m.group(2)}"))
    return found


def check_special_cases(files: dict[str, FileDiff], head: str) -> list[str]:
    test_literals: set[str] = set()
    titles: set[str] = set()
    for path, fd in files.items():
        if fd.status == "D" or fd.binary or not is_test(path):
            continue
        text = show(head, path) or ""
        test_literals |= {literal_key(t) for t in LITERAL.findall(text)}
        for t in TEST_TITLE.findall(text):
            title = t[1:-1].strip()
            if len(title) >= 8:
                titles.add(title)

    errors = []
    for path, fd in sorted(files.items()):
        if fd.status == "D" or fd.binary or not (is_php_prod(path) or is_js_prod(path)):
            continue
        added = {n for n, _ in fd.added}
        text = show(head, path) or ""
        for line_no, what in special_cases(text, test_literals):
            if line_no in added:
                errors.append(f"{path}:{line_no}: [{HARDCODED}] hard-coded expected value: returns the value a test expects for a test input "
                              f"({what}). Compute it with the general code instead")
        for line_no, line in fd.added:
            for t in LITERAL.findall(line):
                if t[0] in "'\"`" and t[1:-1].strip() in titles:
                    errors.append(f"{path}:{line_no}: [{HARDCODED}] production code refers to a test name: {t}")
    return errors


# ---------------------------------------------------------------------------
# 2. 保護されたパス
# ---------------------------------------------------------------------------

# 追加も変更も削除も認めない(検査の設定、ハーネス、規則、要件書、CI が書くもの)
ANY_CHANGE = [
    ".github/**", ".claude/**", ".codex/**", ".agents/**", "scripts/loop/**", "AGENTS.md", "CLAUDE.md",
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

# 受け入れ条件のタグ(README.md の「テストと受け入れ条件」)。Pest の group('AC-F1-1') も数えるので @ は付けない
AC_TAG = re.compile(r"AC-F\d+-\d+")
SCREENSHOT = re.compile(r"^e2e/(?:.+/)?__screenshots__/.+\.png$")


def is_test_case_file(p: str) -> bool:
    """テストケースそのものを書くファイル。補助ファイル、設定、arch() の規則は含めない。"""
    if p.startswith("backend/tests/"):
        return p.endswith("Test.php") and not p.startswith("backend/tests/Arch/")
    name = p.rsplit("/", 1)[-1]
    if p.startswith(("frontend/", "e2e/")):
        return re.search(r"\.(test|spec)\.[cm]?[jt]sx?$", name) is not None
    return False


def untagged_test(path: str, base_text: str) -> bool:
    """受け入れ条件のタグを 1 つも持たない既存のテストファイル。回帰テストではないので変更と削除を認める(AGENTS.md の Tests)。"""
    return is_test_case_file(path) and AC_TAG.search(base_text) is None


def likely_files(issue_body: str) -> list[str]:
    """issue の "## Likely files" 節の各行のパス(scripts/loop/issues.py と同じ読み方)。"""
    m = re.search(r"^##\s*Likely files\s*$(.*?)(?=^##\s|\Z)", re.sub(r"<!--.*?-->", "", issue_body, flags=re.S),
                  flags=re.M | re.S | re.I)
    if not m:
        return []
    return [x.group(1) for x in re.finditer(r"^\s*-\s+`?([^`\s]+)`?", m.group(1), flags=re.M)]


APPROVAL_MARK = "<!-- loop:test-change-approval -->"


def approved_tests(comments: list[dict], approver: str) -> list[str]:
    """承認者(リポジトリのオーナー)が書いた承認のコメントに並ぶパス。ループは GitHub App で動くので、
    ループが同じ形のコメントを書いても作者が違い、承認にならない(docs/adr/0018)。"""
    paths: list[str] = []
    for c in comments:
        author = (c.get("author") or {}).get("login", "")
        body = c.get("body") or ""
        if not approver or author.lower() != approver.lower() or APPROVAL_MARK not in body:
            continue
        block = body.split(APPROVAL_MARK, 1)[1].lstrip("\n").split("\n\n", 1)[0]
        paths += [m.group(1) for m in re.finditer(r"^\s*-\s+`?([^`\s:]+)`?", block, flags=re.M)]
    return paths


def declared_baseline(path: str, declared: list[str]) -> bool:
    """issue が変えると名指しした基準画像か。e2e/visual/** のような広い指定では名指しにならない。"""
    return SCREENSHOT.match(path) is not None and match(path, [d for d in declared if "__screenshots__/" in d])


def match(path: str, patterns: list[str]) -> bool:
    for pat in patterns:
        if pat.endswith("/**") and (path + "/").startswith(pat[:-2]):
            return True
        if pat.startswith("**/") and (fnmatch.fnmatchcase(path, pat[3:]) or fnmatch.fnmatchcase(path, pat)):
            return True
        if fnmatch.fnmatchcase(path, pat):
            return True
    return False


def check_protected(files: dict[str, FileDiff], base: str, declared: list[str] | None = None,
                    approved: list[str] | None = None) -> list[str]:
    errors = []
    for path, fd in sorted(files.items()):
        base_text = show(base, path)
        existed = base_text is not None
        if path in APPEND_ONLY or match(path, APPEND_ONLY):
            if existed and (fd.status == "D" or fd.removed):
                errors.append(f"{path}: [Protected paths] existing lines were changed or removed; only additions are allowed")
            continue
        if match(path, ANY_CHANGE):
            errors.append(f"{path}: [Protected paths] check or harness configuration cannot be changed ({fd.status})")
        elif match(path, EXISTING) and existed:
            if untagged_test(path, base_text) or declared_baseline(path, declared or []):
                continue
            # 人間の承認はテストケースのファイルを 1 つずつ名指しする。補助ファイル、設定、arch() の規則は開かない
            if is_test_case_file(path) and path in (approved or []):
                continue
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
    ap.add_argument("--issue-body-file", help="the body of the issue the PR closes")
    ap.add_argument("--issue-comments-file", help="the comments of the issue the PR closes (JSON from gh issue view --json comments)")
    ap.add_argument("--approver", default="", help="the GitHub login whose approval comments open existing tests")
    args = ap.parse_args(argv)
    declared = likely_files(Path(args.issue_body_file).read_text(encoding="utf-8")) if args.issue_body_file else []
    comments = json.loads(Path(args.issue_comments_file).read_text(encoding="utf-8")).get("comments", []) \
        if args.issue_comments_file else []
    approved = approved_tests(comments, args.approver)

    files = pr_diff(args.base, args.head)
    errors: list[str] = []
    errors += check_patterns(files)
    errors += check_special_cases(files, args.head)

    if show(args.base, ".github/CODEOWNERS") is not None:
        errors += check_protected(files, args.base, declared, approved)
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

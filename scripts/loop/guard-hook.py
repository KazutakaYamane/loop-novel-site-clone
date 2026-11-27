"""PreToolUse の hook。AGENTS.md の「Protected paths」をローカルで守る。

オーケストレーターが --settings で毎回差し込むので、エージェントが .claude/ を書き換えても外せない。
最後の防衛線は CI の guard ジョブで、ここは早く止めるための一次防衛にすぎない(Bash の判定は推測)。

モード(LOOP_MODE):
  normal        通常の実装、計画、分け直し、批評
  bootstrap     保護パスの新規作成を許す。カナリアの仕様と PR を読ませない
  canary-spec   カナリアの仕様(LOOP_CANARY_DIR の中)だけを書ける
  canary        カナリア PR を作る。自分の worktree の中なら、人間が固定したもの以外は何でも変えてよい
  canary-read   判定役。何も書き換えられない

環境変数:
  LOOP_MODE         上のどれか
  LOOP_CANARY_DIR   カナリアの仕様と結果を置くディレクトリ
  LOOP_REPO_ROOT    オーケストレーターが動いているメインのチェックアウト
  LOOP_WT_DIR       worktree を置くディレクトリ
  LOOP_DEFAULT_REF  既存かどうかの判定に使う ref(例: origin/main)
  LOOP_APPROVED_TESTS  人間が承認した既存テストのパス(1 行に 1 つ。オーナーが issue に書いた承認のコメントから)
"""

import fnmatch
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# どのモードでも編集させない(初期設定で人間が書くもの)
HARD = ["scripts/loop/**", ".codex/**", "AGENTS.md", "CLAUDE.md", "docs/requirements.md",
        "docs/kakuyomu-reference.md", ".gitignore", ".github/ISSUE_TEMPLATE/**", "metrics/**"]
# bootstrap では新規作成だけ許す。通常は編集させない
PROTECTED = [".github/**", ".claude/**", ".agents/**", "backend/phpstan.neon", "backend/phpstan-baseline.neon",
             "backend/infection.json5", "backend/phpunit.xml", "frontend/stryker.config.*",
             "frontend/vitest.config.*", "**/tsconfig*.json", "tsconfig*.json", "**/eslint.config.*",
             "eslint.config.*", "**/.eslintrc*", "e2e/playwright.config.*"]
# 既存のものだけ守る(新規の追加は許す)
EXISTING_ONLY = ["backend/tests/**", "frontend/**/*.test.*", "e2e/**", "docs/adr/*.md"]
# 既存の行を消さない追記だけ許す。ADR の一覧は新しい ADR を足すたびに行が増える(CI の guard と同じ)
APPEND_ONLY = ["backend/AGENTS.md", "frontend/AGENTS.md", "docs/adr/README.md"]
# CI の guard(.github/scripts/guard.py)と同じ判定。AC のタグを持たない既存のテストファイルは変えてよい
AC_TAG = re.compile(r"AC-F\d+-\d+")
# 見た目の基準画像は issue の Likely files に名指しされていれば変えてよい。issue を読むのは CI の guard に任せる
SCREENSHOT = re.compile(r"^e2e/(?:.+/)?__screenshots__/.+\.png$")


def is_test_case_file(rel: str) -> bool:
    if rel.startswith("backend/tests/"):
        return rel.endswith("Test.php") and not rel.startswith("backend/tests/Arch/")
    if rel.startswith(("frontend/", "e2e/")):
        return re.search(r"\.(test|spec)\.[cm]?[jt]sx?$", rel.rsplit("/", 1)[-1]) is not None
    return False

# 人間の判断はメインのチャットがオーナーのアカウントで書く(scripts/loop/ctl.sh)。ループのエージェントには書かせない。
# 本当の防衛線は、CI の guard がコメントの作者を確かめること(ループは GitHub App で動く)
APPROVAL = re.compile(r"loop:(?:test-change-approval|human-answer)|\bctl\.sh[\"']?\s+(?:approve|answer|replan)\b"
                      r"|\bissues\.py[\"']?\s+(?:approve|answer|replan)\b", re.I)
# ループは GitHub App のトークンで動く(scripts/loop/bin/gh)。オーナーの認証に持ち替えさせない
OWNER_AUTH = re.compile(r"\bGH_TOKEN\s*=|\bGITHUB_TOKEN\s*=|\bunset\b[^;&|]*\b(?:GH_TOKEN|GH_CONFIG_DIR|GIT_CONFIG_\w+)"
                        r"|\bGH_CONFIG_DIR\s*=|\.config/gh\b|hosts\.yml|\bgh\s+auth\b|\benv\s+-u\b|\benv\s+-i\b"
                        r"|\.ssh/|\bGIT_SSH|\bsshCommand\b|credential\.helper|\bGIT_CONFIG_(?:COUNT|KEY|VALUE|GLOBAL|SYSTEM)", re.I)


def approved_tests() -> set[str]:
    return {l.strip() for l in os.environ.get("LOOP_APPROVED_TESTS", "").splitlines() if l.strip()}


def forbid_approval(text: str) -> None:
    if APPROVAL.search(text or ""):
        deny("only the human decides escalations; the main chat records them with the owner's account (scripts/loop/ctl.sh)")


def forbid_owner_auth(cmd: str) -> None:
    if OWNER_AUTH.search(cmd or ""):
        deny("the loop runs with its GitHub App token; do not change or bypass it")


WRITE_VERBS = re.compile(
    r"(\bsed\b[^|;&]*\s-i|\bperl\b[^|;&]*\s-i|\bmv\b|\bcp\b|\brm\b|\btee\b|(?<![0-9&])>{1,2}(?!&)"
    r"|\btruncate\b|\bgit\s+(checkout|restore|rm|mv|apply|reset)\b|\bchmod\b|\bln\b|\bpatch\b|\bdd\b)")
CHECK_WRAPPER = re.compile(
    r"""(^|[;&|(\n]\s*)["']?(?:\$\{?LOOP_DIR\}?|[^\s"';&|()<>]*scripts/loop)/check-output\.sh["']?(?=\s|$)""")


def deny(msg: str) -> None:
    if os.environ.get("LOOP_AGENT") == "codex":
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                          "permissionDecision": "deny", "permissionDecisionReason": msg}}))
        sys.exit(0)
    print(f"BLOCKED by scripts/loop/guard-hook.py: {msg} (AGENTS.md: Protected paths). "
          "If this change is required, escalate instead.", file=sys.stderr)
    sys.exit(2)


def match(rel: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatch(rel, p) or (p.endswith("/**") and rel.startswith(p[:-2])) for p in patterns)


def toplevel(cwd: str) -> Path:
    out = subprocess.run(["git", "-C", cwd, "rev-parse", "--show-toplevel"], capture_output=True, text=True)
    return Path(out.stdout.strip() or cwd).resolve()


def default_content(root: Path, rel: str) -> str | None:
    ref = os.environ.get("LOOP_DEFAULT_REF", "origin/main")
    # 基準画像などのバイナリも読むので、復号できないバイトは置き換える
    out = subprocess.run(["git", "-C", str(root), "show", f"{ref}:{rel}"], capture_output=True, text=True, errors="replace")
    return out.stdout if out.returncode == 0 else None


MODE = os.environ.get("LOOP_MODE", "normal")
CANARY_DIR = Path(os.environ.get("LOOP_CANARY_DIR", "/nonexistent")).resolve()


def hide_canaries(text: str) -> None:
    # 土台作り役にカナリアの中身を見せない(試験に合わせた CI を作らせないため)
    if MODE == "bootstrap" and (re.search(r"canar", text, flags=re.I) or str(CANARY_DIR) in text):
        deny("canaries are hidden from the bootstrap iteration; build CI from AGENTS.md instead")


def check_path(path: str, cwd: str, tool: dict, name: str) -> None:
    root = toplevel(cwd)
    p = Path(path) if os.path.isabs(path) else Path(cwd) / path
    p = p.resolve()
    main_root = Path(os.environ.get("LOOP_REPO_ROOT", "/nonexistent")).resolve()
    wt_dir = Path(os.environ.get("LOOP_WT_DIR", "/nonexistent")).resolve()
    if MODE == "canary-read":
        deny("the arbiter edits nothing")
    if MODE == "canary-spec":
        if not p.is_relative_to(CANARY_DIR):
            deny(f"the canary spec writer may write only under {CANARY_DIR}")
        return
    if p.is_relative_to(CANARY_DIR):
        deny("the canary spec is fixed once written")
    if not p.is_relative_to(root):
        handoff = os.environ.get("LOOP_HANDOFF")
        if os.environ.get("LOOP_AGENT") == "codex" and handoff:
            # Codex ワーカーに渡した書き込み先と、サンドボックスの許可範囲を揃える。
            if any(p.is_relative_to(Path(directory).resolve())
                   for directory in (handoff, os.environ.get("TMPDIR")) if directory):
                return
            deny(f"{p} is outside this worktree and its temporary directories")
        # 自分の worktree の外に書いてよいのは一時ファイルだけ(人間の版や他の worktree を壊さない)
        if p.is_relative_to(Path("/tmp").resolve()) and not (p.is_relative_to(main_root) or p.is_relative_to(wt_dir)):
            return
        deny(f"{p} is outside this worktree ({root})")
    rel = p.relative_to(root).as_posix()
    bootstrap = MODE in ("bootstrap", "canary")
    existing = default_content(root, rel)

    if match(rel, HARD):
        deny(f"{rel} is fixed by the human author")
    if MODE == "canary":
        return
    if match(rel, PROTECTED):
        # bootstrap は骨組みの設定(phpunit.xml、tsconfig.json など)を整える必要がある。正しさはカナリアで確かめる
        if bootstrap:
            return
        deny(f"{rel} is check or harness configuration")
    if match(rel, EXISTING_ONLY) and rel not in APPEND_ONLY and existing is not None and not bootstrap:
        if (is_test_case_file(rel) and not AC_TAG.search(existing)) or SCREENSHOT.match(rel):
            return
        if is_test_case_file(rel) and rel in approved_tests():
            return
        deny(f"{rel} exists on the default branch; changing it needs human approval")
    if match(rel, APPEND_ONLY) and existing is not None:
        if name == "Edit" and tool.get("old_string", "") not in tool.get("new_string", ""):
            deny(f"{rel}: only additions are allowed; keep the replaced text intact")
        if name == "Write":
            kept = set(tool.get("content", "").splitlines())
            lost = [l for l in existing.splitlines() if l.strip() and l not in kept]
            if lost:
                deny(f"{rel}: only additions are allowed; removed: {lost[0]!r}")


def check_bash(cmd: str) -> None:
    hide_canaries(cmd)
    forbid_approval(cmd)
    forbid_owner_auth(cmd)
    if os.environ.get("LOOP_LOCAL_REVIEW_FLOW") == "1" and re.search(r"\bgit\s+push\b|\bgh\s+pr\s+(?:create|edit|ready)\b", cmd):
        deny("the orchestrator publishes the branch after local review")
    # CI の guard は issue の Likely files に名指しされた基準画像だけ更新を認める。実装とレビューの役が自分で名指しできないようにする
    if os.environ.get("LOOP_LOCAL_REVIEW_FLOW") == "1" and (
            re.search(r"\bgh\s+issue\s+edit\b[^;&|]*\s(?:--body\b|--body-file\b|-b\b|-F\b)", cmd)
            or re.search(r"\bgh\s+api\b[^;&|]*\bissues/\d+\b(?![/\w])", cmd) and re.search(r"-X\s*PATCH|--method\s+PATCH|\s-[fF]\s*body=", cmd)):
        deny("the implementation and review iterations do not edit the issue body; end with replan to change the split")
    if "novel-submission-site-clone" in cmd or re.search(r"(^|[\s/])novel-site-clone(/|\s|$)", cmd):
        deny("novel-site-clone and its Compose project belong to the human-reviewed repository")
    if re.search(r"\bgh\s+pr\s+merge\b", cmd):
        deny("the orchestrator merges PRs, not the iteration")
    if re.search(r"loop:(ready|in-progress)", cmd) and re.search(r"\bgh\s+issue\s+edit\b", cmd):
        deny("only the orchestrator applies loop:ready and loop:in-progress")
    if re.search(r"\bgit\s+push\b.*(\s|:)(main|master)\b", cmd):
        deny("never push to the default branch")
    # プロンプトはテストを scripts/loop/check-output.sh 経由で実行させる。コマンドの先頭に置いた
    # このラッパーのパスまで保護パスへの書き込みと見なすと、リダイレクトを含むだけのテストが止まる。
    # 引数の位置にあるパス(cp の宛先など)は消さないので、ラッパー自体の書き換えは引き続き止まる
    cmd = CHECK_WRAPPER.sub(r"\1", cmd)
    if not WRITE_VERBS.search(cmd):
        return
    if MODE == "canary-read":
        deny("the arbiter edits nothing")
    if MODE in ("canary-spec", "canary"):
        return
    patterns = HARD if MODE == "bootstrap" else HARD + PROTECTED
    for pat in patterns:
        literal = pat.replace("**/", "").replace("/**", "/").split("*")[0]
        if len(literal) > 3 and literal in cmd:
            deny(f"shell command writes near protected path '{literal}'")


def check_patch(patch: str, cwd: str) -> None:
    forbid_approval(patch)
    root = toplevel(cwd)
    path = None
    additions_only = False
    for line in patch.splitlines():
        header = re.fullmatch(r"\*\*\* (Add File|Update File|Delete File|Move to): (.+)", line)
        if header:
            action, path = header.groups()
            if action == "Move to" and additions_only:
                deny("existing agent instructions cannot be moved")
            check_path(path, cwd, {}, "Patch")
            target = (Path(cwd) / path).resolve()
            rel = target.relative_to(root).as_posix() if target.is_relative_to(root) else ""
            additions_only = rel in APPEND_ONLY and default_content(root, rel) is not None
            if additions_only and action != "Update File":
                deny("existing agent instructions allow only additions")
        elif additions_only and line.startswith("-"):
            deny("existing agent instructions allow only additions")
    if path is None:
        deny("unrecognized patch format")


def main() -> None:
    data = json.load(sys.stdin)
    name = data.get("tool_name", "")
    tool = data.get("tool_input", {}) or {}
    cwd = data.get("cwd") or os.getcwd()
    if os.environ.get("LOOP_AGENT") == "codex":
        if name == "apply_patch":
            check_patch(tool["command"], cwd)
            return
        if name not in ("Bash", "update_plan"):
            deny(f"unsupported loop tool: {name}")
        if name == "Bash" and not isinstance(tool.get("command"), str):
            deny("missing shell command")
    if name in ("apply_patch", "ApplyPatch"):
        patch = tool if isinstance(tool, str) else tool.get("command") or tool.get("patch") or tool.get("input", "")
        sections = re.split(r"^\*\*\* (Add File|Delete File|Update File|Move to): ([^\n]+)\n?", patch, flags=re.M)
        if len(sections) == 1:
            deny("unrecognized patch format")
        forbid_approval(patch)
        root = toplevel(cwd)
        for action, path, body in zip(sections[1::3], sections[2::3], sections[3::3]):
            check_path(path, cwd, {}, "Patch")
            target = (Path(cwd) / path).resolve()
            if target.is_relative_to(root):
                rel = target.relative_to(root).as_posix()
                if match(rel, APPEND_ONLY) and default_content(root, rel) is not None:
                    if action != "Update File" or re.search(r"^-", body, re.M) or "*** Move to:" in patch:
                        deny("existing rules may only be extended")
    elif name in ("exec_command", "shell_command"):
        check_bash(tool.get("cmd") or tool.get("command", ""))
    elif name == "Bash":
        check_bash(tool.get("command", ""))
    elif name in ("Read", "Grep", "Glob"):
        hide_canaries(json.dumps(tool, ensure_ascii=False))
        forbid_owner_auth(json.dumps(tool, ensure_ascii=False))
    elif name in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
        forbid_approval(json.dumps({k: v for k, v in tool.items() if k != "file_path"}, ensure_ascii=False))
        path = tool.get("file_path") or tool.get("notebook_path")
        if path:
            check_path(path, cwd, tool, name)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        if os.environ.get("LOOP_AGENT") == "codex":
            deny(f"guard could not inspect operation: {exc}")
        raise

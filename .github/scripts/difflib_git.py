"""PR の差分を git から読む共通部品。guard、mutation、visual の各ジョブが使う。"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field


def git(*args: str, cwd: str = ".") -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def git_ok(*args: str, cwd: str = ".") -> bool:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True).returncode == 0


def show(ref: str, path: str, cwd: str = ".") -> str | None:
    """ref の時点の path の中身。無ければ None。"""
    out = subprocess.run(["git", "show", f"{ref}:{path}"], cwd=cwd, capture_output=True)
    if out.returncode != 0:
        return None
    return out.stdout.decode("utf-8", errors="replace")


@dataclass
class FileDiff:
    path: str
    status: str  # A, M, D, T
    added: list[tuple[int, str]] = field(default_factory=list)  # (新しい行番号, 行)
    removed: list[str] = field(default_factory=list)
    binary: bool = False


HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


def parse_unified(text: str) -> dict[str, FileDiff]:
    """`git diff -U0 --no-renames` の出力を、ファイルごとの追加行と削除行に分ける。"""
    files: dict[str, FileDiff] = {}
    cur: FileDiff | None = None
    old_path = new_path = None
    line_no = 0
    for raw in text.splitlines():
        if raw.startswith("diff --git "):
            cur = None
            old_path = new_path = None
            continue
        if raw.startswith("--- "):
            old_path = None if raw[4:] == "/dev/null" else raw[4:].removeprefix("a/")
            continue
        if raw.startswith("+++ "):
            new_path = None if raw[4:] == "/dev/null" else raw[4:].removeprefix("b/")
            path = new_path or old_path
            status = "A" if old_path is None else ("D" if new_path is None else "M")
            cur = files.setdefault(path, FileDiff(path, status))
            continue
        if raw.startswith("Binary files "):
            m = re.match(r"Binary files (\S+) and (\S+) differ", raw)
            if m:
                a, b = m.group(1), m.group(2)
                path = (b if b != "/dev/null" else a).split("/", 1)[1]
                status = "A" if a == "/dev/null" else ("D" if b == "/dev/null" else "M")
                files[path] = FileDiff(path, status, binary=True)
            continue
        m = HUNK.match(raw)
        if m:
            line_no = int(m.group(1))
            continue
        if cur is None:
            continue
        if raw.startswith("+"):
            cur.added.append((line_no, raw[1:]))
            line_no += 1
        elif raw.startswith("-"):
            cur.removed.append(raw[1:])
    return files


def pr_diff(base: str, head: str = "HEAD", cwd: str = ".") -> dict[str, FileDiff]:
    """base と head の分岐点から head までの差分(PR の変更そのもの)。"""
    text = git("diff", "-U0", "--no-renames", "--no-color", "--no-ext-diff", f"{base}...{head}", cwd=cwd)
    files = parse_unified(text)
    # モードだけの変更や空ファイルの追加も拾う
    for line in git("diff", "--name-status", "--no-renames", f"{base}...{head}", cwd=cwd).splitlines():
        status, path = line.split("\t", 1)
        if path not in files:
            files[path] = FileDiff(path, status[0])
    return files

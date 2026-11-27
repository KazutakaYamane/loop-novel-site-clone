"""機能 Issue の新規割り当てに使う、CLI が最後に報告した利用枠。"""

import json
import os
from pathlib import Path
import sys
import time


def latest_snapshot(paths, event_name, decode):
    recent = []
    for path in paths:
        try:
            recent.append((path.stat().st_mtime, path))
        except FileNotFoundError:
            continue
    for _, path in sorted(recent, reverse=True):
        try:
            with path.open("rb") as stream:
                latest = None
                for line in stream:
                    if event_name not in line:
                        continue
                    try:
                        event = json.loads(line)
                    except (UnicodeError, ValueError):
                        continue
                    snapshot = [
                        window for window in decode(event)
                        if isinstance(window[0], (int, float)) and isinstance(window[1], (int, float))
                    ]
                    if snapshot:
                        latest = snapshot
        except FileNotFoundError:
            continue
        if latest:
            return latest
    return []


def claude_snapshot(event):
    if event.get("type") != "rate_limit_event":
        return []
    info = event.get("rate_limit_info") or {}
    windows = info.get("unifiedWindows") or {}
    return [
        (window.get("utilization"), window.get("resetsAt"), 0.9)
        for window in (windows.values() if windows else [info])
    ]


def codex_snapshot(event):
    data = event.get("payload") or {}
    if event.get("type") != "event_msg" or data.get("type") != "token_count":
        return []
    limits = data.get("rate_limits") or {}
    if limits.get("limit_id") not in (None, "codex"):
        return []
    return [
        (window.get("used_percent"), window.get("resets_at"), 90)
        for key in ("primary", "secondary")
        if (window := limits.get(key))
    ]


def reset_from_file(path):
    try:
        return int(path.read_text())
    except (OSError, ValueError):
        return 0


def blocked_until(windows, recorded_reset, now):
    return max(
        [recorded_reset, 0]
        + [
            int(reset) for usage, reset, threshold in windows
            if usage > threshold and reset > now
        ]
    )


def select(state, codex_sessions, preferred, now):
    snapshots = {
        "claude": latest_snapshot((state / "logs").glob("claude-*.part*.jsonl"),
                                  b'"rate_limit_event"', claude_snapshot),
        "codex": latest_snapshot(codex_sessions.glob("*/*/*/*.jsonl"),
                                 b'"token_count"', codex_snapshot),
    }
    resets = {}
    alternative = "codex" if preferred == "claude" else "claude"
    for provider in (preferred, alternative):
        legacy = "limited-until" if provider == "claude" else "limited-until-codex"
        recorded = max(reset_from_file(state / legacy),
                       reset_from_file(state / f"mixed-limited-until-{provider}"))
        resets[provider] = blocked_until(snapshots[provider], recorded, now)
        if resets[provider] <= now:
            return provider
    return str(min(resets.values()))


def assign(state, codex_sessions, now):
    """交互の順番の担当を選び、次の順番を残す。順番は起動し直しても引き継ぐ。
    起動のたびに Claude から始めると、escalation で起動し直すたびに Claude に偏るため"""
    turn = state / "mixed-next-provider"
    try:
        preferred = turn.read_text().strip()
    except OSError:
        preferred = ""
    if preferred not in ("claude", "codex"):
        preferred = "claude"
    chosen = select(state, codex_sessions, preferred, now)
    if chosen in ("claude", "codex"):
        # 利用枠で代わりに選んだときは、飛ばした側に次の順番を残す
        turn.write_text(("codex" if chosen == "claude" else "claude") + "\n")
    return chosen, preferred


if __name__ == "__main__":
    codex_home = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")
    print(*assign(Path(sys.argv[1]), codex_home / "sessions", int(time.time())))

"""claude -p の stream-json の記録を読む。

使い方:
  claude_log.py classify <log> [stderr]   この1回の実行がどう終わったかを1行で出す
      ok                          終わった(成否は RESULT 行で判断する)
      limit <epoch> <session>     利用上限で止まった。<epoch> にリセットされる
      transient <session>         混雑やネットワークなど、一時的なエラーで止まった
  claude_log.py result <log>      最後の結果の、最後の "RESULT:" 行を出す
  claude_log.py spent <log>       API 換算の費用の合計(USD)を出す
  claude_log.py metrics <log> <run-name>  metrics 用の1行の JSON を出す
"""

import json
import os
import re
import sys
import time
from pathlib import Path

LIMIT_TEXT = re.compile(r"usage limit|hit your limit|weekly limit|limit reached|rate.?limit", re.I)
TRANSIENT_TEXT = re.compile(r"overloaded|\b529\b|\b50[023]\b|internal server error|api_error|ECONNRESET|ETIMEDOUT|"
                            r"socket hang up|network error|fetch failed", re.I)


def events(path: Path) -> list[dict]:
    out = []
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if isinstance(e, dict):
            out.append(e)
    return out


def results(evs: list[dict]) -> list[dict]:
    return [e for e in evs if e.get("type") == "result"]


def result_line(res: dict | None) -> str | None:
    if not res:
        return None
    lines = [l.strip() for l in (res.get("result") or "").splitlines() if l.strip().startswith("RESULT:")]
    return lines[-1] if lines else None


def classify(path: Path, stderr: Path | None) -> str:
    evs = events(path)
    session = next((e["session_id"] for e in reversed(evs) if e.get("session_id")), "")
    res = (results(evs) or [None])[-1]
    if result_line(res):
        return "ok"
    if res and res.get("subtype", "").startswith("error_max"):
        # 予算やターン数の上限。待っても解決しないので、通常の失敗として扱う
        return "ok"
    if res and not res.get("is_error"):
        # 正常に終わった実行の本文は、エージェントの報告(レート制限の実装の話など)を含みうるので、
        # 古い形式の上限メッセージ "usage limit reached|<epoch>" だけを見る
        text = res.get("result") or ""
        if not re.search(r"usage limit reached\|\d{10}", text, flags=re.I):
            text = ""
    else:
        text = json.dumps(res or {}, ensure_ascii=False)
        if stderr and stderr.exists():
            text += "\n" + stderr.read_text(encoding="utf-8", errors="replace")[-4000:]

    rejected = None
    for e in evs:
        info = e.get("rate_limit_info") if e.get("type") == "rate_limit_event" else None
        if isinstance(info, dict):
            rejected = info if info.get("status") == "rejected" and not info.get("isUsingOverage") else None
    if rejected or LIMIT_TEXT.search(text):
        resets = (rejected or {}).get("resetsAt")
        if not resets:
            m = re.search(r"\|(\d{10})\b", text)
            resets = int(m.group(1)) if m else None
        if not resets:
            resets = int(time.time()) + int(os.environ.get("RATE_LIMIT_FALLBACK_WAIT_SECONDS", "1800"))
        return f"limit {int(resets)} {session}".rstrip()
    if TRANSIENT_TEXT.search(text):
        return f"transient {session}".rstrip()
    return "ok"


def result(path: Path) -> str:
    res = (results(events(path)) or [None])[-1]
    if res is None:
        return "RESULT: none (no result event)"
    return result_line(res) or f"RESULT: none ({res.get('subtype')})"


def spent(path: Path) -> float:
    # resume のたびに1回分の結果が出るので足し合わせる
    return sum(float(r.get("total_cost_usd") or 0) for r in results(events(path)))


def metrics(path: Path, run: str) -> str:
    rs = results(events(path))
    agent = os.environ.get("LOOP_AGENT", "claude")
    usage = {}
    for res in rs:
        for key, count in (res.get("usage") or {}).items():
            if key.endswith("_tokens") and type(count) is int:
                usage[key] = usage.get(key, 0) + count
    row = {
        "agent": agent, "model": os.environ.get("MODEL"), "usage": usage,
        "cost_source": "cli" if agent == "claude" else "unavailable",
        "run": run,
        "subtype": rs[-1].get("subtype") if rs else None,
        "api_equivalent_cost_usd": round(spent(path), 4) if agent == "claude" else None,
        "duration_ms": sum(int(r.get("duration_ms") or 0) for r in rs),
        "num_turns": sum(int(r.get("num_turns") or 0) for r in rs),
        "resumes": max(0, len(rs) - 1),
    }
    return json.dumps(row)


def main(argv: list[str]) -> int:
    cmd, args = (argv[1] if len(argv) > 1 else ""), argv[2:]
    if cmd == "classify" and len(args) in (1, 2):
        print(classify(Path(args[0]), Path(args[1]) if len(args) == 2 else None))
    elif cmd == "result" and len(args) == 1:
        print(result(Path(args[0])))
    elif cmd == "findings" and len(args) == 1:
        rs = results(events(Path(args[0])))
        if not rs or rs[-1].get("is_error") or not rs[-1].get("result", "").strip():
            return 1
        print(rs[-1]["result"])
    elif cmd == "spent" and len(args) == 1:
        print(f"{spent(Path(args[0])):.4f}")
    elif cmd == "metrics" and len(args) == 2:
        print(metrics(Path(args[0]), args[1]))
    else:
        print(__doc__, file=sys.stderr)
        return 64
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

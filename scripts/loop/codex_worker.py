"""Codex の1セッションを実行し、Issue 別に時間と利用量を記録する。"""

import json
import os
import shlex
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


def summarize(path):
    fields = ("input_tokens", "cached_input_tokens", "output_tokens")
    totals = dict.fromkeys(fields, 0)
    turns = 0
    complete = True
    with path.open() as stream:
        for line in stream:
            try:
                event = json.loads(line)
            except ValueError:
                complete = False
                continue
            if event.get("type") == "turn.completed":
                turns += 1
                usage = event.get("usage") or {}
                for key in fields:
                    if type(usage.get(key)) is int and totals[key] is not None:
                        totals[key] += usage[key]
                    else:
                        totals[key] = None
            if event.get("type") == "turn.failed":
                complete = False
    return turns, totals if turns else None, complete and turns > 0 and all(v is not None for v in totals.values())


def main():
    issue, role, name, directory, logfile, metrics = sys.argv[1:]
    path = Path(logfile)
    last = path.with_suffix(".last")
    guard = Path(__file__).resolve().with_name("guard-hook.py")
    command = json.dumps(f"python3 -I {shlex.quote(str(guard))}")
    hook = 'hooks.PreToolUse=[{hooks=[{type="command",command=' + command + '}]}]'
    model = {"implementation": "gpt-6.2-sol", "review": "gpt-6.2-astra"}[role]
    effort = "high" if role == "review" and os.environ.get("REVIEW_LEVEL") != "medium" else "medium"
    args = ["codex", "exec", "--model", model, "--json", "--enable", "hooks", "-c", hook,
            "-c", f'model_reasoning_effort="{effort}"', "--output-last-message", str(last), "-"]
    start = datetime.now(timezone.utc)
    clock = time.monotonic_ns()
    with path.open("wb") as out, path.with_suffix(".stderr").open("wb") as err:
        try:
            status = subprocess.run(args, cwd=directory, stdout=out, stderr=err).returncode
        except OSError as exc:
            err.write(str(exc).encode())
            status = 127
    elapsed = (time.monotonic_ns() - clock) // 1_000_000
    end = datetime.now(timezone.utc)
    turns, usage, complete = summarize(path)
    row = dict(issue=int(issue), run=name, provider="codex", role=role, model=model, reasoning_effort=effort,
               started_at=start.isoformat(), ended_at=end.isoformat(), duration_ms=elapsed,
               exit_code=status, num_turns=turns, usage=usage, usage_complete=complete and status == 0)
    with open(metrics, "a") as stream:
        stream.write(json.dumps(row) + "\n")
    if status == 0 and last.exists():
        lines = last.read_text().strip().splitlines()
        if lines and lines[-1].startswith("RESULT:"):
            print(lines[-1])
            return
    print(f"RESULT: none (codex exit {status}; see {path})")


if __name__ == "__main__":
    main()

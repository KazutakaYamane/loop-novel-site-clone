"""機能 issue の Codex 実行を、再開分もまとめて1行に記録する。"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def events(path):
    with path.open(encoding="utf-8", errors="replace") as stream:
        for line in stream:
            try:
                yield json.loads(line)
            except ValueError:
                yield None


def summarize(paths):
    totals = dict.fromkeys(("input_tokens", "cached_input_tokens", "output_tokens"), 0)
    turns = 0
    complete = True
    for path in paths:
        part_turns = 0
        for event in events(path):
            if not isinstance(event, dict) or event.get("type") == "turn.failed":
                complete = False
            elif event.get("type") == "turn.completed":
                part_turns += 1
                usage = event.get("usage") or {}
                for key in totals:
                    if type(usage.get(key)) is int and totals[key] is not None:
                        totals[key] += usage[key]
                    else:
                        totals[key] = None
        turns += part_turns
        complete = complete and part_turns > 0
    return turns, totals if turns else None, complete and turns > 0 and all(v is not None for v in totals.values())


def main():
    issue, role, name, logfile, metrics, started_at = sys.argv[1:]
    path = Path(logfile)
    log = events(path)
    meta = next(log)
    parts = [event for event in log if event["type"] == "result"]
    final = parts[-1]
    raw_paths = (path.with_suffix(f".part{index}.raw.jsonl") for index in range(1, len(parts) + 1))
    turns, usage, complete = summarize(raw_paths)
    row = dict(issue=int(issue), run=name, provider="codex", role=role,
               model=meta["model"], reasoning_effort=meta["reasoning_effort"],
               started_at=started_at, ended_at=datetime.now(timezone.utc).isoformat(),
               duration_ms=sum(part["duration_ms"] for part in parts), resumes=len(parts) - 1,
               exit_code=final["exit_code"], num_turns=turns, usage=usage,
               usage_complete=complete and all(not part["is_error"] for part in parts))
    with open(metrics, "a", encoding="utf-8") as stream:
        stream.write(json.dumps(row) + "\n")
    lines = final["result"].strip().splitlines()
    if not final["is_error"] and lines and lines[-1].startswith("RESULT:"):
        print(lines[-1])
    else:
        print(f"RESULT: none ({final['subtype']}; codex exit {final['exit_code']}; see {path})")


if __name__ == "__main__":
    main()

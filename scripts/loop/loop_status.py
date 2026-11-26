"""ループの状態の記録と表示。Orca があれば、その画面(タブ名、ワークスペースの状態、エージェントごとのタブ)にも出す。

ループは裏(setsid nohup)で動くので、外からは動いているのか、止まったのか、人間待ちなのかが分からない。
run.sh が段階を移るたびに <STATE_DIR>/status/ に状態を書き、ここで読み出して表示する。
Orca への反映は見るためだけのもので、失敗してもループは止めない。

使い方:
  loop_status.py start <state_dir> <pid> <command> <run_log> <repo_root>   run.sh の起動を記録する
  loop_status.py set <state_dir> <key> <step> <detail> <log>               1つの持ち場(main か issue-<n>)の状態を書く
  loop_status.py finish <state_dir> <exit_code>                            run.sh の終了を記録する
  loop_status.py status <state_dir>                                        状態を表示する
  loop_status.py running <state_dir>                                       run.sh が動いていれば 0
  loop_status.py stop <state_dir>                                          run.sh をプロセスグループごと止める
  loop_status.py watch <state_dir> [--once]                                ログと状態を流し続け、自分のタブ名を状態にする
  loop_status.py follow <log_base>                                         エージェント1回分の記録を読みやすく流す
  loop_status.py agent-tab <state_dir> <dir> <name> <log_base> <repo_root> その worktree にエージェントを見るタブを開く
  loop_status.py forget-tab <state_dir> <worktree>                         消す worktree のエージェントのタブを閉じる
  loop_status.py open-watch <state_dir> <repo_root> <title>                ループを見るタブを開く(開いていれば何もしない)

step: agent | waiting-ci | waiting-canaries | waiting-limit | escalated | done | stopped
"""

import json
import os
import shlex
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
LABEL = {"agent": "エージェント実行中", "waiting-ci": "CI 待ち", "waiting-canaries": "カナリアの判定待ち",
         "waiting-limit": "利用上限のリセット待ち", "escalated": "人間待ち", "done": "完了", "stopped": "停止"}
ICON = {"agent": "▶", "waiting-ci": "⏳", "waiting-canaries": "⏳", "waiting-limit": "💤",
        "escalated": "⚠", "done": "✓", "stopped": "✗"}
FINAL = ("escalated", "done", "stopped")


def status_dir(state: str) -> Path:
    d = Path(state) / "status"
    d.mkdir(parents=True, exist_ok=True)
    return d


def load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save(path: Path, row: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(row, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def orca_bin() -> str | None:
    if os.environ.get("LOOP_ORCA", "1") == "0":
        return None
    for cand in (os.environ.get("LOOP_ORCA_BIN"), shutil.which("orca"),
                 os.path.join(os.environ.get("ORCA_CLI_BIN_DIR", ""), "orca")):
        if cand and os.access(cand, os.X_OK):
            return cand
    return None


def orca(*args: str) -> str | None:
    """Orca CLI を呼ぶ。使えないときや失敗したときは None"""
    binary = orca_bin()
    if not binary:
        return None
    try:
        r = subprocess.run([binary, *args], capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout if r.returncode == 0 else None


def created_handle(out: str | None) -> str | None:
    try:
        return json.loads(out or "")["result"]["terminal"]["handle"]
    except (ValueError, KeyError, TypeError):
        return None


def pid_alive(pid) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        pass
    # pid の使い回しで、別のプロセスを run.sh と取り違えないようにする
    try:
        return b"run.sh" in Path(f"/proc/{pid}/cmdline").read_bytes()
    except OSError:
        return True


def ago(since) -> str:
    if not isinstance(since, (int, float)):
        return "?"
    s = max(0, int(time.time() - since))
    if s < 60:
        return f"{s}秒"
    if s < 3600:
        return f"{s // 60}分"
    return f"{s // 3600}時間{s % 3600 // 60}分"


def entries(state: str) -> list[dict]:
    d = status_dir(state)
    rows = [load(p) for p in sorted(d.glob("*.json")) if p.name != "run.json"]
    rows = [r for r in rows if r]
    return sorted(rows, key=lambda r: (r.get("key") != "main", r.get("key", "")))


def overall(state: str) -> tuple[str, dict, list[dict]]:
    run = load(status_dir(state) / "run.json")
    rows = entries(state)
    main = next((r for r in rows if r.get("key") == "main"), {})
    if not run:
        return "記録なし", run, rows
    if pid_alive(run.get("pid")):
        return ("待機中" if main.get("step") == "waiting-limit" else "動作中"), run, rows
    if any(r.get("step") == "escalated" for r in rows):
        return "人間待ち", run, rows
    if main.get("step") == "done":
        return "完了", run, rows
    return "停止", run, rows


def describe(row: dict) -> str:
    text = LABEL.get(row.get("step", ""), row.get("step", "?"))
    return text + (f" — {row['detail']}" if row.get("detail") else "")


def status_lines(state: str) -> list[str]:
    head, run, rows = overall(state)
    if not run:
        return ["記録なし(このループはまだ起動していない)"]
    lines = [f"{head}  {run.get('command', '')}  (pid {run.get('pid')}、{ago(run.get('started'))}前に起動)"]
    if head == "停止" and run.get("exit") is None:
        lines[0] += "  終了の記録がない(kill か異常終了)"
    for r in rows:
        lines.append(f"  {r.get('key')}: {describe(r)}({ago(r.get('since'))}前から)")
    if run.get("log"):
        lines.append(f"  ログ: {run['log']}")
    return lines


def signature(state: str) -> tuple:
    head, run, rows = overall(state)
    return head, run.get("pid"), tuple((r.get("key"), r.get("step"), r.get("detail")) for r in rows)


def title(state: str) -> str:
    head, run, rows = overall(state)
    main = next((r for r in rows if r.get("key") == "main"), {})
    if head in ("停止", "記録なし"):
        return f"loop ✗ {head}"
    if head == "人間待ち":
        return "loop ⚠ 人間待ち"
    step = main.get("step", "")
    detail = main.get("detail", "")
    return f"loop {ICON.get(step, '·')} {LABEL.get(step, step)} {detail}"[:60].rstrip()


def cmd_start(state, pid, command, run_log, repo_root):
    d = status_dir(state)
    for p in d.glob("*.json"):
        p.unlink()
    save(d / "run.json", {"pid": int(pid), "command": command, "log": run_log, "repo_root": repo_root,
                          "started": int(time.time()), "exit": None})
    return 0


def cmd_set(state, key, step, detail, log):
    d = status_dir(state)
    save(d / f"{key}.json", {"key": key, "step": step, "detail": detail[:500], "log": log, "since": int(time.time())})
    root = load(d / "run.json").get("repo_root")
    if root:
        ws = {"escalated": "in-review", "stopped": "in-review"}.get(step, "in-progress")
        if step == "done" and key == "main":
            ws = "completed"
        args = ["worktree", "set", "--worktree", f"path:{root}", "--workspace-status", ws,
                "--comment", f"loop {key}: {LABEL.get(step, step)}" + (f" — {detail}" if detail else "")]
        if step in ("escalated", "stopped"):
            args.append("--unread")
        orca(*args)
    return 0


def cmd_finish(state, rc):
    d = status_dir(state)
    run = load(d / "run.json")
    if not run:
        return 0
    rc = int(rc)
    run.update(exit=rc, ended=int(time.time()))
    save(d / "run.json", run)
    main = load(d / "main.json")
    step = main.get("step")
    if rc == 0:
        cmd_set(state, "main", "done", main.get("detail", "") if step == "done" else "", main.get("log", ""))
    elif step == "escalated":
        pass
    elif rc == 2:
        cmd_set(state, "main", "escalated", "人間の判断待ちの issue があり、進められる issue がない", main.get("log", ""))
    else:
        last = f"(最後: {describe(main)})" if main else ""
        cmd_set(state, "main", "stopped", f"exit {rc}{last}", main.get("log", ""))
    return 0


def cmd_status(state):
    print("\n".join(status_lines(state)))
    return 0


def cmd_running(state):
    return 0 if pid_alive(load(status_dir(state) / "run.json").get("pid")) else 1


def cmd_stop(state):
    pid = load(status_dir(state) / "run.json").get("pid")
    if not pid_alive(pid):
        print("動いていない")
        return 0
    # setsid で起動しているので、run.sh の pid がプロセスグループの番号。子の claude もまとめて止める
    if os.getpgid(pid) == pid:
        os.killpg(pid, signal.SIGTERM)
    else:
        os.kill(pid, signal.SIGTERM)
    for _ in range(60):
        if not pid_alive(pid):
            print(f"止めた(pid {pid})")
            return 0
        time.sleep(1)
    print(f"pid {pid} がまだ終わっていない")
    return 1


def cmd_watch(state, *opts):
    once = "--once" in opts
    handle = os.environ.get("ORCA_TERMINAL_HANDLE")
    log_path, offset, last_sig, last_title = None, 0, None, None
    while True:
        run = load(status_dir(state) / "run.json")
        if run.get("log") != log_path:
            log_path, offset = run.get("log"), 0
            if log_path:
                print(f"=== {log_path}", flush=True)
        if log_path and os.path.exists(log_path):
            with open(log_path, encoding="utf-8", errors="replace") as f:
                f.seek(offset)
                text = f.read()
                offset = f.tell()
            if text:
                print(text, end="" if text.endswith("\n") else "\n", flush=True)
        sig = signature(state)
        if sig != last_sig:
            print(f"── {time.strftime('%H:%M:%S')} " + "\n".join(status_lines(state)), flush=True)
            last_sig = sig
        t = title(state)
        if handle and t != last_title:
            orca("terminal", "rename", "--terminal", handle, "--title", t)
            last_title = t
        if once:
            return 0
        time.sleep(5)


def short(value, n=160) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"


def render(e: dict) -> list[str]:
    kind = e.get("type")
    if kind == "system" and e.get("subtype") == "init":
        return [f"▶ セッション開始 {e.get('model', '')}"]
    if kind == "assistant":
        out = []
        for block in e.get("message", {}).get("content", []):
            if block.get("type") == "tool_use":
                args = block.get("input", {})
                arg = args.get("command") or args.get("file_path") or args.get("pattern") or args if isinstance(args, dict) else args
                out.append(f"$ {block.get('name')}: {short(arg)}")
            elif block.get("type") == "text" and block.get("text", "").strip():
                out.append(short(block["text"], 600))
        return out
    if kind == "user":
        out = []
        content = e.get("message", {}).get("content")
        for block in content if isinstance(content, list) else []:
            if block.get("type") == "tool_result" and block.get("is_error"):
                out.append(f"  ✗ {short(block.get('content', ''))}")
        return out
    if kind == "rate_limit_event":
        info = e.get("rate_limit_info", {})
        if info.get("status") != "allowed":
            five = info.get("unifiedWindows", {}).get("five_hour", {})
            return [f"⚠ 利用上限 {info.get('status')} 5時間枠 {five.get('utilization')}"]
    if kind == "result":
        cost = e.get("total_cost_usd")
        lines = [l for l in (e.get("result") or "").splitlines() if l.strip().startswith("RESULT:")]
        return [f"■ {lines[-1] if lines else 'RESULT なし (' + str(e.get('subtype')) + ')'}"
                f"  ターン {e.get('num_turns')}  ${cost if cost is not None else '?'}"]
    return []


def cmd_follow(base, *opts):
    part, pos, idle = 1, 0, 0
    done = Path(f"{base}.done")
    while True:
        path = Path(f"{base}.part{part}.jsonl")
        progressed = False
        if path.exists():
            with path.open("rb") as f:
                f.seek(pos)
                chunk = f.read()
            # 書きかけの最後の行は次に回す
            end = chunk.rfind(b"\n") + 1
            for line in chunk[:end].decode("utf-8", errors="replace").splitlines():
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                for text in render(e) if isinstance(e, dict) else []:
                    print(text, flush=True)
            pos += end
            progressed = end > 0
        if Path(f"{base}.part{part + 1}.jsonl").exists() and not progressed:
            part, pos = part + 1, 0
            print(f"── 再開(part {part})", flush=True)
            continue
        if done.exists() and not progressed:
            print("── このエージェントの実行は終わった", flush=True)
            return 0
        time.sleep(0.2 if progressed else 1)


def cmd_agent_tab(state, directory, name, base, repo_root):
    try:
        wt = subprocess.run(["git", "-C", directory, "rev-parse", "--show-toplevel"], capture_output=True,
                            text=True, timeout=10).stdout.strip() or repo_root
    except (OSError, subprocess.SubprocessError):
        wt = repo_root
    store = Path(state) / "orca" / "agent-tabs.json"
    store.parent.mkdir(parents=True, exist_ok=True)
    tabs = load(store)
    # 同じ worktree の前回のタブは閉じ、タブが round ごとに増え続けないようにする。記録はログに残っている
    if tabs.get(wt):
        orca("terminal", "close", "--terminal", tabs[wt], "--tab")
    command = f"python3 -I {shlex.quote(str(HERE / 'loop_status.py'))} follow {shlex.quote(base)}"
    # 作ったばかりの worktree は Orca が認識するまで少しかかり、その間はタブを作れない
    wait = float(os.environ.get("LOOP_ORCA_RETRY_SECONDS", "3"))
    for attempt in range(5):
        handle = created_handle(orca("terminal", "create", "--worktree", f"path:{wt}", "--title", name,
                                     "--command", command, "--json"))
        if handle or not orca_bin():
            break
        time.sleep(wait)
    if handle:
        tabs[wt] = handle
        save(store, tabs)
    return 0


def cmd_forget_tab(state, worktree):
    store = Path(state) / "orca" / "agent-tabs.json"
    tabs = load(store)
    handle = tabs.pop(str(Path(worktree)), None)
    if handle:
        orca("terminal", "close", "--terminal", handle, "--tab")
        save(store, tabs)
    return 0


def cmd_open_watch(state, repo_root, tab_title):
    # ループの worktree(<repo>.loop/worktrees/)は Orca が作ったものではないので、既定では表示されない
    orca("repo", "set", "--repo", f"path:{repo_root}", "--external-worktree-visibility", "show")
    store = Path(state) / "orca" / "watch.json"
    store.parent.mkdir(parents=True, exist_ok=True)
    handle = load(store).get("handle")
    if handle and orca("terminal", "show", "--terminal", handle) is not None:
        return 0
    command = f"python3 -I {shlex.quote(str(HERE / 'loop_status.py'))} watch {shlex.quote(str(state))}"
    handle = created_handle(orca("terminal", "create", "--worktree", f"path:{repo_root}", "--title", tab_title,
                                 "--command", command, "--json"))
    if handle:
        save(store, {"handle": handle})
    return 0


COMMANDS = {"start": cmd_start, "set": cmd_set, "finish": cmd_finish, "status": cmd_status,
            "running": cmd_running, "stop": cmd_stop, "watch": cmd_watch, "follow": cmd_follow,
            "agent-tab": cmd_agent_tab, "forget-tab": cmd_forget_tab, "open-watch": cmd_open_watch}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__, file=sys.stderr)
        sys.exit(64)
    try:
        sys.exit(COMMANDS[sys.argv[1]](*sys.argv[2:]))
    except KeyboardInterrupt:
        sys.exit(130)

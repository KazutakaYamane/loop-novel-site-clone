"""Codex CLI の起動と JSONL からループ共通の実行記録への変換。"""

import json
import os
from pathlib import Path
import shlex
import signal
import subprocess
import sys


def discover_hook(args, command):
    with subprocess.Popen([*args, "app-server"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          text=True) as server:
        try:
            for i, (method, params) in enumerate([
                ("initialize", {"clientInfo": {"name": "loop", "version": "1"},
                                "capabilities": {"experimentalApi": True}}),
                ("hooks/list", {"cwds": [os.getcwd()]})]):
                server.stdin.write(json.dumps(dict(id=i, method=method, params=params)) + "\n")
                server.stdin.flush()
                for line in server.stdout:
                    reply = json.loads(line)
                    if reply.get("id") == i:
                        result = reply["result"]
                        break
                else:
                    raise ValueError("Codex hook discovery failed")
        finally:
            server.terminate()
    entry, = result["data"]
    if entry["errors"]:
        raise ValueError("Codex hook configuration errors")
    hook, = [h for h in entry["hooks"] if h["source"] == "sessionFlags" and h["enabled"]
             and h["eventName"] == "preToolUse" and h.get("command") == command
             and not h.get("matcher") and not h.get("async")]
    return hook


def guarded_args():
    command = shlex.join([sys.executable, "-I", str(Path(__file__).with_name("guard-hook.py"))])
    group = 'hooks.PreToolUse=[{hooks=[{type="command",command=' + json.dumps(command) + '}]}]'
    args = ["codex", "--enable", "hooks", "-c", group,
            "-c", 'web_search="disabled"']
    # 管理者の制約を反映した一覧から、この実行で追加した hook だけを信頼する。
    hook = discover_hook(args, command)
    args += ["-c", "hooks.state={" + json.dumps(hook["key"]) + "={trusted_hash=" +
             json.dumps(hook["currentHash"]) + "}}"]
    if discover_hook(args, command)["trustStatus"] != "trusted":
        raise ValueError("Codex did not activate the loop guard")
    return args


def launch(action, target, prompt):
    mode = os.environ.get("LOOP_MODE", "normal")
    sandbox = "read-only" if mode == "canary-read" else "workspace-write"
    args = guarded_args() + ["-c", "model_reasoning_effort=" + json.dumps(os.environ["EFFORT"]),
                             "-c", "sandbox_mode=" + json.dumps(sandbox),
                             "-c", "sandbox_workspace_write.network_access=true",
                             "-c", 'approval_policy="never"',
                             # 既定では名前に TOKEN を含む変数がシェルに渡らない。ループは bot の GH_TOKEN で GitHub を操作する
                             "-c", "shell_environment_policy.ignore_default_excludes=true"]
    roots = []
    if mode == "canary-spec":
        roots.append(os.environ["LOOP_CANARY_DIR"])
    elif mode != "canary-read":
        git_dir = subprocess.check_output(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], text=True).strip()
        roots.append(git_dir)
    if mode == "normal" and os.environ.get("LOOP_HANDOFF"):
        # linked worktree の index は共通ディレクトリを許可しても、個別に許可するまで書き込めない。
        git_worktree_dir = subprocess.check_output(
            ["git", "rev-parse", "--absolute-git-dir"], text=True).strip()
        if git_worktree_dir != git_dir:
            roots.append(git_worktree_dir)
        roots.extend([os.environ["LOOP_HANDOFF"], os.environ["TMPDIR"]])
        args += ["-c", "sandbox_workspace_write.exclude_slash_tmp=true",
                 "-c", "sandbox_workspace_write.exclude_tmpdir=true"]
    if roots:
        args += ["-c", "sandbox_workspace_write.writable_roots=" + json.dumps(roots)]
    args.append("exec")
    if action in ("resume", "review"):
        args.append(action)
    args += ["--json", "--model", os.environ["MODEL"]]
    if action == "review":
        args += ["--base", target]
    else:
        args.append("--skip-git-repo-check")
        if action == "resume":
            args.append(target)
        args.append(prompt)
    os.execvp(args[0], args)


def normalize(path, status, duration_ms):
    session = message = error = ""
    completed = False
    usage = {}
    try:
        for line in Path(path).read_text().splitlines():
            event = json.loads(line)
            kind = event["type"]
            if kind == "thread.started":
                session = event["thread_id"]
            elif kind == "turn.started":
                message, completed = "", False
            elif kind == "turn.completed":
                completed, usage, error = True, event["usage"], ""
            elif kind in ("turn.failed", "error"):
                error = (event["error"] if kind == "turn.failed" else event)["message"]
            elif kind in ("item.started", "item.updated", "item.completed"):
                item = event["item"]
                name = item["type"]
                if name == "agent_message" and kind == "item.completed":
                    message = item["text"]
                elif name == "command_execution":
                    yield operation("Bash", {"command": item["command"]})
                elif name == "file_change":
                    yield operation("Edit", item["changes"])
                elif name in ("mcp_tool_call", "web_search", "collab_tool_call"):
                    yield operation(name, {k: v for k, v in item.items() if k not in ("result", "output")})
                elif name not in ("agent_message", "reasoning", "todo_list", "error"):
                    raise ValueError(f"unknown Codex item {name}")
            else:
                raise ValueError(f"unknown Codex event {kind}")
    except (OSError, KeyError, TypeError, ValueError) as exc:
        yield {"type": "audit_error", "reason": str(exc)}
        completed = False
        error = str(exc)
    if not session:
        yield {"type": "audit_error", "reason": "missing Codex thread event"}
    success = status == 0 and bool(session) and completed and not error
    subtype = "success" if success else ("error_max_time" if status in (124, 137) else "error")
    yield dict(type="result", session_id=session, subtype=subtype, is_error=not success,
               result=message if success else "", errors=[error], usage=usage,
               duration_ms=duration_ms, num_turns=int(completed), exit_code=status)


def operation(name, args):
    return {"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": name, "input": args}]}}


def stop_on_signal(signum, _frame):
    sys.exit(128 + signum)


def timed(seconds, *args):
    # ctl stop が届く親をループのグループに残し、時間切れや停止時は Codex の子もまとめて止める。
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, stop_on_signal)
    with subprocess.Popen([sys.executable, "-I", __file__, *args], start_new_session=True) as proc:
        try:
            status = proc.wait(timeout=float(seconds))
            return status if status >= 0 else 128 - status
        except subprocess.TimeoutExpired:
            return 124
        finally:
            if proc.returncode is None:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass


if __name__ == "__main__":
    if sys.argv[1] == "normalize":
        for record in normalize(sys.argv[2], int(sys.argv[3]), round(float(sys.argv[4]) * 1000)):
            print(json.dumps(record))
    elif sys.argv[1] == "timed":
        sys.exit(timed(*sys.argv[2:]))
    else:
        launch(*sys.argv[1:])

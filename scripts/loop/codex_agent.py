"""Codex CLI の起動と JSONL からループ共通の実行記録への変換。"""

import json
import os
from pathlib import Path
import shlex
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
                             "-c", 'approval_policy="never"']
    roots = []
    if mode == "canary-spec":
        roots.append(os.environ["LOOP_CANARY_DIR"])
    elif mode != "canary-read":
        git_dir = subprocess.check_output(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], text=True).strip()
        roots.append(git_dir)
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


def normalize(path, status, seconds):
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
                completed, usage = True, event["usage"]
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
               duration_ms=seconds * 1000, num_turns=int(completed))


def operation(name, args):
    return {"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": name, "input": args}]}}


if __name__ == "__main__":
    if sys.argv[1] == "normalize":
        for record in normalize(sys.argv[2], int(sys.argv[3]), int(sys.argv[4])):
            print(json.dumps(record))
    else:
        launch(*sys.argv[1:])

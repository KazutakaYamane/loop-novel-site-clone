"""ループが GitHub を操作するための GitHub App のトークン(docs/adr/0017)。

インストールのトークンは 1 時間で切れ、ループは何時間も動く。そこで gh と git push のたびにこのスクリプトを呼び、
残りが 10 分を切ったら作り直す。署名(RS256)は openssl で行い、依存を増やさない。

使い方(python3 -I で呼ぶ):
  app_token.py token        使えるインストールのトークンを出す
  app_token.py identity     App の slug、コミットに使う名前とメールアドレスを 1 行ずつ出す
  app_token.py credential   git の credential helper(get にだけ答える)

環境変数:
  LOOP_APP_ID           App の ID
  LOOP_APP_KEY_FILE     App の秘密鍵(PEM)
  LOOP_APP_REPO         owner/name。無ければ origin の URL から読む
  LOOP_APP_TOKEN_CACHE  トークンを置くファイル。書けなければ毎回作る
  LOOP_GITHUB_API       API の URL(試験用。既定 https://api.github.com)
"""

import base64
import calendar
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

API = os.environ.get("LOOP_GITHUB_API", "https://api.github.com").rstrip("/")
REFRESH_BEFORE_SECONDS = 600


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def app_jwt(app_id: str, key_file: str, now: int | None = None) -> str:
    now = int(time.time()) if now is None else now
    # 時計のずれに備えて 60 秒前から有効にする。上限は 10 分
    header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    payload = b64url(json.dumps({"iat": now - 60, "exp": now + 540, "iss": app_id}).encode())
    signing_input = f"{header}.{payload}".encode()
    sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign", key_file], input=signing_input,
                         capture_output=True, check=True).stdout
    return f"{header}.{payload}.{b64url(sig)}"


def api(method: str, path: str, bearer: str) -> dict:
    req = urllib.request.Request(f"{API}{path}", method=method, headers={
        "Authorization": f"Bearer {bearer}", "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "loop-harness"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read() or b"{}")


def repo() -> str:
    if os.environ.get("LOOP_APP_REPO"):
        return os.environ["LOOP_APP_REPO"]
    url = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True, check=True).stdout.strip()
    m = re.search(r"github\.com[:/]([^/]+/[^/]+?)(?:\.git)?$", url)
    if not m:
        raise SystemExit(f"cannot read owner/name from origin: {url}")
    return m.group(1)


def settings() -> tuple[str, str]:
    app_id, key = os.environ.get("LOOP_APP_ID", ""), os.environ.get("LOOP_APP_KEY_FILE", "")
    if not app_id or not key or not Path(key).is_file():
        raise SystemExit("set LOOP_APP_ID and LOOP_APP_KEY_FILE (the GitHub App's private key)")
    return app_id, key


def fresh_token() -> dict:
    app_id, key = settings()
    jwt = app_jwt(app_id, key)
    installation = api("GET", f"/repos/{repo()}/installation", jwt)
    got = api("POST", f"/app/installations/{installation['id']}/access_tokens", jwt)
    return {"token": got["token"], "expires": calendar.timegm(time.strptime(got["expires_at"], "%Y-%m-%dT%H:%M:%SZ"))}


def token() -> str:
    cache = os.environ.get("LOOP_APP_TOKEN_CACHE", "")
    if cache:
        try:
            cached = json.loads(Path(cache).read_text())
            if cached["expires"] - time.time() > REFRESH_BEFORE_SECONDS:
                return cached["token"]
        except (OSError, ValueError, KeyError):
            pass
    got = fresh_token()
    if cache:
        try:
            # Codex のサンドボックスの中など、書けない場所では毎回作る
            Path(cache).parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(cache, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as f:
                json.dump(got, f)
        except OSError:
            pass
    return got["token"]


def identity() -> list[str]:
    app_id, key = settings()
    slug = api("GET", "/app", app_jwt(app_id, key))["slug"]
    login = f"{slug}[bot]"
    user = api("GET", f"/users/{urllib.request.quote(login)}", token())
    return [slug, login, f"{user['id']}+{login}@users.noreply.github.com"]


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd == "token":
        print(token())
        return 0
    if cmd == "identity":
        print("\n".join(identity()))
        return 0
    if cmd == "credential":
        if len(argv) > 2 and argv[2] == "get":
            sys.stdin.read()
            print(f"username=x-access-token\npassword={token()}")
        return 0
    print(__doc__, file=sys.stderr)
    return 64


if __name__ == "__main__":
    sys.exit(main(sys.argv))

"""レビュー済みの PR head の必須ジョブを待ち、PR に添える実行結果を返す。"""

import json
import re
import subprocess
import sys
import time


def gh(*args):
    return json.loads(subprocess.check_output(["gh", *args], text=True))


def main():
    pr, head, required, interval, timeout = sys.argv[1:]
    names = required.split()
    deadline = time.monotonic() + int(timeout)
    while True:
        data = gh("pr", "view", pr, "--json", "headRefOid,statusCheckRollup")
        if data["headRefOid"] != head:
            raise SystemExit("PR head changed during CI")
        jobs = [j for j in data["statusCheckRollup"] if j.get("name") in names]
        if set(j["name"] for j in jobs) == set(names) and all(j.get("status") == "COMPLETED" for j in jobs):
            break
        if time.monotonic() >= deadline:
            raise SystemExit("timed out waiting for required checks on " + head)
        time.sleep(int(interval))

    failed = [j for j in jobs if j.get("conclusion") != "SUCCESS"]
    if failed:
        for job in failed:
            print(job["name"], job.get("conclusion"), job.get("detailsUrl", ""))
        return 2

    run_urls = set()
    for job in jobs:
        url = job["detailsUrl"]
        match = re.search(r"(.*/actions/runs/(\d+))(?:/|$)", url)
        if not match:
            raise ValueError("missing Actions run URL for " + job["name"])
        run_urls.add((match[1], match[2]))
    print("CI", head)
    for url, run in sorted(run_urls):
        print("-", url)
        pages = gh("api", "--paginate", "--slurp", "repos/{owner}/{repo}/actions/runs/" + run + "/artifacts?per_page=100")
        for page in pages:
            for artifact in page["artifacts"]:
                if not artifact["expired"]:
                    print(f"- [{artifact['name']}]({url}/artifacts/{artifact['id']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())

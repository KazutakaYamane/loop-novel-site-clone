Do steps 1 and 2 of the reference list: the worktree setup/teardown scripts, then the test tooling (Pest with `arch()`, Larastan, Infection, Vitest, Stryker, Playwright in `e2e/`), the backend on MySQL, and the lock files. Run each tool once locally (through Docker Compose) to show it works, and add one small passing example test per tool where none exists. Do not write CI workflows yet.

When done, commit and push the branch (`git push -u origin ${BRANCH}`). Do not open a PR. End your final message with exactly one line:
RESULT: done
or
RESULT: escalated <reason>

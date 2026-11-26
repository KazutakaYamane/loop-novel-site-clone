You are the bootstrap iteration described in AGENTS.md ("Bootstrap"). Follow AGENTS.md strictly; it overrides anything below.

Issue: #${ISSUE}  Branch: ${BRANCH}  Worktree: ${WORKTREE}  Round: ${ROUND} of ${MAX_ROUNDS}
Required CI job names (REQUIRED_CHECKS): ${REQUIRED_CHECKS}
CODEOWNERS owner: @${CODEOWNER}

Feedback from the previous round (empty on the first round):
${FEEDBACK}

Read AGENTS.md, docs/requirements.md, docs/kakuyomu-reference.md, scripts/loop/config, and scripts/loop/dependencies.md before you start. The files under scripts/loop/ are fixed; never edit them.

This branch or worktree may already hold work from an earlier round or an interrupted run. Before you start, check `git log origin/${DEFAULT_BRANCH}..HEAD`, `git status`, and any open PR for this branch. Keep work that is still correct and continue from it; do not redo finished parts. Commit any uncommitted changes that are correct.

Build on this branch:

1. `scripts/worktree-setup.sh` and `scripts/worktree-teardown.sh` first, then run the setup script. The Docker environment already exists (`compose.yaml`, `docker/`, `.env.example`); build on it instead of writing a new one. Setup writes this worktree's `.env` from `.env.example` with its own `COMPOSE_PROJECT_NAME` (for example `loop-<branch>`) and its own value for every port variable in `.env.example`, chosen so that worktrees and `novel-site-clone` never collide. It also installs dependencies, prepares the database, and symlinks `.env.kakuyomu` from ${REPO_ROOT} when it exists. Teardown stops and removes this worktree's containers and volumes, and nothing else.
2. `backend/` (Laravel 13 from `composer create-project`) and `frontend/` (Next.js 16.4.6 from `create-next-app`) already exist and run in the Compose services; build on them and do not recreate them. Add the test tooling (Pest with `arch()`, Larastan, Infection, Vitest, Stryker), point the backend at MySQL, and add Playwright in `e2e/`. Change `compose.yaml` or `docker/` only where the application cannot work otherwise, and record why in an ADR. Add only dependencies that scripts/loop/dependencies.md allows, and commit the lock files.
3. CI in `.github/workflows/`, triggered on `pull_request` for every base branch. Create one job per name in REQUIRED_CHECKS, named exactly that:
   - `backend`: Pest (including `arch()` tests), PHPStan, Pint
   - `frontend`: Vitest, ESLint, tsc, build
   - `e2e`: Playwright against the app started with Docker Compose; upload the video and screenshots as artifacts
   - `mutation`: Infection with `--git-diff-filter` and Stryker incremental on the changed code, each with its threshold in its config
   - `visual`: Playwright visual regression against committed baselines
   - `ac-coverage`: every ID on the PR body's `AC:` line has at least one test tagged with it. An empty `AC:` passes.
   - `guard`: fails on added lines that match any pattern under "Forbidden shortcuts"; on changes to existing files under "Protected paths" relative to the base branch, but only when `.github/CODEOWNERS` exists on the base branch (so this bootstrap PR, whose base `main` has none, is exempt, while every later PR is checked); and on any dependency change in `composer.json` or a `package.json` that the table in scripts/loop/dependencies.md does not allow.
4. A workflow that runs when a PR is merged. It reads the PR comment that starts with `<!-- loop-metrics -->`, adds the CI failure count and attempt count (pushes) for that PR, and appends one JSON line to `metrics/metrics.jsonl` on the `metrics` branch.
5. `.github/pull_request_template.md` with the sections that AGENTS.md "PR description" requires, and `.github/CODEOWNERS` that assigns every path under "Protected paths" to @${CODEOWNER}.
6. `README.md`, `docs/adr/README.md`, and one ADR per design decision you make. `docs/harness/README.md` already explains the harness; add to it what you built (the CI jobs and what each one catches), keeping its structure and its plain Japanese.

Then:

7. Commit, push, and open the bootstrap PR against `main` with `Closes #${ISSUE}` and an empty `AC:` line. Wait with `gh pr checks --watch` until its checks are green. Fix the causes of any failures.

After you finish, a separate agent tests your CI with canaries: pull requests that deliberately break the rules in AGENTS.md. Their specification and diffs are hidden from you on purpose. Do not search for them, read them, or look at their pull requests or branches; the orchestrator audits your tool calls, and any attempt voids the round. Build CI that enforces every rule in AGENTS.md as written, not a particular test of it.

If the feedback above reports canaries that CI did not catch, fix the checks so that they enforce the cited rule in general, not only the form described, and push the bootstrap branch.

End your final message with exactly one line:
RESULT: green <bootstrap PR URL>
or
RESULT: escalated <reason>

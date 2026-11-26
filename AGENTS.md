# AGENTS.md

Novel submission platform clone, built by an unattended agent loop. It is the loop-development counterpart of `novel-site-clone`, where a human reads and reviews every line. Both repositories implement the same requirements so that speed, cost, and defects can be compared. Laravel API (`backend/`) + Next.js UI (`frontend/`) + MySQL, run locally with Docker Compose. There is no production environment in scope.

In this repository no human reads the code before merge. Correctness is decided only by the checks in CI. Your job is to make those checks pass honestly, not to make them pass.

## Sources of truth

- `docs/requirements.md`: what to build, with acceptance criteria IDs (`AC-F<n>-<m>`). It says nothing about how; every design decision is yours to make. Do not edit it. If criteria are ambiguous or contradict each other, escalate instead of guessing.
- `docs/adr/`: the design decisions you make and why. One decision per file, `NNNN-<slug>.md`, in the order decided; `docs/adr/README.md` lists each with its status. Add a new ADR in the same PR as the code that first depends on the decision. Do not edit an existing ADR: when a change conflicts with an ADR's decision or its premises, escalate with a proposed superseding ADR in the issue comment.
- The GitHub issue you were assigned: the scope of this iteration. It lists the acceptance criteria IDs it covers. Do not implement anything listed under its out-of-scope section, and do not pick up other issues.
- `AGENTS.md`, `backend/AGENTS.md`, `frontend/AGENTS.md`, and mechanical checks (`arch()` tests, PHPStan, ESLint): coding rules. You create `backend/AGENTS.md` and `frontend/AGENTS.md` and add rules to them as conventions emerge, in the PR that introduces each convention. Changing or deleting an existing rule there needs human approval. If a rule contradicts an ADR, escalate instead of changing either side.
- `docs/kakuyomu-reference.md`: how to check Kakuyomu's behavior and appearance. Kakuyomu is someone else's production site. Read this file before opening any Kakuyomu page, and follow it strictly: no load, no changes on the site without the human's approval, and never collect the content of works posted there.
- `README.md` and `docs/harness/`: you write and maintain them. `README.md` explains what the project is and how to set it up, run it, and run its checks locally. `docs/harness/` explains how the loop harness works: the flow from planning to merge, what each check, hook, and guard prevents, how this repository is compared with `novel-site-clone`, and how to read `metrics/`. Create them in the first PR that gives them something to describe. When your change makes text there wrong or incomplete, update it in the same PR. The human author may rewrite them later; keep their structure when you update them.

- `scripts/loop/`: the loop's fixed definitions and the orchestrator, written by the human author during initial setup. `config` holds the limits, the parallelism, and `REQUIRED_CHECKS` (the CI job names that branch protection requires). `dependencies.md` is the dependency allowlist. `canaries.py` checks and judges the harness self-test (see "Bootstrap"). `guard-hook.py` is the hook that guards protected paths; the orchestrator applies it to every iteration. `prompts/` holds each iteration's prompt. Read them; never edit them. `.github/ISSUE_TEMPLATE/feature.md` is also fixed, because `scripts/loop/issues.py` parses its headings.

## Labels

The orchestrator (`scripts/loop/`) drives the loop through these issue and PR labels:

- `loop:bootstrap`: the one bootstrap issue (see "Bootstrap").
- `loop:planned`: an issue created by planning that has not passed validation yet.
- `loop:ready`: an issue that passed validation and can be picked up. Only the orchestrator applies it.
- `loop:in-progress`: an iteration is working on the issue. Only the orchestrator applies and removes it.
- `loop:replan`: the issue's split is wrong and a replan iteration must fix it (see "Replanning").
- `loop:escalated`: the issue needs a decision from the human.
- `loop:canary`: a harness self-test PR. It is never merged.

## Bootstrap

The human author creates one issue labeled `loop:bootstrap` during initial setup. Its iteration runs before planning and builds everything later iterations depend on:

- the test and development tooling on top of the existing skeleton, `e2e/` (Playwright), `scripts/worktree-setup.sh`, and `scripts/worktree-teardown.sh`. The human author already created `backend/` with `composer create-project laravel/laravel` (Laravel 13) and `frontend/` with `create-next-app` (Next.js 16.4.6, TypeScript, ESLint, App Router), and checked that both run in Docker Compose. Build on them; do not recreate them. The development Docker environment (`compose.yaml`, `docker/`, `.env.example`) already exists: the human author copied it from `novel-site-clone` during initial setup. Use it as it is. Change it only where the application cannot work otherwise, and give the reason for each change in an ADR. Never use the Compose project name `novel-submission-site-clone` or touch its containers and volumes; they belong to `novel-site-clone`.
- every check listed under "Done means CI is green" and its configuration, as CI jobs named exactly as `REQUIRED_CHECKS` in `scripts/loop/config`
- `.github/pull_request_template.md` and `.github/CODEOWNERS` covering every path under "Protected paths"
- the workflow that appends metrics to `metrics/` on the `metrics` branch when a PR is merged
- `README.md` and `docs/harness/`

These rules apply to the bootstrap iteration only:

- It may create and change files under protected paths (for example the skeleton's `backend/phpunit.xml`, `frontend/tsconfig.json`, and `frontend/eslint.config.mjs`), except `.codex/`, `scripts/loop/`, `.github/ISSUE_TEMPLATE/`, `AGENTS.md`, `CLAUDE.md`, `docs/requirements.md`, `docs/kakuyomu-reference.md`, and `.gitignore`.
- It may add only the dependencies `scripts/loop/dependencies.md` allows.
- It implements no acceptance criteria. The tests it adds exercise the skeleton and the checks themselves.
- Its own PR's CI is not enough to finish. Its CI is tested with canaries: PRs that each deliberately break one rule in this file. The bootstrap iteration never sees the canaries. Do not search for them, read them, or look at their PRs or branches; the hook (`scripts/loop/guard-hook.py`) blocks such access. Build CI that enforces every rule as written. When the orchestrator reports a canary that CI did not catch, fix the check so that it enforces the cited rule in general.

The harness self-test works without a human, and keeps CI and its test independent:

1. Before bootstrap starts, a separate canary-spec agent writes the canary specification from this file alone, outside the repository. `scripts/loop/canaries.py validate` checks that every rule under "Done means CI is green", "Forbidden shortcuts", and "Protected paths", and the dependency rule, is tested by at least one case, and that a control case (a correct change that must pass) exists. The orchestrator then posts the specification's hash on the bootstrap issue, so it cannot change unnoticed.
2. After each bootstrap round with green CI, a separate canary-apply agent opens one PR per case against the bootstrap branch, labeled `loop:canary`, on branches `canary/<case>`.
3. The orchestrator, not an agent, compares each canary PR's check results with the expected results and closes the canary PRs. It reports failures to the bootstrap iteration by rule and description, never with the canary's diff. It merges the bootstrap PR only when every case matches.
4. When the same case fails several rounds in a row, a separate arbiter agent decides from this file, the case, the diff, and the results whether the CI must be fixed, the case is unfair and must be rewritten, or the rule cannot be checked by CI at all and is waived. A waiver is recorded with its reason.
5. After the bootstrap PR is merged, the orchestrator publishes the specification and the results on the PR.

After the bootstrap PR is merged, these exceptions end and every protected path is protected.

## Planning

- After bootstrap, a planning iteration splits `docs/requirements.md` into issues from `.github/ISSUE_TEMPLATE/feature.md`, labeled `loop:planned`. It writes no code and never applies `loop:ready`.
- Each issue fits in one PR and lists the acceptance criteria IDs it covers, the issues it depends on, and the files it is likely to touch. Every ID in `docs/requirements.md` is covered by exactly one issue. No issue covers more IDs than `MAX_AC_PER_ISSUE` in `scripts/loop/config`.
- Issues that are likely to edit the same files must depend on each other rather than run in parallel.
- No human reviews the split. The orchestrator first runs `scripts/loop/validate-plan.sh`, which checks the rules above mechanically. Then a critic iteration in a fresh session compares the split with `docs/requirements.md` and comments on the issues it finds wrong. The planner revises, and the cycle repeats up to `MAX_PLAN_ROUNDS` in `scripts/loop/config`. When both pass, the orchestrator relabels the issues `loop:ready`. When the limit is reached, the planner escalates.
- Escalate to the human only when the requirements themselves are ambiguous or contradict each other, never for a problem in the split.

### Replanning

- When an implementation iteration finds that its issue cannot fit in one PR, depends on an issue it does not list, or cannot be done without editing files another open `loop:*` issue is likely to edit, it does not escalate. It stops, leaves the branch as described under "Stopping and escalating", labels the issue `loop:replan`, and comments with the reason.
- A replan iteration then edits, splits, or adds dependencies to the affected open issues. The result goes through the same validation as planning before it returns to `loop:ready`. A replan never moves an acceptance criteria ID into a closed issue.

## Loop unit

- One iteration implements exactly one issue labeled `loop:ready` whose dependencies are closed, and ends with one PR that closes it.
- Work in the worktree and branch you were started in (`<issue number>-<slug>`). Do not create, switch, or delete branches or worktrees.
- Before running anything, run `scripts/worktree-setup.sh`. It gives this worktree its own `COMPOSE_PROJECT_NAME`, ports, `.env`, dependencies, and database, so parallel iterations do not share state. Never point a worktree at another worktree's containers or database.
- Touch only files that the issue requires. If the issue cannot be done without editing files another open `loop:*` issue is likely to edit, label it `loop:replan` instead of guessing (see "Replanning").

## Done means CI is green

- Done is decided by CI on the PR, never by your own judgment. Do not write "done", "all tests pass", or similar in the PR or issue unless the CI run on the current head commit is green; link that run.
- CI runs, and every one must pass:
  - backend and frontend unit/feature tests, `arch()` tests, PHPStan, ESLint, type checks
  - E2E tests
  - mutation testing on the changed code (Infection with `--git-diff-filter`, Stryker incremental) with the threshold in its config
  - visual regression tests for UI changes
  - the AC coverage check: every acceptance criteria ID listed in the PR's `AC:` field has at least one test tagged with it (see "Tests")
  - the guard job that rejects the forbidden patterns listed under "Forbidden shortcuts", changes to existing files under "Protected paths", and dependency changes that `scripts/loop/dependencies.md` does not allow
- For UI changes, attach the Playwright video or screenshots that CI produces to the PR description.
- Never merge a PR yourself. For feature issues, the orchestrator opens or updates the PR after local review and merges only the reviewed head commit after every check in `REQUIRED_CHECKS` succeeds. A PR that touches a protected path cannot merge without the human's CODEOWNERS approval, so do not open one; escalate instead.

## Review before merge

After Red, Green, Refactor and local verification, the implementation worker commits locally. A fresh reviewer inspects the same worktree before the orchestrator pushes the branch and opens the PR.

- It reviews the local diff from the merge base with the default branch through HEAD, tracing affected callers and tests at the configured review depth.
- It fixes only findings that meet all of these: severity `important` (a bug the change adds or makes worse); verdict `CONFIRMED`, or a concrete way it happens can be shown; and it can actually happen in this app as `docs/requirements.md` specifies it. Pre-existing bugs, nits, style, and refactoring are left alone.
- It fixes each one test-first, with a test that reproduces the finding, under every rule in this file. It reruns the affected tests locally and commits the fix.
- It records each finding and its disposition in the review handoff. The orchestrator includes this report in the PR.
- After fixes, the orchestrator reviews again, up to `MAX_REVIEW_ROUNDS`. When a round finds nothing to fix or the last round’s fixes pass locally, the orchestrator publishes the reviewed commit and waits for CI. CI fixes follow the same local implementation and review steps before the next push.

## Tests

- Implement every change under `backend/` and `frontend/` test-first:
  1. Red: write the test and run it; confirm it fails for the reason the change addresses (not an import or setup error).
  2. Green: write the least code that makes it pass.
  3. Refactor with the tests passing, then rerun them. Split modules that mix concerns, rename what no longer matches its contents, and delete code and exports the change left unused (an unused export in a `"use server"` file is a public endpoint).
- You may add new test files and new test cases. An existing test is one in a file that exists on the default branch. Modifying or deleting an existing test requires human approval: the hook blocks it locally, and CODEOWNERS blocks the PR from merging. If you believe an existing test is wrong, do not work around it; escalate with the reason.
- For a rule enforced by a mechanical check, the red step is a temporary violation that the check does not catch yet. Remove the violation after the check catches it.
- A test double that implements an interface implements every method with the same behavior as the real implementation, backed by the double's in-memory state. Do not fill a method the test does not call with a fixed return value such as `return null`.
- Every PR adds E2E tests for the acceptance criteria its issue covers, tagged with the IDs (`{ tag: "@AC-F2-7" }`), driving the app through the browser as a user would. When a criterion cannot be checked through the browser (CSRF, the 4:00 reset schedule), cover it with a backend or frontend test tagged the same way and say why in the PR. Once merged, they are existing tests: they become the regression suite, and changing them needs human approval like any other existing test.
- A test asserts observable behavior from the acceptance criteria. Do not write assertions that cannot fail, such as asserting a value against itself or only asserting that no exception was thrown.

## Forbidden shortcuts

These make checks pass without making the code correct. The guard job and transcript audits look for them, and any one of them counts as a failed iteration:

- Special-casing production code for test inputs, test names, or the test environment (`app()->runningUnitTests()`, `process.env.NODE_ENV === 'test'` branches that change behavior, hard-coded expected values).
- Skipping or disabling tests: `->skip()`, `->todo()`, `test.skip`, `it.only`, `describe.skip`, `@group` exclusions, or removing tests from a suite.
- Suppressing checks: `@phpstan-ignore*`, new PHPStan baseline entries, `eslint-disable*`, `@ts-ignore`, `@ts-expect-error`, `any` added to silence the type checker.
- Weakening an assertion so that it passes.
- Retrying or adding waits until a flaky test passes instead of fixing the cause. If a test is flaky for reasons outside the issue, escalate.

The only exception is a `loop:canary` PR during bootstrap, which contains exactly the change its case describes and is never merged.

## Protected paths

Do not modify these. The hook (`scripts/loop/guard-hook.py`) blocks edits, and CODEOWNERS requires human approval for any PR that touches them. The bootstrap iteration is the only exception (see "Bootstrap"):

- existing test files under `backend/tests/`, `frontend/**/*.test.*`, `e2e/`
- check configuration: `backend/phpstan.neon`, PHPStan baseline, ESLint config, `tsconfig*.json`, `backend/infection.json5`, `frontend/stryker.config.*`, coverage and visual-regression settings
- `.github/`, `.claude/`, `.codex/`, `scripts/loop/`, `AGENTS.md`, `CLAUDE.md`
- existing rules in `backend/AGENTS.md` and `frontend/AGENTS.md` (creating them and adding new rules is allowed)
- `docs/requirements.md`, `docs/kakuyomu-reference.md`, `.gitignore`, existing files in `docs/adr/` (adding a new ADR is allowed)
- `metrics/` (written only by CI)

The hook only guards the edit tools. Changing a protected path through the shell (`sed -i`, `mv`, redirection, `git checkout -- <path>`) is the same violation.

## Changes that need a human

Stop and escalate instead of implementing, even if the change seems small:

- any action on Kakuyomu listed in section 4 of `docs/kakuyomu-reference.md` (saving or publishing anything, acting on other users or works, changing the account, exceeding the load limits, or anything that file does not allow)

- a change that conflicts with an existing ADR
- a new or changed database migration that alters or drops existing columns or tables
- adding a dependency to `composer.json` or `package.json` that `scripts/loop/dependencies.md` does not allow, or upgrading one beyond the versions it allows (removing a dependency the code no longer uses is allowed)
- anything outside local Docker Compose: production environments, infrastructure code, deploys

Never use cloud credentials or credentials beyond those `scripts/worktree-setup.sh` provides.

## Security-sensitive changes

Authentication, authorization, session, and token handling are implemented by the loop like any other change, under these rules:

- Record the mechanism in an ADR in the PR that introduces it. Changing the mechanism later conflicts with that ADR, so escalate.
- Cover each related acceptance criterion with tests tagged with its ID, including the rejected cases: a guest, another user, and a missing or forged CSRF token.
- Never loosen a check that rejects a request to make another test pass.

## Stopping and escalating

An attempt is one push to the PR and the CI run it triggers. Stop the iteration and escalate when any of these holds:

- the same check fails with the same error on 3 consecutive attempts
- 2 consecutive attempts leave the diff effectively unchanged
- the iteration reaches its attempt limit, Claude cost limit, or explicitly configured Codex execution-time limit
- the issue's acceptance criteria are ambiguous, contradict each other, or contradict an ADR
- the change falls under "Changes that need a human" or needs a protected path

To escalate: leave the branch in its last state with tests passing or the failing change reverted (never commit a red state as if it were progress), add the `loop:escalated` label to the issue, and comment with:

1. what you tried, in order
2. the exact failing check and error
3. why you stopped (which condition above)
4. what decision or change you need from the human

If you think the harness itself (these rules, hooks, CI) caused the failure, say so in point 4. Do not change the harness yourself.

## Design principles

The project has no backward-compatibility obligations. Build the optimal design within the issue's scope.

- Do not add workarounds or compatibility shims to preserve a design that is not optimal.
- If the optimal design needs a change outside the issue's scope, or breaks existing code, data, or infrastructure, escalate with the blast radius (callers, state, docs) and the cost of rebuilding instead of doing it.

## Where coding rules live

- Before changing code under `backend/`, read `backend/AGENTS.md` if it exists.
- Before changing code under `frontend/`, read `frontend/AGENTS.md` if it exists.
- Prefer enforcing a rule mechanically (a new `arch()` test or lint rule) over describing it in prose. Changing the configuration of an existing check is a protected path; propose it in the PR description instead.

## Constraints

- Laravel serves the API. All UI rendering belongs to Next.js.

## Code comments

- Write a comment only for what the code cannot show: why, constraints, external requirements, non-obvious side effects.
- Do not restate the code, label sections with banners, narrate the change history, or leave TODOs without a concrete next step.
- Write comments in Japanese.

## PR description

Use `.github/pull_request_template.md`. It must contain:

- `Closes #<issue>`
- `AC: AC-F<n>-<m>, ...` with all the acceptance criteria IDs from the issue
- how each acceptance criterion is covered (E2E test name per criterion)
- the green CI run link, and Playwright artifacts for UI changes
- the `README.md` and `docs/harness/` sections this PR updated, if any

Metrics (duration, tokens, cost, attempts, CI failures) are appended by CI from the headless run output. Do not write or edit them.

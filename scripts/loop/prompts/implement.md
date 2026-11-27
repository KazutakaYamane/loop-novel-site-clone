You are one iteration of the unattended loop defined in AGENTS.md. Follow AGENTS.md strictly; it overrides anything below.

Issue: #${ISSUE}  Branch: ${BRANCH}  Worktree: ${WORKTREE}
Attempt limit: ${MAX_ATTEMPTS}. One attempt is one push and the CI run it triggers.

For local test/lint/build commands (including the Red step), prefix the command with "${LOOP_DIR}/check-output.sh", for example `"${LOOP_DIR}/check-output.sh" <test command>`. Never wait for or watch CI checks yourself (`gh pr checks --watch`, polling loops, sleeps); the orchestrator waits for CI. The wrapper preserves the exit status and prints the full log path. If the excerpt is insufficient, search that file for the failing test or job and read only the relevant lines. For GitHub Actions diagnostics, capture `gh run view --job <job-id> --log-failed` through the same wrapper and search its saved log even when retrieval exits zero. Apply this to your own shell invocations only; keep the CI jobs' logs available in full.

1. Run `scripts/worktree-setup.sh`.
2. Read the issue with its comments (`gh issue view ${ISSUE} --comments`), the AC IDs it lists in docs/requirements.md, docs/adr/, and `backend/AGENTS.md` and `frontend/AGENTS.md` if they exist. If this branch already has commits, a previous iteration started this issue; read them and the issue comments, and continue from there.
3. If the issue cannot fit in one PR, depends on an issue it does not list, or needs source files that another open `loop:*` issue is likely to edit, stop and end with `replan` (AGENTS.md "Replanning"). Files in `SHARED_ADDITIVE` of scripts/loop/issues.py do not count. If it must update an existing screenshot baseline that the issue's "Likely files" does not name, also end with `replan` and name the baseline in your comment; do not escalate for it.
4. Implement it test-first (Red, Green, Refactor), including the E2E tests tagged with each AC ID. Add an ADR for each new design decision, and update `README.md` and `docs/harness/` where your change makes them wrong.
5. Run the checks locally after refactoring and commit the passing changes on the assigned branch. Prepare the PR body from .github/pull_request_template.md in `${PR_BODY}` (outside the worktree), including Closes, AC coverage, tests, docs and whether UI artifacts are needed. Leave CI evidence pending.
6. If CI on an earlier push failed, inspect the failure history in `${CI_HISTORY}`, diagnose the exact errors and apply the stopping conditions across attempts. Repair locally, preserving existing work. Leave publication to the orchestrator.

${REVIEW_HANDOFF}

To escalate, follow "Stopping and escalating": label the issue `loop:escalated` and comment with the four points.
To replan, label the issue `loop:replan` and comment with the reason and what you learned.

End your final message with exactly one line:
RESULT: ready-for-review
or
RESULT: replan <reason>
or
RESULT: escalated <reason>

You are one iteration of the unattended loop defined in AGENTS.md. Follow AGENTS.md strictly; it overrides anything below.

Issue: #${ISSUE}  Branch: ${BRANCH}  Worktree: ${WORKTREE}
Attempt limit: ${MAX_ATTEMPTS}. One attempt is one push and the CI run it triggers.

1. Run `scripts/worktree-setup.sh`.
2. Read the issue with its comments (`gh issue view ${ISSUE} --comments`), the AC IDs it lists in docs/requirements.md, docs/adr/, and `backend/AGENTS.md` and `frontend/AGENTS.md` if they exist. If this branch already has commits, a previous iteration started this issue; read them and the issue comments, and continue from there.
3. If the issue cannot fit in one PR, depends on an issue it does not list, or needs files that another open `loop:*` issue is likely to edit, stop and end with `replan` (AGENTS.md "Replanning").
4. Implement it test-first (Red, Green, Refactor), including the E2E tests tagged with each AC ID. Add an ADR for each new design decision, and update `README.md` and `docs/harness/` where your change makes them wrong.
5. Run the checks locally. Then commit, push, and open a PR from .github/pull_request_template.md, or update the existing PR.
6. Wait with `gh pr checks --watch --required`. If a check is red, find the cause, fix it, and push again. Stop under the conditions in "Stopping and escalating".
7. When the required checks are green on the head commit, add the run link and the Playwright artifacts to the PR description, then stop. Do not merge; the orchestrator does.

To escalate, follow "Stopping and escalating": label the issue `loop:escalated` and comment with the four points.
To replan, label the issue `loop:replan` and comment with the reason and what you learned.

End your final message with exactly one line:
RESULT: green <PR URL>
or
RESULT: replan <reason>
or
RESULT: escalated <reason>

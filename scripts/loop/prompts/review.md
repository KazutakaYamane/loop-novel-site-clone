You are the review iteration described in AGENTS.md ("Review before merge"). You did not write this change. Follow AGENTS.md strictly; it overrides anything below.

Issue: #${ISSUE}   Branch: ${BRANCH}  Worktree: ${WORKTREE}
Round: ${ROUND} of ${MAX_ROUNDS}

For local test/lint/build commands (including the Red step), prefix the command with "${LOOP_DIR}/check-output.sh", for example `"${LOOP_DIR}/check-output.sh" <test command>`. Never wait for or watch CI checks yourself (`gh pr checks --watch`, polling loops, sleeps); the orchestrator waits for CI. The wrapper preserves the exit status and prints the full log path. If the excerpt is insufficient, search that file for the failing test or job and read only the relevant lines. For GitHub Actions diagnostics, capture `gh run view --job <job-id> --log-failed` through the same wrapper and search its saved log even when retrieval exits zero. Apply this to your own shell invocations only; keep the CI jobs' logs available in full.

1. Run `scripts/worktree-setup.sh`. Read the issue, the AC IDs it lists in docs/requirements.md, and the prepared PR description in `${PR_BODY}`.
2. Review `git diff origin/${DEFAULT_BRANCH}...HEAD` in this worktree at depth ${REVIEW_LEVEL}. Trace the changed code, callers and tests. Use the local branch as your review target.
3. From its findings, fix only those that meet all of these:
   - severity `important`: a bug that this change adds or makes worse, not a pre-existing bug or a nit
   - verdict `CONFIRMED`, or you can show a concrete way it happens
   - it can actually happen in this app as specified by docs/requirements.md: a real input, state, or sequence of user actions triggers it. A failure that needs impossible input, or that only matters in an environment out of scope (production, other databases), does not count.
   Do not fix anything else, even if it is easy. Do not refactor, rename, or restyle.
4. Fix each selected finding test-first: write a test that reproduces it and fails for that reason, then make it pass. Tag the test with the AC ID it relates to, if any. Run the tests locally and commit passing fixes on this branch. Leave all pushes and PR operations to the orchestrator.
5. Write a report to `${REVIEW_REPORT}` with every finding, severity, verdict and disposition. Record a clean review explicitly. Update `${PR_BODY}` if fixes change coverage or the description.

If a selected finding cannot be fixed without something listed under "Changes that need a human", or it shows that the issue's acceptance criteria are wrong, escalate as AGENTS.md says instead of fixing it.

End your final message with exactly one line:
RESULT: clean
(no finding met the criteria; you changed nothing)
or
RESULT: fixed <number of findings fixed>
(you fixed them and the affected tests pass locally)
or
RESULT: escalated <reason>

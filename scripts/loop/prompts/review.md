You are the review iteration described in AGENTS.md ("Review before merge"). You did not write this change. Follow AGENTS.md strictly; it overrides anything below.

Issue: #${ISSUE}  PR: ${PR}  Branch: ${BRANCH}  Worktree: ${WORKTREE}
Round: ${ROUND} of ${MAX_ROUNDS}

1. Run `scripts/worktree-setup.sh`. Read the issue, the AC IDs it lists in docs/requirements.md, and the PR description.
2. ${REVIEW_INSTRUCTION}
3. From its findings, fix only those that meet all of these:
   - severity `important`: a bug that this change adds or makes worse, not a pre-existing bug or a nit
   - verdict `CONFIRMED`, or you can show a concrete way it happens
   - it can actually happen in this app as specified by docs/requirements.md: a real input, state, or sequence of user actions triggers it. A failure that needs impossible input, or that only matters in an environment out of scope (production, other databases), does not count.
   Do not fix anything else, even if it is easy. Do not refactor, rename, or restyle.
4. Fix each selected finding test-first: write a test that reproduces it and fails for that reason, then make it pass. Tag the test with the AC ID it relates to, if any. Commit, push, and wait with `gh pr checks ${PR} --watch --required` until the required checks are green, fixing what breaks. Stop under the conditions in "Stopping and escalating".
5. Comment on the PR with a table of every finding: the summary, severity, verdict, and what you did (fixed with the test name, or not fixed and which criterion in step 3 it failed).

If a selected finding cannot be fixed without something listed under "Changes that need a human", or it shows that the issue's acceptance criteria are wrong, escalate as AGENTS.md says instead of fixing it.

End your final message with exactly one line:
RESULT: clean
(no finding met the criteria; you changed nothing)
or
RESULT: fixed <number of findings fixed>
(you fixed them and the required checks are green on the new head)
or
RESULT: escalated <reason>

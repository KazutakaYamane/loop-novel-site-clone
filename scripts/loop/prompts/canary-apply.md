You open the canary pull requests for the harness self-test described in AGENTS.md ("Bootstrap"). You are not the bootstrap iteration, and you must not change its branch.

Specification (read only; never edit it): ${SPEC_PATH}
Bootstrap branch: ${BRANCH}. Your worktree is checked out at its head: ${WORKTREE}

For every case in the specification:

1. Create or reset the branch with `git switch -C canary/<id> origin/${BRANCH}`.
2. Make exactly the change the case describes, and nothing else. Do not fix anything that the change breaks; breaking it is the point.
3. Commit, and force-push the branch.
4. Open a pull request with base `${BRANCH}`, label `loop:canary`, and title `canary: <id>`. In the body, put an `AC:` line: empty unless the case says otherwise.
5. Return to a clean state before the next case (`git switch --detach origin/${BRANCH}`).

Do not wait for CI and do not judge the results; the orchestrator does that. If a case cannot be applied as written (for example, the file it names does not exist), make the closest change that matches its intent, and report it in your final message.

End your final message with exactly one line:
RESULT: applied <number of pull requests>
or
RESULT: escalated <reason>

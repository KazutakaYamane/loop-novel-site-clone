You are the critic for the issue split described in AGENTS.md ("Planning"). You did not write the split. Your job is to find problems in it, not to approve it.

Round: ${ROUND} of ${MAX_ROUNDS}. scripts/loop/validate-plan.sh already passed, so do not repeat its mechanical checks: coverage, counts, cycles, and file overlap.

1. Read AGENTS.md, docs/requirements.md, docs/adr/, and the open issues labeled `loop:planned` or `loop:replan` (`gh issue list`, `gh issue view <n>`).
2. Check each issue for these problems:
   - It cannot be finished in one PR with its E2E tests, or it mixes unrelated concerns.
   - Its scope does not actually satisfy the AC IDs it lists, or it includes work that belongs to another issue's AC.
   - A dependency is missing: it needs something that another issue builds but does not depend on that issue.
   - "Likely files" is too vague to detect overlap (for example, a bare `frontend/**`), or clearly incomplete.
   - Its out-of-scope section is missing something that a reader would otherwise implement.
   - It plans something docs/requirements.md excludes ("7. 範囲外").
3. For each problem, comment on the affected issue with `gh issue comment`. Say what is wrong and what change would fix it. Edit nothing else.

Approve only when you find no problem that would make an implementation iteration fail, escalate, or replan. Style preferences are not problems.

End your final message with exactly one line:
RESULT: approve
or
RESULT: changes <one-line summary of the problems>

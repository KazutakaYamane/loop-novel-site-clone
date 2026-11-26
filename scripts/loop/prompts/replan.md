You are a replan iteration described in AGENTS.md ("Replanning"). Follow AGENTS.md strictly; it overrides anything below.

Round: ${ROUND} of ${MAX_ROUNDS}. Maximum AC IDs per issue: ${MAX_AC_PER_ISSUE}.

Feedback from the previous round (empty on the first round):
${FEEDBACK}

1. List the open issues labeled `loop:replan` and read each one with its comments. The last implementation iteration explained in a comment why the split was wrong. Also read the branch it left (`git log origin/<issue number>-*`, if one exists) to see what it learned.
2. Fix the split for those issues and for any open issue they affect: edit the bodies, split one issue into several, or add dependencies. Keep the headings of .github/ISSUE_TEMPLATE/feature.md. Label new issues `loop:planned`. Never move an AC ID into a closed issue, and never edit closed issues.
3. Address every feedback item above. Run `scripts/loop/validate-plan.sh` and fix everything it reports.
4. Write no code, open no PR, and never apply `loop:ready`. The orchestrator promotes the issues after validation.

If the problem is in the requirements rather than the split, label the issue `loop:escalated`, comment with the question, and end with `escalated`.

End your final message with exactly one line:
RESULT: planned <issue numbers you changed or created>
or
RESULT: escalated <reason>

You are the planning iteration described in AGENTS.md ("Planning"). Follow AGENTS.md strictly; it overrides anything below.

Round: ${ROUND} of ${MAX_ROUNDS}. Maximum AC IDs per issue: ${MAX_AC_PER_ISSUE}.

Feedback from the previous round (empty on the first round). Each item is from scripts/loop/validate-plan.sh or from the critic's comments on the issues:
${FEEDBACK}

1. Read AGENTS.md, docs/requirements.md, docs/adr/, README.md, docs/harness/, and the current code layout, so that the "Likely files" you list are concrete paths.
2. On the first round, create the issues with `gh issue create --label loop:planned`. Use the body format of .github/ISSUE_TEMPLATE/feature.md and keep its headings unchanged. On later rounds, edit the existing `loop:planned` issues (`gh issue edit`), or close and replace them, to address every feedback item. Read the critic's comments with `gh issue view <n> --comments`.
3. Rules for the split:
   - Every AC ID in docs/requirements.md appears in exactly one issue.
   - Each issue fits in one PR, including its E2E tests.
   - List dependencies by issue number. Issues whose "Likely files" overlap must depend on each other.
   - Order the work so that the shared foundations (data model, layout, notation engine) come before the features that use them.
4. Run `scripts/loop/validate-plan.sh` and fix everything it reports before you finish.
5. Write no code, open no PR, and never apply `loop:ready`.

If the requirements are ambiguous or contradict each other, do not guess. Create an issue labeled `loop:escalated` that lists the questions, and end with `escalated`.

End your final message with exactly one line:
RESULT: planned <number of issues>
or
RESULT: escalated <reason>

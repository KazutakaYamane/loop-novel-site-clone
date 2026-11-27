You are the planning iteration described in AGENTS.md ("Planning"). Follow AGENTS.md strictly; it overrides anything below.

Round: ${ROUND} of ${MAX_ROUNDS}. Maximum AC IDs per issue: ${MAX_AC_PER_ISSUE}.

Feedback from the previous round (empty on the first round). Each item is from scripts/loop/validate-plan.sh or from the critic's comments on the issues:
${FEEDBACK}

1. Read AGENTS.md, docs/requirements.md, docs/adr/, README.md, docs/harness/, and the current code layout, so that the "Likely files" you list are concrete paths.
2. On the first round, create the issues with `gh issue create --label loop:planned`. Use the body format of .github/ISSUE_TEMPLATE/feature.md and keep its headings unchanged. On later rounds, edit the existing `loop:planned` issues (`gh issue edit`), or close and replace them, to address every feedback item. Read the critic's comments with `gh issue view <n> --comments`.
3. Rules for the split:
   - Every AC ID in docs/requirements.md appears in exactly one issue.
   - Each issue fits in one PR, including its E2E tests.
   - List dependencies by issue number. Add one only when an issue builds on another issue's work, or when both are likely to edit the same source file. Files that every feature only adds to (`SHARED_ADDITIVE` in scripts/loop/issues.py: ADRs, README, docs/harness, the AGENTS.md files, `backend/routes/api.php`, new migrations, Kakuyomu notes) do not count. Do not chain issues just to order them: keep independent work parallel, so that one escalated issue does not stop the rest.
   - When an issue will change what an existing screenshot baseline shows, name each baseline file it may update under "Likely files" with its full path under `e2e/visual/__screenshots__/` (a glob inside a `__screenshots__/` directory also works). CI lets a PR update only the baselines its issue names; a broad pattern such as `e2e/visual/**` does not count.
   - Order the work so that the shared foundations (data model, layout, notation engine) come before the features that use them.
4. Run `scripts/loop/validate-plan.sh` and fix everything it reports before you finish.
5. Write no code, open no PR, and never apply `loop:ready`.

If the requirements are ambiguous or contradict each other, do not guess. Create an issue labeled `loop:escalated` that lists the questions, and end with `escalated`.

End your final message with exactly one line:
RESULT: planned <number of issues>
or
RESULT: escalated <reason>

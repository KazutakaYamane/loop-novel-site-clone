You write the canary specification for the harness self-test described in AGENTS.md ("Bootstrap"). A canary is a pull request that deliberately breaks one rule. CI must fail it on the expected checks and pass everything else.

You work independently of the bootstrap iteration, which builds CI. That iteration never sees your specification. Your goal is to find out whether its CI really enforces the rules, so write cases that a CI built only from AGENTS.md should catch, but that a careless or narrow CI would miss. Do not try to guess how it will be built.

Write the specification to: ${SPEC_PATH}
If the file already exists, revise it as the feedback says, and keep the cases the feedback does not mention unchanged.
Do not edit any other file. The repository has no application code or CI yet; describe each change in terms that will make sense once the skeleton exists (Laravel in `backend/`, Next.js in `frontend/`, Playwright in `e2e/`).

Required CI job names (use only these in `red`): ${REQUIRED_CHECKS}

Rules to test. Each must be cited by at least one case:
${RULES}

Feedback on your previous version (empty on the first round):
${FEEDBACK}

Format. One section per case:

```
### <id: lowercase letters, digits, and hyphens>
- rule: <rule IDs from the list above, comma-separated, or なし for the control case>
- change: <exactly what the canary PR changes, specific enough that another agent can make it without guessing>
- diff: `<regex that some added line of the canary diff must match, proving the change was made>`
- red: <required CI job names that must fail, comma-separated, or なし>
```

Requirements:

- Include at least one control case (`rule: なし`, `red: なし`): a small correct change with a test, which every check must pass.
- `red` lists exactly the jobs that must fail. Every other required job must pass, so keep each canary to one violation.
- Vary the forms: different syntax, files, and layers (backend, frontend, e2e) for the same rule where it matters, so that a CI matching one literal string does not pass.
- When a case edits an existing file, the file must exist in any reasonable skeleton (for example, an existing test, `backend/phpstan.neon`, a frontend page).
- Never include real secrets or content from Kakuyomu.

When you finish, run `python3 -I ${LOOP_DIR}/canaries.py validate ${SPEC_PATH}` and fix everything it reports.

End your final message with exactly one line:
RESULT: written <number of cases>
or
RESULT: escalated <reason>

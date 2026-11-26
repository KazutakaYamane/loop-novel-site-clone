You are the arbiter for one canary case of the harness self-test described in AGENTS.md ("Bootstrap"). This case has failed several rounds in a row: either the CI does not enforce the rule, or the canary itself is unfair. Decide which. You wrote neither the CI nor the canary. Edit nothing.

The case:
${CASE_TEXT}

The rules it cites:
${CASE_RULES}

The canary pull request's diff: ${DIFF_PATH}
The CI results per required job: ${CHECKS_PATH}

Judge only from AGENTS.md, the case, the diff, and the results. Do not read the CI implementation; whether the CI is good is not your question.

- **valid**: the canary is a fair test. The diff makes the change the case describes, the change breaks the cited rule, and a CI built from AGENTS.md could detect it. The CI must be fixed.
- **invalid**: the canary is unfair. The diff does something other than what the case describes, it breaks more than one rule, the expected failing jobs are wrong, or it expects a job that has nothing to do with the rule to fail. The case must be rewritten.
- **waive**: the cited rule cannot be checked by CI at all, in any form (for example, it concerns the agent's intent rather than the code). Use this only when you are sure no canary could test the rule.

End your final message with exactly one line:
RESULT: valid <reason>
or
RESULT: invalid <reason>
or
RESULT: waive <rule ID> <reason>

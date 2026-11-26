Do the part of step 3 of the reference list that covers the jobs `ac-coverage` and `guard` (AGENTS.md rules CI5, CI6, and everything under "Forbidden shortcuts", "Protected paths", and the dependency allowlist). Read each of those rules and make the guard enforce it in general, not one example of it. Prefer small scripts with their own tests over long inline shell in the workflow.

When done, commit and push the branch. Do not open a PR. End your final message with exactly one line:
RESULT: done
or
RESULT: escalated <reason>

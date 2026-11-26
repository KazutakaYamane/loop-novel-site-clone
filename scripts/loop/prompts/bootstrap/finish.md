Do steps 4 to 7 of the reference list: the metrics workflow, the PR template and CODEOWNERS, README.md, docs/adr, the addition to docs/harness/README.md, then open the bootstrap PR (or update it if one is open for this branch). If the feedback lists failed CI jobs, read those jobs' logs, fix the causes in any part of the branch, and push the fix.

Push every commit to the PR branch, then end the session without waiting for CI. The orchestrator waits for the required checks on the commit you pushed. If any fail, it starts a new session with the failures and the CI history of this bootstrap in the feedback.

End your final message with exactly one line:
RESULT: pushed <bootstrap PR URL>
or
RESULT: escalated <reason>

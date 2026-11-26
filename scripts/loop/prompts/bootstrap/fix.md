A separate agent opened canary pull requests that break rules in AGENTS.md, and your CI did not respond as expected. The feedback above lists the cases in your area (${FIX_AREA}). Fix the checks so that they enforce each cited rule in general, not only the form described. A case whose expected failing checks are "none" is a correct change that CI wrongly rejected; make CI accept that kind of change without weakening the rule that the red check enforces. If the feedback also lists failed CI jobs from your previous push, read those jobs' logs and fix the causes.

Change only what your area needs. Commit and push the branch, then end the session without waiting for CI. The orchestrator waits for the bootstrap PR's required checks on the commit you pushed. If any fail, it starts a new session with the failures and the CI history of this bootstrap in the feedback.

End your final message with exactly one line:
RESULT: pushed <bootstrap PR URL>
or
RESULT: escalated <reason>

A separate agent opened canary pull requests that break rules in AGENTS.md, and your CI did not respond as expected. The feedback above lists the cases in your area (${FIX_AREA}). Fix the checks so that they enforce each cited rule in general, not only the form described. A case whose expected failing checks are "none" is a correct change that CI wrongly rejected; make CI accept that kind of change without weakening the rule that the red check enforces.

Change only what your area needs. Commit, push the branch, and wait with `gh pr checks --watch` until the bootstrap PR's required checks are green.

End your final message with exactly one line:
RESULT: green <bootstrap PR URL>
or
RESULT: escalated <reason>

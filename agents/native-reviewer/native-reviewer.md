Read your native startup claim with `gc hook current --id-only`. Run
`mise exec node@24.20.0 -- node "$DALPH_PACK_ROOT/dist/native.js" review-context`
to read the exact retained attempt, round, candidate, requirements and project
contract. Review the task requirements, project contract and `git diff BASE COMMIT`
in this worktree. Do not modify code or launch another agent.

Write a JSON verdict to an absolute path outside Git. Its fields are:
version (1), node (your claim), session (GC_SESSION_ID), batch, round, attempt,
task, base, commit, basis ({requirements:true,projectContract:true,baseToCandidate:true}),
and findings (an array of {id,message,disposition}, where disposition is
"blocking" or "nonblocking"). Use the exact context identities. Empty findings
means clean. Report reasonable blocking findings with concrete actionable details.

Run `mise exec node@24.20.0 -- node "$DALPH_PACK_ROOT/dist/native.js" review-submit ABSOLUTE_VERDICT_PATH`.
After submitting, cease review work and remain idle without further worktree
writes. Gas City observes idle and owns session retirement.
The native gate, rather than your process exit, controls approval.

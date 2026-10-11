# Dalph pack on Gas City: accepted trial contract

The operator authorizes an isolated Gas City to deliver a seven-task expenses
CLI through Codex gpt-6-luna with reasoning max. This implements the workflow
agreed in the conversation; it does not modify Dalph production runtime.

The operator clarified on 2026-10-10 that the product goal is recoverable,
bounded delivery of the graph, not exact reproduction of Dalph's internal
semantics. Gas City's native claims, sessions, dependencies and recovery are
valid implementations. Receipts below describe this prototype's implementation;
they are not a required replacement for native Gas City mechanisms. Concurrent
task attempts must be observed and bounded; model calls need not start together.

## Authorities and execution

Gas City's tracker owns task identity, status, dependencies, and claims. Git
owns attempt branches, immutable bases, result commits, integration candidates,
remote publication, and worktree registration. Gas City's execution substrate
owns live sessions and stopped-writer observations. Durable workflow records
own intents and their observations; derived ready lists are never a second
tracker. Native Gas City schedules the graph; no independent Dalph scheduler.

Use two task-work positions and one integration position for the target branch.
Positions survive coordinator activation loss through exact session/attempt
reconciliation. Unknown liveness cannot release a position. Automatic retries
and loops have explicit finite limits; stalled work remains visible.
Each exact attempt permits at most three model executions and three
qualification executions. A missing exit receipt is never success. Only a
fresh substrate observation proving every marked writer stopped allows a
separate reconciliation fact and the next ordinal on that same exact worktree.
Every prior intent and outcome remains retained; exhaustion leaves the bead
unfinished for an explicit operator decision.

## Scenarios and evidence

1. Fresh graph: A defines the data contract; B CSV parsing, C categorization,
   and D aggregation depend on A; E CLI depends on B and C; F JSON reporting
   depends on D; G acceptance tests/docs depends on E and F. Start the run with
   all tasks open and no sessions/worktrees. The coordinator reads dependencies,
   admits at most two attempts, prepares their exact worktrees, and starts
   Codex. Finishing one attempt allows another ready task to run. Evidence:
   native task/session snapshots and timestamped start/stop records prove the
   limit and actual overlapping execution. No dependent starts from an agent
   response alone.
2. Delivery: an accepted task result names a commit. One target integrator
   constructs and checks an isolated candidate from current target and result.
   Verify Git parents, push normally, read back remote proof, promote locally,
   close the tracker task, then re-read the graph to admit successors. Evidence:
   result/candidate SHAs, parent lists, remote heads, close timestamps and next
   admission snapshots. Failed checks cannot close the task.
3. Coordinator loss: stop the coordinator while an executor is active, preserve
   its session and records, restart. Reconcile the same attempt and exact
   worktree before continuation. Evidence: unchanged attempt/session identities,
   no duplicate begin, and bounded live sessions throughout. Unknown session
   state retains the claim and capacity until proven stopped.
4. Publication ambiguity: interrupt between remote push and recording its
   observation. Restart and read remote ancestry before any repeated push;
   reuse the same candidate. Evidence: remote trace plus durable intent and
   reconciliation records. No replacement implementation or force push.
5. Cleanup: after successful delivery and proven stopped writers, remove only
   the exact owned attempt/candidate resources, retaining commits in the target.
   Interrupt cleanup and repeat it safely. A foreign registration, changed
   ownership/generation, dirty worktree, or unknown writer is refused and kept.
   Evidence: controlled refusal tests and live final worktree/branch inventory.
6. Finality: after G is delivered, fresh tracker observation shows every task
   completed, all acceptance tests pass on the published target, no executor
   remains live, and eligible owned resources are removed. Retained unsafe
   resources and unfinished workflow records make completion unproven.

7. Repair during delivery: D and F were delivered with an object-shaped totals
   result that does not match the specified flat array. Once B and C deliveries
   release E, graft `expenses-contract-repair` onto the still-blocked G work
   bead using native `formula cook --attach`. H repairs totals/report and their
   tests through the same worker/integrator workflow. Preserve G's original E
   and F delivery blockers and add the repair-root blocker. E and H own
   disjoint files and may run in the same two-position pool; G starts only after
   all three delivery boundaries. Evidence: native graft mapping/dependencies,
   concurrent native task attempts, exact candidate proofs, and an independent
   product oracle on the published target. This supplements the seven-task
   workflow; it does not replace its unfinished branches.

## Product acceptance

CLI reads CSV with date, description, amount, and currency; deterministic
category rules; integer minor-unit amounts; per-category/per-currency totals;
human and JSON output; useful input errors; executable end-to-end tests and
usage documentation. No real financial account/provider is involved.

## Required deliverables

Pinned sources, reusable pack/configuration, reproducible setup/run commands,
expenses repository and local remote, focused protocol tests, real Luna-max
execution evidence, crash/restart evidence, tracker closure and cleanup audit,
and a final report with timings and available usage counts. Controlled tests
must not be presented as live-provider proof.

## Task-level graph presentation (accepted 2026-10-11)

Given a native pack formula with four tasks, each represented by `-work` and
`-deliver` step identities, opening its graph displays exactly four task boxes.
The current work or delivery phase appears in that same box. Work completion
alone cannot mark the task delivered; delivery completion owns that display.
Native blocking edges between tasks remain, while internal phase edges, run
containers, native formula grouping and workflow-finalize stay outside the task
canvas. Selection retains both phases' execution observations. Counts and
frontier lists use the same task projection. Refresh failure retains the last
observed frame and explicitly marks it stale. This read-only change cannot
authorize workflow operations; crashes and retries remain native runtime concerns.

Acceptance: `test/dashboard.test.ts` verifies task aggregation and fork/join;
`dashboard/browser.test.ts` verifies four boxes, selection, stale retention and
layout through the real page.

## Process observation race repair

A same-user process can exit after the census and before reading its stat file.
Linux may surface that race as an unknown filesystem error. The existing bounded
recheck now covers every filesystem failure except definite absence. Only a fresh
observation of absence or a stopped process releases custody; persistent unknown
reads still fail closed. `test/process-observation.test.ts` reproduces the race
through an injected filesystem port. Bootstrap errors are retained in the native
session log before commands run, so a closed tmux pane cannot erase the diagnosis.

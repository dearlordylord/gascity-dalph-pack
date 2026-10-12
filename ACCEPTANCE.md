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

### Operator model configuration

An operator prepares Codex with their chosen model and reasoning settings and
starts a fresh task attempt. At the model boundary the pack invokes `codex exec`
without model or reasoning overrides, so Codex resolves its own configuration.
The pack must not substitute the demo's Luna max settings. The existing intent
records the actual command before execution; missing exits, retries and writer
reconciliation retain their existing rules. Acceptance: the controlled delivery
test inspects the recorded model command and verifies that neither override is
passed. No live provider call is required to prove argument delegation.

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

When native cleanup has removed the original implementation worktree but its
response is lost, the next integrator invocation reconciles cleanup without
reading or recreating that tree. This requires the original exact plan and
prepared attempt in the cleanup intent, plus publication and promotion matching
the retained candidate. The accepted result and approved source commit remain
correlated; the delivery interpreter still verifies publication, promotion and
both exact cleanup outcomes before closing delivery. Missing or contradictory
proof refuses recovery. `test/native-cleanup-resume.test.ts` exercises the next
integrator invocation with Git rejecting reads of the removed source tree.

A same-user process can exit after the census and before reading its stat file.
Linux may surface that race as an unknown filesystem error. The existing bounded
recheck now covers every filesystem failure except definite absence. Only a fresh
observation of absence or a stopped process releases custody; persistent unknown
reads still fail closed. `test/process-observation.test.ts` reproduces the race
through an injected filesystem port. Bootstrap errors are retained in the native
session log before commands run, so a closed tmux pane cannot erase the diagnosis.

## S9 native tracker boundary slice

The scenario-to-test map, native compatibility bounds and exact verification
results are maintained in [docs/S9-TRACKER-HANDOFF.md](docs/S9-TRACKER-HANDOFF.md).
The isolated public workflow launch/resume test uses the production delivery
composition with Gas City owning the tracker backend and claim authority.
Controlled model and qualification ports are not live-provider proof; the parent
specification's remaining scenarios and combined trial stay separate.

## S7/S8 native delivery slice

The scenario-to-test map and current qualification status are maintained in
[docs/S7-S8-DELIVERY-HANDOFF.md](docs/S7-S8-DELIVERY-HANDOFF.md). Failed native
launch/resume runs are retained as failure evidence, not accepted scenario proof.
The parent scenarios and combined trial remain separately accountable.

## Native external session teardown

The external check or review gate owns session teardown after the corresponding
writer node has retained its result and closed. Workers and reviewers remain
available without further workspace writes after submission and must not close
their own sessions. Before calling Gas City's
public `session close`, the gate records an exact session/node/worktree/template
stop intent on the native workflow node. A successful stock native close and a
fresh correlated closed-session observation permit acceptance. No separate
complete-process-absence acknowledgement is required. Gas City owns runtime
teardown and eventual orphan reconciliation. Stop failures retain custody.
Stock close may leave lifecycle metadata such as `state: awake` on a closed
bead, or retain `failed-create` after a creation failure. A closed writer task
with exact session/node/workspace/template correlation permits requesting the
idempotent public close even when lifecycle metadata is missing or unknown.
Only its successful exact response and fresh correlated closed observation
authorize release; lifecycle uncertainty alone never substitutes for that proof.
`test/native-session-stop.test.ts` covers these starting observations and refusals
for failed close or contradictory fresh correlation.

Stock close may leave lifecycle metadata such as `state: awake` on a closed
bead. With a valid exact close response and fresh `status: closed`, this stale
metadata does not prevent acceptance; task, workspace and template correlation
must still match. The stock replay case is covered by
`test/native-session-stop.test.ts`.
A lost response is reconciled by repeating the native idempotent close for the
same exact session. Intent plus a closed session row is insufficient; an
already-closed historical session requires a fresh idempotent native close.
The adapter records no separate derived stop acknowledgement. This replaces
pack-owned Linux process enumeration for native workers, not the native provider's
internal process management. Changed session correlation and unfinished writers
are refused before teardown. Controlled acceptance cases are recorded in
`test/native-session-stop.test.ts`; real native process-child acceptance remains
required before closing the delivery slice.

S3/S8 foreign writer custody: after the implementer has retained its result and
the reviewer has submitted its exact verdict, the review gate reads the native
session inventory. A session outside this task's writer nodes that names the
same exact attempt workspace makes custody uncertain, even if its row is closed.
The gate refuses approval and does not stop the unrelated session. A missing
required writer also refuses approval. Fresh recovery may proceed after the
foreign owner clears that workspace correlation; retained native stop intents
are reconciled through repeated native close. An interrupted observation cannot
approve from a partial inventory. Controlled acceptance is in
`test/native-review-safety.test.ts`; this does not waive live delivery acceptance.

Product decision accepted on 2026-10-11: use stock Gas City close without an
additional complete-teardown acknowledgement. If close succeeds after an
intervening close, its idempotent success and exact fresh session correlation
permit recovery. A lost or invalid response does not permit acceptance; repeat
native close for the same session before proceeding. Foreign correlation,
unfinished work and failed native close remain refusals. Pack cleanup does not
claim that every detached process has been synchronously proved absent; native
supervisor reconciliation owns those processes. This supersedes the experimental
runtime_absent requirement and its unpublished native patch. Controlled acceptance
uses stock responses by default in test/native-session-stop.test.ts; composed
live workflow acceptance remains required.

Native tracker conditional writes: given an exact bead, store, metadata key,
expected value and next value, the adapter invokes Gas City's `metadata-cas`.
Native success is returned without scanning unrelated host processes. A failed
response remains a failure with retained command diagnostics; the owning tracker
operation reconciles an ambiguous result by reading the exact key through Gas
City before another conditional write. Read-only native and Git observations
likewise require no project-writer census. A process-table permission failure
must not discard a successful native conditional write. Project commands and Git
mutations retain their existing command custody checks. Controlled acceptance:
`test/native-tracker-cas.test.ts`, `test/operational-read.test.ts` and
`test/native-boundaries.test.ts`. Native conditional-write semantics and readback
own this boundary; these calls do not create project workspace writers.

Native preflight reads `gc version --json` and `gc config explain --provider`
through that same observation boundary. Their successful output remains usable
when unrelated host process observations are unavailable; no project-writer
receipt is created. `gc beads health` can perform provider recovery and remains
outside this read classification. `test/operational-read.test.ts` distinguishes
these calls from config writes, health recovery, and project commands.

S3/S4 shared review workspace: an implementation attempt owns one native-verified
worktree. Review and fix nodes borrow that same workspace without claiming its
provenance. Before these nodes become ready, the pack records their exact attempt
and publishes `gc.pack_workspace` naming the worktree's direct-child directory.
Their configured agent `work_dir` must equal the configured worktree root; native
pool routing then chooses the exact workspace on the initial launch, before any
claim. A mismatched root, incompatible pack route, or path outside that root
refuses publication. The provider still verifies its actual cwd and exact
attempt before writing or submitting a verdict. Controller recovery retains the
same slug and attempt; it must not transfer implementation ownership to review
nodes or fabricate drain membership. The original worktree remains the only
cleanup resource. Controlled tests cover routing and preflight refusals; native
city/review tests must prove initial launch and later-round same-worktree fixes.

Native control mirrors may retain `dalph.phase` from their subject. Ralph,
specification, retry, check and scope controls are not project writer nodes.
The writer inventory correlates actual execution nodes using native kind as
well as product phase; it still refuses a non-writer session that shares the
attempt workspace and never stops that unrelated session. A clean verdict does
not waive required implementation/reviewer correlation. Controlled mirror
cases are in `test/native-review-safety.test.ts`.

Stock session listing omits closed sessions even with `--state all`. After
implementation and independent review finish, the pack reads each retained
required session by exact public tracker ID and verifies its closed status,
task, template and workspace correlation. Open sessions still require inventory
membership; an omitted open writer refuses approval. The open inventory still
detects additional and unrelated workspace writers. No process-absence extension
is required. Acceptance: `test/native-review-safety.test.ts`.

After four blocking rounds, stock Ralph closes its logical control with
`gc.outcome=fail` and `gc.failed_attempt=4`; its mirrored product phase and absent
`gc.iteration` do not define exhaustion. Human continuation identifies the native
logical review control by kind and exact step identity, checks its configured
four-round budget and closed failure, and validates retained fourth-round
findings. An early failure, hard terminal disposition, open control or changed
budget cannot authorize another batch. A pending native continuation blocks a
second batch even when its phase has been mirrored. Duplicate human submission
returns the existing native workflow. Tests: `native-review.test.ts` and
`native-continuation-safety.test.ts`.
The composed blocking case in `native-review-city.test.ts` then submits a human
batch twice through the public CLI, observes four additional blocking rounds
and skipped delivery, resumes that workflow, and verifies the original attempt
and worktree remain retained with no result. A duplicate submission after
exhaustion returns the same workflow. No fifth automatic round or replacement
attempt is permitted in either batch.

For two retained product attempts in one city, resuming one reconciles only
its original and continued fix/review writers. A correctly correlated foreign
writer on a different workspace is left untouched; a foreign writer sharing
this attempt's workspace refuses recovery. Acceptance:
`native-resume-products.test.ts`.

Human batch identities contain a hyphen. Before recording a candidate pin,
fix completion, verdict or approval, the pack maps that logical batch to a
bounded metadata-key-safe digest. The value retains the original batch identity;
all reads use the same key mapping and initial-batch keys remain unchanged.
Native CAS must accept the key, and recovery must use the same logical batch
and original attempt. Acceptance: `native-continuation-safety.test.ts` with an
actual `continuationBatch` identity and the composed continuation scenario.

Before a native preparation, qualification or integration role starts quiet
project commands, it requests one finite 40-minute hold through public
`gc runtime heartbeat`, explicitly naming its current session in the command
environment. An invalid or expired acknowledgement blocks the role. The native
controller preserves the hold across restart without extending it, spends no
execution-stall observation budget during the hold, and re-reads the session
before draining. Expiry restores the bounded backstop. There is no pack timer
or periodic renewal; a hold cannot reverse a drain already begun. Acceptance:
`native-runtime-heartbeat.test.ts`, native `TestExecutionBackstop` and heartbeat
tests, and the composed two-result delivery recovery scenario.

The first fix of a human batch reads the previous batch's fourth-round findings
through `review-context`. A clean verdict then qualifies and delivers the
original product implementation even though the continuation has a new workflow
root. Task, original attempt and accepted candidate remain exact through
publication, promotion and cleanup. Acceptance:
`native-continuation-safety.test.ts` and composed human continuation.
The composed blocking fixture then explicitly grants a later human batch a
clean verdict. That batch delivers the same original attempt, settles the
product task and removes its exact work/candidate resources through native
cleanup. No new product attempt is allocated to demonstrate this path.

After native review aborts and closes delivery as `skipped`, public resume
reconciles the original attempt's sessions and resources, then resumes that
workflow without requiring successful publication/promotion facts. It preserves
the attempt and owned workspace and records no result or settled marker.
Unknown closed delivery outcomes still require successful-delivery evidence;
`skipped` never authorizes cleanup. Acceptance: `native-controller.test.ts` and
the transport/malformed composed cases in `native-review-city.test.ts`.

Native restore may stage `.gc/settings.json` at the configured workspace root.
That native cache is not an owned task worktree and is not deleted by task
cleanup. Resource acceptance uses exact planned paths, native cleanup facts and
Git worktree observations. Unexpected remaining non-cache directories still fail
the fixture check. Multi-round native fixture observations have a finite
15-minute deadline; this measurement allowance changes no native round, retry,
session or resource budget.

The exact idempotent native `session close <id> --json` command uses native
result and correlated read-back even when host process census is unavailable.
It does not add a private process-absence receipt. Lost or invalid outcomes are
reconciled by the same exact close; stop intent and task/session/workspace checks
remain required. Shell wrappers, unsupported operations and project/Git writers
do not receive this delegation. Tests: `native-tracker-cas.test.ts` and
`native-session-stop.test.ts`.

During retained recovery, an exact public session read supersedes a stale list
summary. An open session keeps its occupied position regardless of lifecycle
metadata; only Gas City resumes it. Missing or contradictory identity and
multiple open writers still block recovery. A `RetainedRecovery` close may
repeat the exact native close for an already closed session of an unfinished
task, after a fresh closed/correlation check. `CompletedWork` close still
requires a completed task. Recovery closes no task, releases no worktree and
records no result. Acceptance: `native-controller.test.ts` and
`native-session-stop.test.ts`.

Native transport retries retain the authored workspace selector in the frozen
formula source. Before cook, the pack declares a validated unique slug; admission
binds it beneath the configured worktree root and preparation remains a blocking
edge until exact provisioning succeeds. Gas City reconstructs later reviewer
subjects from that source. Those subjects read attempt ownership from the
original implementation node. Physical `gc.retry_attempt` selects the latest
reviewer independently of the semantic round; invalid ordinals cannot select an
approval. Old frozen workflows are not rewritten. Controlled acceptance:
`native-controller.test.ts` and `native-review.test.ts`; native retry exhaustion
and downstream skipping: `native-review-city.test.ts`.

After a producer records its exactly correlated proposal and closes its native
work bead, Gas City may reuse its pool session for another work bead. Review and
retained recovery read the original closed work, unchanged attempt and proposal,
then positively correlate the session's new work, template and workspace. A
fresh native inventory must show no current writer occupying the original
workspace. They preserve the original attempt and continue without sending close
to the reassigned session or inventing a stop receipt. An unfinished original
work, changed proposal, unknown new owner or workspace intrusion blocks recovery
without resource mutation. Acceptance: controlled producer reassignment tests
in `native-workflow.test.ts`, followed by retained two-result native recovery.

Admission accepts implementation/fix and reviewer pools only with explicit
minimum zero and no configured named session targeting either role. These
roles use native ephemeral pool retirement: an open producer session is observed
within a finite deadline, never closed by the pack. A pending deadline retains
the exact attempt/worktree for later public resume. A terminal closed ephemeral
session may receive the existing idempotent public close; a positively proved
reassignment receives none. Named/manual session ownership is refused. This
replaces the earlier permission to close an open completed-work session, because
Gas City may reassign that row before an unfenced close reaches it. Native
retirement, not a private process acknowledgement, owns this transition.
Admission acceptance: `native-review-capacity.test.ts`; transition acceptance:
`native-session-stop.test.ts` and retained two-result recovery.

Completed reviewers may likewise be reassigned outside the product graph. Review
acceptance and public recovery both prove the original closed review node and
its declared attempt/workspace, the retained exact verdict, and the positive new
owner. Recovery accounts for the historical session without closing it. Open
retirement observation expires after 45 seconds and preserves exact resources.
Controlled acceptance: `native-review.test.ts` and `native-retirement.test.ts`.

A closed ephemeral pool row may retain a trigger naming work already completed
by another session. When both the row and referenced work are closed, recovery
checks exact template/workspace and fresh original-workspace quiescence without
requiring reciprocal current session identity. This proves terminal retirement,
not execution of the referenced work. An open row still requires reciprocal
identity. Explicit `manual_session=true` always refuses pool retirement, even
with ephemeral origin. Acceptance: `native-workflow.test.ts` and
`native-retirement.test.ts`.

Interactive worker/reviewer roles use native idle sleep after 10 seconds. After
retaining a proposal or verdict they cease task work and allow Gas City to
observe idle; they do not wait for a pack-issued close. Active claims and native
wait holds remain native guards. A pending observation retains exact resources.
The noninteractive Node fixture declares `one_shot` before cooking its graph,
matching its one-work command exit and native IndependentSteps routing; this
does not change interactive harness lifecycle. Old cooked graph affinity is
retained. Acceptance: focused public native city and two-result delivery cases.

After retaining its exact proposal/fix/verdict and closing its own work, the
actor invokes public `gc runtime drain-ack --json` from its unchanged native
environment, without a target or operator flag, then ceases work. The ack is a
native retirement request, never proof of stopped writers. Gate/recovery still
observe terminal session or positive reassignment; external recovery does not
replay the actor environment. Crash before ack uses native idle/dead-runtime
recovery; lost ack response preserves retained result and exact attempt. The
pinned legacy reconciler supplies its own token-digest/stop fences; v2 row CAS
is not claimed. Acceptance: actor acknowledgement controls and public native
city/delivery runs. The controlled one-work fixture returns after self-ack
instead of waiting indefinitely for an external close.

Native delivery scopes may mirror their subject delivery metadata after closure.
Public resume selects executable delivery nodes for the exact product, excluding
logical scope/retry controls even when they mirror candidate and cleanup facts.
A second executable delivery remains ambiguous and refuses recovery. Acceptance:
`native-controller.test.ts` and retained delivered native resume.

Recovery treats tracker rows without metadata or an executable phase as unowned
observations. Missing metadata on an original owner or new owner cannot prove
historical authorization. Missing original producer attempt/proposal, an open
writer in the original workspace, or two open review/fix writers refuses recovery
without closing the new owner or deleting retained resources. Group/product
filters carry their positive metadata proof into later native boundaries.
Acceptance: `native-historical-authority.test.ts`.
# Complete native-role admission (S11)

The Operator imports the full pack into an isolated city before launching a new
workflow. Public native config and agent inventory must identify implementation,
independent review/fix, preparation, review preparation, qualification and
serialized integration roles in the configured rig. Interactive roles select
the qualified harness and permission options. Deterministic roles declare a
nonempty native start command, one-shot lifecycle and minimum zero. Integration
has maximum one session; preparation and qualification may have up to two,
preserving bounded concurrent preparation already accepted by S7/S8;
all roles use unnamed pools. Missing, duplicate, unbounded or incompatible roles
cause a visible admission failure before cook, model calls or worktree creation.
Repairing configuration permits a fresh admission without rewriting retained
attempts. The standalone preflight reports Git's registered worktree inventory
without treating listed resources as owned or authorizing cleanup.
Config reads are read-only, so an interrupted preflight has no uncertain
mutation to reconcile. Controlled tests: `native-installation.test.ts`.

# Native maintenance configuration (S11/S12)

The Operator renders a fresh city without starting a product workflow. Native
health, orphan claim reconciliation, order tracking and storm detection retain
their supported defaults. Event diagnostics rotate at 256 MiB and archives expire
after 720 hours; tracker/Git recovery records are separate authority. The template
does not enable age-only graph/session collection and retains narrow destructive
order exceptions because a failed closed workflow may still await continuation.
No generic sweeper deletes legacy, foreign, borrowed or uncertain resources.
Repeating rendering reads the same inputs and creates no sessions, tracker rows
or Git mutations. Configuration tests pin these boundaries; fresh-city tests
must separately observe native resolved configuration and retained recovery data.
Event replay beyond the diagnostic retention window is not guaranteed.

# Review recovery after approval, before qualification

For both controlled native-city variants, the independent reviewer has retained
one clean verdict and approval for candidate C in the exact implementation
attempt. A test-only preload holds the configured qualifier before its CLI can
claim work or perform qualification effects. The Operator stops the city through
Gas City, which may retain the held qualifier asleep. Fresh exact native
session/template/trigger observations and tracker assignments prove it has not
claimed work. The Operator explicitly closes that one session through native
`session close`, validates its exact response and closed correlation, and observes
implementation and reviewer closed as well. Qualification remains open and
unclaimed; the original worktree and review facts remain.

The unchanged variant leaves C intact. The changed variant commits C-prime in
that same clean owned worktree after native stopped-writer proof. The Operator
restarts Gas City and invokes public workflow resume. Release authorizes only a
new, publicly correlated qualifier session; the original session is never
released. The original native CLI executes qualification.

With C, the original attempt, Base and consumed review round survive through
qualification, delivery and cleanup. With C-prime, approval for C remains
historical evidence but cannot authorize the changed tree: qualification visibly
refuses, no result/publication/settlement appears, and the original attempt,
verdict, worktree and branch remain. The test never calls review.gate manually
or writes workflow approval/result facts. There is no pending review-check at
this cut; its process-stop proof is inapplicable. Coverage belongs to the paired
`native-review-restart-city.test.ts` scenarios.

## Completed actor drain acknowledgement

### Pool claim at proposal publication

Gas City starts a pool seat with spawn trigger A; its public hook claims B and
records session `current_claim_bead_id=B` and B's `gc.session_id`. B has its
immutable attempt and exact workspace. When that actor finishes B, fresh public
session/task reads must confirm the actual claim, template and workspace before
publishing B's proposal. A is not closed or changed. Missing/foreign claim stamps,
a foreign task-to-session link or wrong workspace refuse proposal and closure.
After B closes with a retained proposal, retry with a cleared claim stamp may
reuse that exact proposal and original session binding, without a new commit or
model invocation. A closed task with a matching stamp still requires its exact
retained proposal; missing or contradictory history refuses without publication.
A contradictory nonempty current claim still refuses.

`test/native-workflow.test.ts` maps these facts to controlled proposal tests.
Native retirement, reassignment and review correlation must separately migrate
from spawn-trigger assumptions; this proposal slice alone does not qualify those
remaining boundaries or a new live run.

The actor's exact self-hook current/claim commands delegate session and claim
custody to Gas City. Failed native calls retain output without creating a
project-writer stopped receipt. Operator targets, extra operands, copied session
environments and shell wrappers do not qualify. Project commands, Git mutations
and worktree cleanup retain their own guards. `test/native-hook-command.test.ts`
covers accepted/rejected calls and a failed native boundary with retained output
and no fabricated stopped-writer observation. Native city acceptance remains
the external lifecycle proof in the daily full stage.

An actor holds its exact native claim and session identity. When preparation,
review preparation, qualification or integration closes its own node, the actor
requests public `gc runtime drain-ack --json`. The response must name that actor.
An unfinished or deferred integration does not request retirement; missing or
foreign session identity fails closed. An acknowledgement records a request and
cannot establish stopped writers, publication or cleanup. A lost response remains
a failure. Idle claim polling uses native `hook --claim --drain-ack --json` so Gas
City can retire an empty draining seat. No pack process census is introduced.

`test/native-actor-retirement.test.ts` covers completed versus deferred work,
foreign/missing identities, foreign replies, lost replies and strict unfinished
refusal. Native city acceptance retains the external lifecycle checks in the
daily full stage; controlled tests do not prove its wall-clock performance.

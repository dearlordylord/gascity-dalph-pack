# Dalph pack on Gas City: accepted trial contract

Native session stop first retains the exact intent, calls public stock close,
validates its exact successful response, then freshly confirms terminal pool
session/task/template/workspace/claim bindings before retaining a compact close
observation. A later gate/recovery validates retained observations and fresh terminal
bindings, then repeats public idempotent close. Generic public bead mutations
can reopen and reclose the same session with unchanged bindings; the current
public response supplies no incarnation fence that authorizes skipping close.
Malformed/conflicting observations refuse without overwrite. An observation
without its intent does not authorize replay. Missing/lost responses or an
interruption before observation require idempotent close reconciliation; a
lost observation-write response is reconciled through exact tracker readback.
Reopened, foreign, named/manual and unfinished CompletedWork writers remain
refusals. Neither command exit nor a bare closed status substitutes for the
known native close outcome. Pack-owned command custody is unchanged.
Intent, historical observation and initial task binding are decoded from one
fresh exact task read before effects. Each close still has independent fresh
terminal task/session confirmation. Repeating an identical compact observation
does not rewrite it; missing observations are retained after confirmation.
Acceptance: native-session-stop.test.ts, native-stop-observation.test.ts and the
existing native review/recovery/cleanup scenarios. The complete native suite
and its 600-second whole-cycle requirement remain mandatory.

The controlled provider claims and validates its exact native workspace before
its implementation observation window. Only an initial `work` phase waits three
seconds to expose overlap/recovery; reviewer/fix and empty claims add no model
latency. Existing explicit hold and qualification-cut barriers remain. Every
review round, verdict, retry budget, retirement, delivery and cleanup assertion
is unchanged. This changes controlled fixture timing only, not production
providers or Dalph runtime. Acceptance remains the complete native scenario set.

Native preflight reads the exact configured runtime and harness versions through
`tmux -V` and `node`, `codex` or `claude --version`. These exact two-argument
observations retain exit/error handling but create no project-writer custody
receipt. Extra operands, arbitrary providers, readiness commands and actual
execution still use their existing boundaries. Version mismatch still refuses
before task launch. Acceptance: operational-read.test.ts verifies the positive
and negative boundary, real Node output and absence of new custody receipts;
the existing native preflight refusal tests remain mandatory.

Native worker/reviewer work-query reads preserve the existing public `gc ready`
tiers, workspace filter, assignee identities, blocked rows and twenty-row limit
per query. Starting from the native query environment, they execute at most four
independent read commands concurrently and join results in the original tier
order. Missing actor workspace, any command failure or malformed JSON refuses
without a partial successful answer. Gas City's hook still owns fresh identity,
dependency and claim checks; no candidate state is persisted. Interruption stops
owned read children through the existing command scope. Controller probes still
need neither actor identity nor workspace. This maps to native-work-query.test.ts
and native-work-query-parallel.test.ts; original native acceptance remains required.

Native review/recovery validates unique session identities through at most four
concurrent public boundary calls. Each session keeps its exact task reverse-link,
template/workspace, terminal-status and fresh close-result checks. The whole
gate waits for all children and their finalizers; it refuses missing, foreign,
open or contradictory writers without cleanup or admission. An interrupted
close retains its prior intent and reconciles through the same idempotent public
close. Duplicate identical inventory rows collapse by ID; contradictory rows
refuse before writer actions. This maps to native-session-parallel.test.ts and
the existing native-review-safety/session-stop/workflow tests. The original
live review/recovery scenarios remain mandatory.

Native acceptance scheduling admits one isolated case per worker and four
workers, for at most four cities. Independent review/restart cases use separate
files; measured critical paths start first instead of waiting behind file-size
ordering. Every existing scenario body and assertion executes; the gate retains
its single 600-second deadline and incomplete custody fence. Only fixture
scheduling changes; dependent continuation batches stay in one chronological case.

Native CLI packaging includes its pinned dependencies in the Node ESM artifact.
An operator invokes the artifact from a directory without node_modules; an
invalid operation still refuses before tracker or task writers, and the scoped
error file records that refusal. Node built-in loading remains available.
This packaging check maps to test/native-bundle.test.ts; native workflow
scenarios and boundary calls remain unchanged.

S11 dependency candidate qualification: the Operator explicitly selects an
isolated GC build `dev-dalph-native-v5-scope-candidate` linked to Beads revision
`1b7bf9b1910d8ecec3f461f70f478314b654eaa6`, with the same CLI revision.
Preflight accepts only the existing v3 or this exact candidate identifier;
unknown builds still refuse before cook or task writers. A fresh disposable
city must report NativeDoltStore with cursors 69/27, read persistent and
ephemeral records, retain CAS replay/conflict and observe close. This maps to
`test/native-proxied-city.test.ts` and the native-controller build refusal tests.
The operator renders a city with explicit proxy rollout and idle settings;
the renderer retains them in workspace.env, so a clean native check launcher
observes the same settings. With no selection, rollout 0 and idle 30m remain
the defaults. Rendering repeats without filesystem changes or task writers.
This maps to native-render.test.ts and native-transport-env.test.ts.
Existing launch/review/delivery/recovery assertions remain mandatory. This
worktree qualifies the candidate; it does not establish production adoption.

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
outside this read classification. The exact scrubbed JSON recovery boundary
below supersedes project-writer custody for that invocation only.
`test/operational-read.test.ts` distinguishes
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
Config reads are read-only. Native provider health can recover backend services
through its own lifecycle boundary; it is not proof of stopped project writers.
Controlled tests: `native-installation.test.ts` and `native-provider-health.test.ts`.

# Native maintenance configuration (S11/S12)

The matched Gas City candidate also preserves fenced native graph attachment.
After a blocking review the controller creates the next iteration through its
existing atomic GraphApply primitive. Before epoch CAS succeeds, executable
nodes are gates with deferred type, assignment and routing. A committed batch
with a lost response is not repeated internally: the next Attach reconciles
the same idempotency-keyed graph, restores its blocking edge, advances and
freshly observes the epoch, then activates the selected survivor. Failure to
restore the edge or observe the epoch leaves the graph deferred. Interrupted
activation resumes on that survivor. Concurrent attaches still leave one live
graph; a loser never becomes claimable. No review budget or prerequisite changes.
Matched SDK controls: `TestInstantiateDeferredGraphApplyKeepsFencePendingWorkUnrunnable`,
`TestAttachFencedGraphLostResponseRecoversOneSurvivor` and
`TestAttachFencedGraphConcurrentAttachesConvergeOnOneSubDAG`, together with the
existing Attach tests. The pack manifest pins the complete source patch.
These controls do not replace the bounded full native acceptance stage.

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

After each isolated native acceptance case, the fixture waits for the public
supervisor shutdown and stops the rig and city Beads backend through Gas City.
The fixture's idle timeout zero may retain recovery data during the case; it
must not leak live backend services after scope closure. Failure to observe
cleanup fails the case. Exact Git resources, tracker files and diagnostic roots
remain retained. Acceptance: the native-city fixtures' scoped finalizer and
`native-installation-city.test.ts`; no foreign city or backend is selected.

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

### Pool ownership at producer retirement and recovery

Gas City has finished B in an ephemeral pool seat spawned for A. B retains its
task-to-session identity and exact attempt/proposal. The pack passes B explicitly
to its stop boundary and reads the native session afresh. A matching actual claim,
or a cleared claim on the terminal session, may retire B only with the exact
task/session/template/workspace binding. A is never used as a stop target. An open
session remains native-owned; neither an acknowledgement nor an empty claim
proves stopped writers. A foreign current claim, wrong task-to-session link,
workspace or template refuses close and retains resources.

If the pool seat claims C, recovery must positively prove C's current claim,
task-to-session link and exact workspace plus B's retained completed history.
It preserves C without closing its session. Missing claims do not prove
reassignment. A closed C with a contradictory task-to-session link also refuses.
Lost native close responses replay only the exact stop intent, with fresh terminal
native observations before and after the idempotent public close.
If the tracker changes task ownership between two positive session observations,
both occupied observations retain capacity and recovery refuses multiple writers;
separate fresh reads are not an atomic ownership snapshot.

`test/native-session-stop.test.ts`, `test/native-retirement.test.ts`,
`test/native-workflow.test.ts` and `test/native-historical-authority.test.ts`
cover these producer stop/recovery boundaries. Controlled checks do not substitute
for the full live native acceptance. Review claim migration remains separate.

### Review and fix pool claim identity

A reviewer or fix actor may run in a seat spawned for a different node. Before
publishing a verdict or fix result, fresh public task/session observations prove
the actual claim, task-to-session link, template and retained attempt workspace.
An active seat with an absent or foreign claim refuses publication. Retirement
uses the explicit completed node and fresh native terminal custody. A terminal
seat with a cleared claim is associated only with its unique retained task binding;
multiple candidate bindings refuse. A positively correlated new claim preserves
that new owner and does not request close. Recovery never interprets a spawn
trigger as current ownership or accepts a missing claim as reassignment.
Closed reviewer retries additionally require the exact retained verdict and
immutable attempt; a matching stamp cannot recreate missing history.

`test/native-review.test.ts`, `test/native-review-safety.test.ts`,
`test/native-resume-products.test.ts` and `test/native-shared-workspace.test.ts`
exercise review, fix, stop and recovery boundaries. The native full cases remain
required for live provider and public session lifecycle acceptance.

### Workspace-scoped native pool discovery

Preparation records the immutable attempt on its executable prepare,
qualification and delivery leaves. The implementation retains its original
binding; review/fix workspace publication retains their exact attempt facts.
Native spec, retry, Ralph, check, scope and scope-check controls do not receive
new copies of project attempt facts. Existing retained facts are not erased.
Replay preserves leaf facts and still refuses changed attempts. Mirrored
scope-check metadata never makes a control an executable implementation or
delivery. Controlled prepare/recovery tests cover these facts; successful live
duration remains a separate full acceptance requirement.

After a deterministic preparation, review preparation, qualification or
integration actor loses its process while its native assignment remains,
Gas City's default work discovery recovers assigned in-progress/ready work
before routed fresh work. These four roles do not override `work_query` or
`scale_check`: native assignee resolution, readiness, adoption and demand remain
native policy. Their guarded project effects use the claimed node's immutable
resource facts, not the actor's current directory. An uncertain effect still
requires reconciliation before retry. The controlled configuration check proves
delegation to native defaults; full native restart/delivery acceptance owns
actual recovery and must not be inferred from the configuration assertion.

When an assigned in-progress candidate is blocked and an unassigned ready
candidate exists in the same workspace, discovery returns both in native priority
order, preserving `blocked_by`. Gas City's hook filters and selects candidates;
a nonempty earlier tier must not suppress later ready work. The controlled query
test proves transport composition, not native claim selection.

Two ready tasks A/B route to the same native worker or reviewer template but
declare different `gc.pack_workspace` slugs. Gas City runs seat A with native
`GC_DIR` naming A's exact checkout. Its configured work query uses public
`gc ready` metadata filters for that workspace; B never enters A's candidate
set. The controller query without a seat sees both ready tasks, and native
`scale_check` continues to own demand. The query does not claim or stamp tasks.
The native hook remains responsible for canonical claim, adoption and restamping.

Discovery retains native priority: assigned `in_progress`, assigned ready, then
routed unassigned ready. Each assigned tier checks nonempty native session ID,
session name and alias. A committed claim without its best-effort `gc.session_id`
stamp remains discoverable by assignee and can be restamped by the native hook.
An absent workspace, missing template or failed native query returns an error;
it does not produce successful empty work or a false drain. Full path, immutable
attempt and task/session validation still run at publication and cleanup.

`test/native-work-query.test.ts` executes both configured queries against a
controlled public-query command port: independent workspaces, controller demand,
assigned recovery, assigned ready and failure propagation. These checks establish
the query composition, not live native filtering or hook adoption. The existing
two-result native delivery case remains the live cross-workspace proof in the
full acceptance.

The actor's exact self-hook current/claim commands delegate session and claim
custody to Gas City. Failed native calls retain output without creating a
project-writer stopped receipt. Operator targets, extra operands, copied session
environments and shell wrappers do not qualify. Project commands, Git mutations
and worktree cleanup retain their own guards. `test/native-hook-command.test.ts`
covers accepted/rejected calls and a failed native boundary with retained output
and no fabricated stopped-writer observation. Native city acceptance remains
the external lifecycle proof in the full stage.

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
full stage; controlled tests do not prove its wall-clock performance.

For a native immutable fact, the pack calls public `gc beads metadata-cas` with
the exact bead, store, key, expected empty value and requested next value.
Gas City's version1 receipt must name that bead/store/key and report `swapped`
or `already_next`; this acknowledges the durable write without another show.
The native primitive owns both the contradictory-value guard and acknowledgement:
absent or empty keys swap, identical retained values return already-next, and
different values conflict without overwrite. Missing beads fail at that exact
store without fallback. No preliminary show is needed for immutable fact writes.
Raw metadata writes retain their initial show, including refusal to replace an
existing empty string with a nonempty value. The required scoped client remains
an admission condition. Mutable lifecycle, claim and custody checks still read
their own fresh authorities; a CAS receipt does not replace those observations.
Conflict, malformed/version-mismatched or foreign receipts fail closed, even
with exit0 and an applied value. Only a lost command response permits a fresh
exact read to reconcile that value; an unapplied write or failed read remains
failed. No mutation is repeated during reconciliation. Legacy acknowledgement
and mutable lifecycle/custody reads remain unchanged. Controlled tracker tests
map each outcome, replay, empty/missing/conflicting keys, identity refusal and
ambiguous before/after-commit case;
native city tests remain the live composition proof.

Qualification records exact native candidate copies only on executable
prepare/work/qualify/deliver leaves. Observing an integration generation records
its ordinal fact on the same leaves; native controls and review/fix leaves receive
no new copies. Original result, candidate plan, publication and cleanup proofs
remain authoritative. A partial copy followed by retry retains identical payloads;
a conflicting selected-leaf copy refuses without overwrite. Historical copies on
excluded nodes remain untouched. Remote advance and restart still produce the
second integration ordinal and one successful publication, as covered by
`test/candidate-refresh.test.ts`. `test/native-workflow.test.ts` covers selected
leaves, excluded controls, partial replay and retained old copies. This reduces
write fan-out; controlled tests do not establish live timing or full acceptance.

S3/S4 immutable review reads: after the producer retains its attempt and proposal,
each review context obtains a fresh uncached native group and decodes those facts,
the previous completed verdict and the pinned candidate from that exact work row.
CAS facts cannot be overwritten; another node's copy cannot fill a missing fact.
Missing or malformed required facts refuse before publication. If a fact appears
after this read, the current invocation may refuse; a new invocation must read a
new group and may proceed. No snapshot survives the invocation. Session, claims,
terminal history and writer custody retain their separate fresh reads. Crashes
and retries retain the same immutable keys and contradiction guards. Controlled
acceptance is mapped to `test/native-review-snapshot.test.ts` and the existing
review safety, cleared-claim, changed-candidate and writer-custody tests; live
city/review tests remain the composition proof.

Within one review-preparation or fix-completion invocation, immutable identity
and provenance remain the already validated context. After workspace publication
or retention of the fix result, pinning must read Git HEAD and dirty status
again. A clean HEAD change is pinned as the current candidate; a newly dirty
worktree refuses the pin and leaves the actor open without successful outcome.
Earlier acknowledged publication/fix facts remain retained. A crash or retry
starts with a new native group and reconciles the same immutable CAS keys;
there is no durable snapshot or cross-invocation cache. Standalone `pin` obtains
its own fresh context. `test/native-review-pin-freshness.test.ts` exercises both
boundaries with late HEAD changes and late dirty edits. These controls preserve
the existing freshness boundary and do not establish a full-suite speedup.

S3/S6 qualification and delivery obtain their own fresh native group and decode
immutable attempt, proposal, approved verdict and accepted result from its exact
work row. Missing or malformed required facts refuse; a fact published after the
group read can only be adopted by a new invocation. Session and writer-stop
observations, mutable cleanup evidence, Git and qualification remain fresh.
Retries preserve immutable identity and never substitute another node's copy.
Controlled acceptance maps to the native workflow snapshot tests in
`test/native-workflow.test.ts`; native city tests retain the delivery proof.

S3/S6 completed producer correlation reads the writer freshly, then decodes
its immutable proposal (and, for reassignment, attempt) from that exact row.
Closed status, reverse session binding and current claim remain required;
missing, malformed or contradictory history refuses. The snapshot is local to
this correlation call. Existing cleared-claim and reassigned-producer cases in
`test/native-workflow.test.ts` cover rejection and retry; its immutable-read
regression covers the absence of redundant fact point reads.

S1/S11 exact RIG task observations: given a configured native RIG and exact task
ID, the tracker calls public `gc beads show --store-ref=rig:NAME --format=json`
with `GC_NO_API=1`. Gas City owns configured scope resolution, backend admission,
fresh Get and normal Bead serialization. Another store's colliding ID cannot
answer, and a missing selected-store ID fails without fallback. The pack decodes
its existing Bead schema and checks the exact returned ID. Its raw metadata
empty-string guard, CAS acknowledgement and immutable facts remain unchanged.
CITY session observations retain the existing fresh logical lookup so migrated
class authority can answer them. No snapshot persists across calls or retries.
Reads authorize no resource effects or completion by themselves.

Given a native build whose public show help omits `--store-ref`, mandatory
preflight refuses before task/worktree planning or workflow launch. A command
failure remains a failure. The required scoped HTTP client remains mandatory;
the new CLI projection does not replace mutable lifecycle or custody checks.
`test/native-scoped-point.test.ts` owns locator selection, retained CITY routing
and missing-capability refusal; the existing native tracker tests retain exact
ID, client, metadata, conflict and lost-response checks. GC controls own missing,
collision, cache, remote, class migration and owned-close refusal. A small live
persistent/ephemeral comparison owns equal ordinary/scoped JSON in each backend
mode and unchanged DB HEAD; it cannot qualify a complete workflow or full gate.
# Initial review-gate infrastructure read

For S3/S4, the native control has a completed review subject and invokes its
configured gate. If the gate's first fresh tracker read fails, no semantic gate
evaluation or verdict publication is authorized. The CLI reports infrastructure
exit 75, never semantic blocking exit 1 or success 0. Gas City's existing finite
infrastructure retry policy retains the same semantic iteration; store recovery
must restore a fresh read before evaluation. No new task attempt is authorized.
`test/native-gate-entrypoint.test.ts` executes the real CLI with a failing native
reader and proves one read, the visible refusal and exit 75. Additional controls
prove missing contract and invalid identity refuse before any tracker read.
These bootstrap failures likewise produce no semantic verdict and exit 75.
The error boundary applies only to the recognized `review-gate` command; other
CLI modes keep their existing handling. Existing bundled
Ralph controls cover the finite infrastructure retry classification.

## S11 native provider recovery ownership

After validating the installed native roles and required bd capabilities, the
pack invokes one exact public `gc --city CITY beads health --json`. Gas City
checks its provider-owned CITY and configured RIG scopes and may recover failed
backend services. A successful call may leave those native services alive; it
does not create a project writer or prove stopped custody. The invocation clears
project boundary/attempt and actor session markers before starting GC.

The pack accepts only schema version 1, `ok=true`, the exact configured city
path, provider `bd` and status `healthy`. Error, timeout, malformed response or
foreign city/provider refuses further admission without an adapter retry. Raw
command diagnostics remain available on refusal. Other lifecycle operations,
shell wrappers and invocation-level environment overrides do not receive this
delegation. Project/Git mutations retain their existing custody checks. Existing
incomplete receipts require stopped-writer reconciliation; this change cannot
retroactively reclassify them.

`test/native-provider-health.test.ts` covers response and failure boundaries;
`test/native-provider-health.property.test.ts` covers delegation confinement.
The owned native cold-service probe verifies successful health without waiting
for native backend termination, followed by exact public backend stop and
receipt reconciliation. This proof does not qualify the full native workflow.

SDK close-side completion and molecule autoclose retain the owning event scope.
A logical RIG root ref resolves through existing controller-owned residency,
including relocated graph bindings and same-ID shadows. Suspended target rigs
remain unread. Attachments and reverse-source roots keep their separate graph
authority. Failed root reads defer completion/close; a fresh recovery can finish
the same responsibility. Controlled SDK owner cases cover these differences;
fresh native acceptance and the complete 600-second cycle remain mandatory.

## Stable native close revision

A completed or retained-recovery writer first passes the existing fresh terminal,
ephemeral-pool and reverse-binding checks. Public `gc bd show ID --json` may
provide one exact closed session row and a nonzero opaque revision. After stock
close acknowledges that exact session, a fresh matching row with the same
revision permits one immutable compact fence alongside the close observation.
Reconciliation may omit another close only with the original intent, observation,
fresh custody checks and the identical current revision. A reopen/reclose between
close and its post-read or before replay changes the token and forbids reuse.
Missing/zero tokens, ambiguous rows, foreign identity/bindings or read failure
fall back to stock close. Existing versionless observations remain compatible.
The fence is never replaced or accumulated per revision; process custody remains
separate. `test/native-session-revision.test.ts` covers stable reuse, both ABA
windows, tokens beyond numeric precision and unavailable/invalid projections.
Existing stop-observation controls retain all refusal and lost-response scenarios.

Retained recovery reads the exact terminal ephemeral pool row and its reverse
task binding once before revision reuse or stock close. No write occurs between
the removed duplicate observation and this remaining stronger observation.
Completed-work disposition still requires a closed task; recovery may retain an
unfinished task. Post-close fresh checks remain mandatory.

Stock inventory may omit required closed sessions. The inventory returns an
explicit missing-required identity; each bounded consumer resolves it once by
exact fresh public read at correlation time. An omitted open row, foreign ID or
failed read refuses that responsibility; unrelated active writers still fence
the whole workspace. No listing snapshot substitutes for correlation. The
parallel-session tests retain duplicate, concurrency and finalizer controls;
review safety tests retain incomplete inventory and shared-workspace refusal.

## Owned native fixture transaction policy (S11)

An isolated fixture starts with the pinned proxied CITY and RIG stores and no
task writers. After scope bootstrap, before launching tasks, it selects `dolt.auto-commit=batch` in
its exact RIG through public `gc bd config set`. CITY policy and production
setup defaults remain unchanged. SQL transactions still commit; only Dolt
version-history commits are deferred. Fixture Go processes use two scheduler
threads; product task, reviewer and integration limits do not change.

After exact persistent and ephemeral metadata-CAS acknowledgement, the fixture
observes a managed running proxied backend and calls public `bd dolt stop`.
For this pinned backend that operation kills its verified owned processes
without flushing the working set. A fresh native request starts the proxy on
demand and must observe the same values and revisions. Identical replay must
return `already_next`, contradiction `conflict`, with neither changing revision.
This tests process-kill recovery, not power loss or an operating-system crash.

After stopping fixture writers and supervisor, cleanup explicitly commits the
versioned RIG tables before stopping its backend. This commit excludes ignored
ephemeral tables; version history is not a backup of ephemeral working data.
History-based export or restore of versioned tables must follow an explicit
commit. Ephemeral durability is proved separately by the process-kill case. Existing maintenance, review budgets,
continuations, delivery and cleanup assertions remain mandatory. The policy
changes fixture storage/scheduling only, not pack runtime behavior. Acceptance:
the expanded `test/native-proxied-city.test.ts` and the complete native suite
within the same 600-second whole-cycle deadline.

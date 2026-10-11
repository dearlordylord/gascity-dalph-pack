# Deliver task graphs through Gas City native primitives

## Problem Statement

The Operator launches a dependency graph through Gas City and expects its
configured agents, bounded execution, recovery and workflow controls to do the
work. The current pack instead launches a TypeScript wrapper that directly
invokes Codex, runs a fixed test command, manages its own retry bookkeeping and
reads Beads directly. Review is an instruction to the implementer rather than
a durable bounded review workflow. Many native maintenance services are disabled
by the trial template.

Consequently, choosing another Gas City harness does not change the actual
implementation agent, native sessions do not identify the nested model turn,
and native graph observations omit important checks and review decisions.
Successful Codex demonstrations do not qualify a reusable provider-neutral pack.

The product objective remains recoverable, bounded delivery of a task graph.
It does not require reproducing Dalph's internal journal, event vocabulary,
queue representation or exact execution algorithm.

## Solution

The Operator imports the pack, configures agents and project qualification
through Gas City, and launches one workflow. Gas City admits ready work,
claims tasks, launches the configured native agent sessions, executes bounded
review and qualification controls, resumes unfinished work and serializes
delivery to each target. The pack composes those primitives and adds only the
project-specific delivery policy and safety checks that native contracts do
not supply.

The task graph remains one square per product task. Implementation, review,
qualification and delivery are details of that task, not extra product tasks.
A task becomes delivered only after its accepted code is qualified, integrated,
published, observed on the target, and its owned temporary resources are safely
settled. Only then may its dependants start.

### Governing product behavior

Use Dalph as the source for unresolved product questions, while keeping Gas City
as the implementation authority. Preserve the immutable planned task attempt,
qualified current-head Base, independent task admission, serialized integration,
ambiguity reconciliation, exact cleanup and separate delivery/finality boundaries.
The bounded review policy is four review rounds with early exit at the first
clean verdict, following Dalph's accepted review scenario. Unlike Dalph's advisory
inner prompt, this pack must enforce and recover that policy through native
formula controls. The review count is not a model transport retry count.

### Chronological acceptance scenarios

These scenarios define the authorized implementation behavior. Each starts from
an isolated target, native tracker and selected compatible Gas City revision.
The Testing Decisions section maps each scenario to an acceptance test.

**S1 — The Operator launches the configured agent.** Before launch, the target
and remote agree, the project contract and required agent/check capabilities are
valid, and no attempt exists. The Operator chooses a supported non-Codex native
harness and launches the workflow. Gas City reads readiness, claims the task,
establishes its immutable attempt and exact worktree, then launches that harness
with the task instructions. The Operator sees the real agent session and its
task correlation. Repeat with Codex and different configured model/reasoning
settings. No nested hardcoded agent CLI, model, reasoning or permissions override
may substitute for Gas City configuration. A crash after preparation uses S5;
invalid capabilities fail before an agent or task worktree starts.

**S2 — Gas City delivers a bounded fork/join graph.** Four open tasks form
A → {B, C} → D. The task-work limit is two and integration limit is one per
target. A is implemented, reviewed, checked, integrated and cleaned before
Gas City admits B and C. Their native agent executions overlap. D remains
blocked until fresh native tracker observations establish both deliveries;
it then starts from a qualified target head containing both prerequisites.
The Operator launches the root once and never assigns each successor manually.
No second same-target integration writer or third task-work attempt is admitted.
Restart while B and C are active preserves the occupied positions and exact
attempts rather than treating restart as spare capacity.

**S3 — A clean independent review ends the loop.** One implementation attempt
has committed candidate C in its exact worktree, but has not reported acceptance.
Gas City launches a reviewer separate from the implementer, with the task,
project requirements and Base-to-C changes. A structured verdict reports no
reasonable blocking findings. The native check accepts that verdict, ends review
after round one and proceeds to qualification of the exact commit. The task square
still represents one product task. No redundant later review, implementation
rerun or delivery is authorized by a merely successful reviewer process exit.
Reviewer transport failure or malformed output produces no clean verdict.

**S4 — Blocking findings converge or stop at the bound.** From S3's starting
facts, a reviewer reports blocking findings. Gas City retains the verdict and
routes fixes to the same attempt worktree, then reviews the changed candidate
with a fresh review session. Each completed review consumes one of four rounds.
A clean verdict ends the loop early; remaining blocking findings after round
four leave the task undelivered with a visible exhausted outcome and retained
resources. No fifth automatic review or silent acceptance is allowed. Infrastructure
failures consume a separately finite native retry budget, not semantic review
rounds. Process loss after a verdict or fix preserves consumed budgets and the
candidate that was actually reviewed. An explicit human continuation may grant
a new finite batch without a lifetime cap on human retry; duplicate submission
of that same continuation must not grant another batch.

**S5 — A restarted workflow retains its attempt and live agent.** Gas City has
claimed a task and acknowledged its Base, worktree and native session. The
controller stops after agent launch but before observing its result. On restart,
native reconciliation first observes the existing session, tracker claim,
worktree and pending controls. A live session remains owned; a safely recoverable
session resumes using its native provider contract. Completed model work is not
repeated solely because a wrapper lost its response. Unknown writer liveness
blocks a competing writer, resource deletion and release of its occupied position.
The Operator can locate the session and the exact pending boundary. A missing
previously prepared worktree is a retained failure, not permission to recreate it.

**S6 — Project qualification controls acceptance.** The Operator supplies a
project check command other than pnpm test. A candidate exists with a clean
worktree and a known commit. The native formula check runs the configured
command against that candidate with a configured finite timeout. A passing check
and unchanged exact commit/tree permit acceptance; failed, timed-out, missing or
changed-tree checks do not. The Operator sees retained diagnostics and the
failed boundary. A recovered completed check is reused only for its exact
candidate. A content repair creates a new candidate requiring fresh review/check
evidence; it does not reinterpret a failed check as success. No full implementation
retry is triggered merely by an unreadable infrastructure response.

**S7 — Delivery remains serialized and recovers a lost push response.** B and C
have accepted results. Gas City routes their integration responsibilities through
one target position. The selected delivery fixes a candidate against the current
qualified target and accepted result, runs its checks, records publication intent
and performs an ordinary push. The remote applies it but the controller loses
the response. Restart reads the pinned remote before another push, reuses the
same candidate and observes local target promotion before task completion. A
competing compatible head may require a bounded candidate refresh, never another
implementation attempt by default. Incompatible history, conflict, throttle or
unproven writer custody leaves a visible wait/failure and preserves resources.
The second delivery cannot overlap the first target writer. Force push, reset,
false tracker completion and dependants released from an agent exit are forbidden.

**S8 — Native cleanup preserves unsafe resources.** An exact delivered attempt
and candidate have publication proof and freshly proved stopped writers. Gas City
cleanup observes their ownership, generation, Base and Git registrations, removes
only those authorized resources and compare-deletes an unchanged owned branch.
A lost cleanup response is followed by a fresh observation; confirmed absence
settles without another destructive effect. Dirty, foreign, moved, borrowed,
live or unreadable resources are preserved with actionable diagnostics. Automatic
maintenance must obey the same ownership boundary and must not erase evidence
required to reconcile an unfinished operation. The task does not report settled
cleanup while an owned unsafe resource remains.

**S9 — A provider-neutral tracker preserves authority and idle outcomes.** A
compatible configured tracker provides the graph and claims. Pack operations
read and change it through Gas City with explicit city/rig scope, without a
direct bd executable or local Dolt assumption. Missing, contradictory, incomplete
or unavailable facts cannot prove eligibility, completion or absence. Native
claim and route responses retain their meanings: no-work and drain are normal
quiescence, not failed task execution. A lost mutation response is reconciled
against that exact task before retry. No-op read and idle cases have no separate
destructive retry; their crash behavior is covered by pending native controls.

**S10 — The Operator sees four tasks through recovery and finality.** S2 is
running with four product tasks and native internal review/check/delivery nodes.
The dashboard derives four squares, product prerequisite arrows, frontier and
current work from native observations; selecting a task reveals its phases,
findings, waits and diagnostics. Restart and stale API responses retain the last
graph with an explicit stale state and never start work. All four squares become
delivered only from delivery facts, and run completion waits for native workflow
finalization and settled responsibilities. A read-only rendering crash has no
workflow mutation to retry. Internal control nodes must not become extra product
task squares.

**S11 — A fresh installation retains native maintenance safely.** The Operator
prepares a new isolated city. Pack import resolves pinned compatible dependencies,
then preflight checks its configured harness, tracker, checks and runtime. Normal
native health and lifecycle services remain enabled. Each required exception is
explicit, justified and limited to the affected fixture. Closed owned resources
can be maintained under native safety rules; active/uncertain resources and
recovery evidence are preserved. A missing required capability yields a visible
setup error rather than enabling broad blanket skips or silently falling back to
direct Codex/Beads. Repeating setup cannot duplicate an existing workflow.

**S12 — Existing runs survive the migration boundary.** A legacy workflow has
retained attempt metadata, candidate resources or unfinished command receipts.
Installation of the redesigned pack does not reinterpret those records as new
native sessions or completed review rounds. The Operator can recover it with
its compatible legacy runtime, or perform an explicit validated migration only
after writers are proved stopped and exact identities are preserved. New runs
use the native design. Unsupported legacy resume fails visibly while retaining
resources. Neither upgrade nor restart fabricates exits, resets a budget or
launches a second root workflow.

## User Stories

1. As an Operator, I want to choose the native agent harness, so that the pack works with my execution provider.
2. As an Operator, I want model and reasoning configuration respected, so that trial settings do not dictate production usage.
3. As an Operator, I want runtime and permissions configured through Gas City, so that local nested processes do not bypass my settings.
4. As an Operator, I want to launch a graph once, so that successors run without manual routing.
5. As an Operator, I want independent ready tasks to overlap, so that the graph makes bounded parallel progress.
6. As an Operator, I want all implementation, review and integration sessions bounded, so that fan-out does not create uncontrolled resource use.
7. As an Operator, I want dependants to start after delivery, so that prerequisite code is present in their Base.
8. As an Operator, I want exact attempts retained across restart, so that finished work is not needlessly repeated.
9. As an Operator, I want unknown writer liveness visible, so that recovery cannot start a competing writer.
10. As an Operator, I want independent candidate review, so that implementer confidence is not the only acceptance signal.
11. As an Operator, I want the first clean review to finish review, so that unnecessary rounds do not consume resources.
12. As an Operator, I want four-round review exhaustion to stop delivery, so that known blocking findings are not accepted.
13. As an Operator, I want review findings and consumed budgets retained, so that restart cannot reset the loop.
14. As an Operator, I want explicit continuation after exhaustion, so that I can authorize more finite work without a lifetime human retry cap.
15. As an Operator, I want configurable project qualification, so that projects outside the sample pnpm application can be delivered.
16. As an Operator, I want checks bound to exact candidates, so that a passing check cannot certify changed code.
17. As an Operator, I want infrastructure failures distinguished from negative verdicts, so that blind reads do not consume review rounds.
18. As an Operator, I want integration serialized per target, so that concurrent tasks cannot race publication.
19. As an Operator, I want lost push responses reconciled, so that already published code is retained without unsafe repetition.
20. As an Operator, I want native tracker access, so that the pack does not require a particular tracker storage backend.
21. As an Operator, I want native maintenance retained, so that the sample does not disable health and resource lifecycle services globally.
22. As an Operator, I want exact safe cleanup, so that foreign or unfinished resources survive recovery.
23. As an Operator, I want one graph square per task, so that internal workflow steps do not obscure product progress.
24. As an Operator, I want actionable waits and failures in task details, so that I can locate the boundary preventing delivery.
25. As an Operator, I want legacy runs preserved during upgrade, so that a new architecture does not destroy unfinished work.
26. As a maintainer, I want native compatibility pinned and tested, so that current upstream documentation is not mistaken for an executable release contract.

## Implementation Decisions

- Gas City remains the sole owner of graph readiness, task claims, routing,
  control dispatch, agent sessions and their recovery. Git owns lineage,
  commits, refs, registrations and publication. Native workflow records own
  history; no additional persisted frontier, queue or UI state is introduced.
- Replace the model-running wrapper with configured native agent roles and
  formula composition. Deterministic project preparation, qualification and
  delivery guards may remain TypeScript/Effect script steps. They must not
  launch an agent CLI underneath a generic script session.
- Use native work directory/preparation facilities and the existing exact
  worktree ensure/verify/cleanup contract. Bind attempt, task, Base and resource
  identities before uncertain effects. Retained plans do not change when the
  target advances; new attempts start from the qualified current target head.
- Default task-work concurrency remains two and target integration concurrency
  one. Review uses a separately bounded native pool, default two. Total session
  caps must cover all participating roles; spawning review children does not
  grant unbounded extra seats. Native task/resource accounting must keep a
  retained attempt occupied through unsafe interruption without a new scheduler.
- Encode independent review, fixes, verdict checks and qualification through
  native expansion/check/retry controls. Default review maximum is four,
  with first-clean-verdict early exit. Native infrastructure retry policy is
  separately finite and documented. Session replacement does not reset either
  budget. Review and implementation providers inherit operator choices unless
  explicitly configured separately.
- Verdicts identify the exact task attempt and reviewed commit, reasonable
  blocking findings and their dispositions. Process exit alone is not approval.
  A changed candidate invalidates its earlier approval/check evidence.
- Describe project check command, directory, timeout and required tool preparation
  through an explicit project contract. Remove the universal pnpm-test assumption.
  Validate this contract before admission rather than falling back silently.
- Compose compatible official delivery/refinery policy where it meets S7/S8.
  Gas City has reusable pack integration behavior, not a universal core merge
  command. Pin dependencies and document which checks remain pack-owned.
  Preserve publication-before-completion, exact candidate correlation and safe
  target mutation; copying Dalph's journal ordering or ordered-parent schema
  is not required if native integration proves equivalent delivered content,
  lineage and serialization.
- Remove direct backend tracker reads. Use native scoped tracker boundaries
  and claims, preserving typed unavailable/conflicting outcomes and completion
  read-back. Native protocol idle/drain results are successful quiescence.
- Replace custom session/process plumbing only where native evidence proves
  the required writer custody. Runtime death alone cannot prove escaped
  descendants stopped. Unsupported runtime safety must fail preflight or retain
  an explicit narrow adapter, not silently weaken cleanup authority.
- Classify every trial maintenance override as removed, necessary with a
  documented boundary, or replaced by native configuration. Restore safe native
  defaults; do not blindly enable destructive maintenance over legacy resources.
- Use native logs and retained control records rather than fsynced private
  receipts for every read. Retain minimal additional evidence only for genuine
  unresolved safety gaps. Diagnostic retention follows native bounded policies
  and cannot discard facts needed by unfinished responsibilities.
- Product task identity is explicit metadata carried through internal expansion
  and continuation nodes. Dashboard aggregation must not depend exclusively on
  work/delivery suffixes. It remains a read-only native observation projection.
- New and legacy workflows have an explicit compatibility boundary. Legacy
  recovery remains available or rejects before mutation; automatic destructive
  conversion is not part of this change.
- All maintained implementation remains TypeScript with idiomatic Effect,
  Schema-decoded boundaries and Effect HTTP. This change adds no CI workflows.

## Testing Decisions

Use one primary acceptance seam: launch and resume the composed native workflow
in an isolated city through public Gas City commands, then observe native tracker
and sessions, Git target/remote/resources and the read-only task graph. Inject
controlled harness/runtime/check responses and fault barriers behind that seam.
Do not qualify the migration merely by testing command strings or a new reducer.

| Scenario | Acceptance test at the native workflow seam |
| --- | --- |
| S1 | Configured native harness executes the exact task; alternate harness and configuration are honored; unsupported capability starts no work. |
| S2 | Four-task fork/join overlaps B/C under limits, starts D only after both deliveries, and selects a Base containing their code. |
| S3 | First correlated clean independent review ends the loop after one round. |
| S4 | Findings produce same-attempt fixes; fourth blocking review stops; restart and duplicate human continuation preserve budgets. |
| S5 | Controller loss resumes the same native session/attempt; ambiguous writers and lost prepared worktrees block competing effects. |
| S6 | Configured non-pnpm qualification passes or visibly fails against the exact candidate; changed code invalidates prior evidence. |
| S7 | Two accepted tasks serialize delivery; response loss after applied push reconciles without implementation rerun or force push. |
| S8 | Exact native cleanup settles response loss and preserves dirty, foreign, moved and live resources. |
| S9 | Configured tracker works without direct bd; unavailable facts fail closed; idle/drain produces normal quiescence. |
| S10 | Four product squares retain phase diagnostics and correct frontier through restart/stale reads; finality follows delivered facts. |
| S11 | Fresh setup validates native capabilities and retains justified maintenance, with no blanket health/lifecycle suppression. |
| S12 | Legacy pending run is safely recovered or rejected without mutation; new runs use native composition. |

Existing prior art is the pack's controlled delivery/recovery tests, real Git
native worktree refusal tests and browser projection fixture, plus Dalph's
production-shaped concurrency/serialized-integration acceptance scenario.
Reuse their external assertions and safety cases while moving orchestration
coverage to the native seam. Focused adapter tests remain appropriate only
for retained safety gaps, not as a substitute for composed workflow evidence.

Use controlled fixtures for repeated crashes, exhaustion, throttles and bulk
cases. Finish with one minimal live four-task fork/join trial using configured
native providers, observed parallelism, at least one recovery cut, exact final
Git/remote agreement, task closure and resource cleanup. Alternate-provider
capability must have real native launch evidence; a fake alone is insufficient
to claim compatibility. Do not retry throttled mutations. Record finite fixture
deadlines, stop safely at them and diagnose the exact failed boundary.

Required pack qualification remains pnpm check all with 99% coverage and
configured Hapsland review evidence for eligible changed declarations. Run
focused checks first. Application qualification is owned by the project
contract, not the pack's own quality gate. Final handoff maps S1–S12 individually
to evidence and names every unqualified boundary.

## Out of Scope

- Changes to Dalph production runtime or its domain model.
- Exact reproduction of Dalph's journal, internal algorithms, FIFO encoding
  or full control-command surface.
- Implementing new Gas City core providers, a second scheduler, a universal
  merge API, or a new tracker backend.
- Claiming every harness/runtime combination supported without qualification.
- Replacing exact safety checks with session-death assumptions.
- A new native dashboard; the separate product task graph remains.
- Retrospective repair or automatic conversion of legacy histories.
- Catalog publication, CI, unrelated source refactors or performance claims
  inferred from a single successful run.

## Further Notes

The user directed that questions be resolved from Dalph rather than through
another interview. Its accepted bounded review, current-head attempt,
concurrency, publication/finality and cleanup scenarios supply the product
defaults. Gas City owns the chosen implementation mechanisms.

Source references:

- [Pack primitive audit](GASCITY-PRIMITIVES-AUDIT.md).
- [Gas City agent configuration](https://github.com/gastownhall/gascity/blob/8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a/docs/guides/configuring-an-agent.md).
- [Gas City formula controls](https://github.com/gastownhall/gascity/blob/8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a/docs/reference/specs/formula-spec-v2.md).
- [Official reusable review workflow](https://github.com/gastownhall/gascity-packs/blob/main/gascity/formulas/build-basic-review.formula.toml); its selected release must be pinned and compatibility qualified.
- [Dalph bounded review](https://github.com/dearlordylord/dalph/blob/master/docs/scenarios/codex-bounded-review-instruction.md).
- [Dalph qualified current-head attempt](https://github.com/dearlordylord/dalph/blob/master/docs/scenarios/qualified-current-head-attempt.md).
- [Dalph concurrency and serialized integration](https://github.com/dearlordylord/dalph/blob/master/docs/scenarios/hermetic-concurrency-and-serialized-integration.md).
- [Dalph publication](https://github.com/dearlordylord/dalph/blob/master/docs/scenarios/direct-remote-publication.md).
- [Dalph exact cleanup](https://github.com/dearlordylord/dalph/blob/master/docs/scenarios/disposition-cleanup.md).

Writing and publishing this specification changes no runtime behavior. The
current implementation remains unchanged until work against these scenarios is
performed and qualified.

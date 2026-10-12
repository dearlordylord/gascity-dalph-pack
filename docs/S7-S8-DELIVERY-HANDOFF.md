# S7/S8 native delivery and cleanup

**Status: composed S7/S8 acceptance and full pack qualification passed.**

This slice implements serialized native delivery and exact cleanup from
[Specification #1](https://github.com/dearlordylord/gascity-dalph-pack/issues/1)
and [the accepted native specification](NATIVE-PRIMITIVES-SPEC.md). It introduces
no scheduler, CI workflow, generic merge command, or replacement tracker.

## Official policy comparison and pin

The compared official source is
[`gastown/formulas/mol-refinery-patrol.toml`](https://github.com/gastownhall/gascity-packs/blob/520e95cb22992a8a1017f7a60da267f203497c7e/gastown/formulas/mol-refinery-patrol.toml)
at Gas City Packs commit `520e95cb22992a8a1017f7a60da267f203497c7e`.
The source SHA-256 is `a81edecbdab5976c4f450f78cb351fc688c96f4ab521f4904cf6d6461f759f2c`.
This is a policy provenance pin, not an import of its autonomous patrol or shell
commands. The official patrol is not a compatible executable replacement for
this product slice.

| Official policy | Reuse or retained adapter |
| --- | --- |
| Qualify integration before publishing, use ordinary target push, verify target ancestry before completion | Reused by the deterministic delivery composition. Project qualification uses the original explicit command and timeout, independently of pack qualification. |
| Re-find retained unfinished work and reconcile already-landed content | Reused through fresh scoped native tracker observations and pinned-endpoint Git fetch before another push. |
| Preserve topology when target ancestry already holds; reject failed ancestry probes | Reused. Only exit 1 means non-ancestry; inaccessible Git evidence fails closed. |
| Rebase diverged source, potentially republish a rewritten source branch | Incompatible with immutable accepted implementation approval. The adapter merges an advanced compatible target into the retained isolated integration candidate and separately requalifies each revision. It never rewrites the accepted implementation. |
| Close verified delivery before artifact cleanup; retry cleanup on closed artifacts | Incompatible with this product's cleanup-before-completion boundary. The adapter closes the delivery only after both native worktree cleanups and compare-deletion of unchanged owned branches settle. |
| Autonomous root-only patrol wisps and reassignment policy | Not imported. Native formula dependency controls, claims and configured bounded pools retain these responsibilities. |
| Task artifact cleanup with exact path/source proof | Native `gc worktree ensure/verify/cleanup` is reused directly with repository, root, path, branch, original Base SHA, bead/store, creator, owner, generation and provisioning attempt. Pack adapters additionally check stopped writer custody and compare-delete the expected branch head. |

The supported native CLI checkout remains
`8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a`, with the configured Beads backend,
tmux runtime and controlled fixture provider. Runtime and harness capability
qualification is separate from this policy comparison. No universal `gc merge`
command exists in this composition.

## Recovery and evidence contract

One OS integration lock in the authoritative Git common directory covers the
entire same-target delivery turn: candidate construction, checks, publication,
promotion and cleanup. The shorter target guard still protects provisioning,
promotion and cleanup from concurrent pack target operations. Fresh native
inventory and retained command reconciliation check every known attempt before
integration. Native workers request their own drain acknowledgement; Gas City
owns retirement. Acceptance requires fresh exact closed-session/task/workspace
correlation or positively proved reassignment, rather than the acknowledgement
alone. Open unfinished actors retain their occupied position. Repeating exact
native close for an already closed retained session is recoverable; a reassigned
new owner is not closed. Optional escaped-process-absence confirmation is not
required. Stock listing omits closed sessions, so known
required IDs are read individually through the native tracker. This does not
claim a complete historical writer inventory. Project qualification and Git
command custody remain separate; unknown command observations retain custody.
The exact public `session close ID --json` invocation delegates termination to
Gas City without a second private host-process census. The adapter still records
intent, validates the close response, rereads exact correlation and repeats close
after an ambiguous response. Shell wrappers, other session operations and extra
close arguments do not receive this delegation.

Native operational reads use their actual decoded native responses without
private durable success receipts. Failed read diagnostics remain available;
uncertain escaped descendants retain the minimal custody fact. Mutation and
qualification intents retain exact attempt/process markers because the pinned
native runtime has not demonstrated equivalent escaped-descendant custody.
Legacy command receipt recovery remains available and is not silently converted.

The first publication intent pins the push endpoint and target ref. Every later
publication checks that pin and fetches the exact endpoint before considering a
push. Applied-but-lost publication reuses the same candidate if that candidate
is reachable from the pinned remote. Denial, throttle or uncertain custody is
not an automatic push retry. An explicit native continuation may observe the
advanced head and refresh integration, with at most three candidate revisions.
Each revision has separate immutable merge intent and qualification facts.
Conflict or incompatible lineage preserves the candidate, original result and
resources. No implementation execution resolves publication ambiguity.

Every native workflow node receives immutable task, root, implementation attempt,
Base, accepted result, candidate, target head and exact candidate resource facts
for each revision. A changed proposed implementation cannot inherit acceptance
or qualification from the earlier commit. This ticket does not implement the
separate bounded independent review workflow owned by its prerequisites.

Cleanup checks the branch head before native removal, then deletes it with Git's
expected-old-value operation. Native cleanup retries observe already-absent
resources without a second destructive removal. An exact cleanup intent plus
publication and local promotion proof permits public resume after a lost cleanup
response; absence before that boundary still refuses worktree recreation.
Native safety refusals retain dirty, foreign, moved, borrowed, live and unreadable
resources. Task closure follows settled cleanup; successors still require fresh
native tracker dependency observations.

## Scenario-to-test map

`test/native-cleanup-resume.test.ts` covers the controlled public-resume boundary
after native removal applies but its response is lost. Exact cleanup intent,
prepared attempt identity and matching publication/promotion allow resume
without recreating the worktree, rerunning implementation or repushing. Missing
or contradictory facts refuse resume and preserve the remaining resources.
This controlled proof does not replace the real Git/native delivery scenarios
or qualify the complete live native delivery workflow.

| Scenario | Acceptance or focused safety evidence |
| --- | --- |
| S7: two accepted results, serialization, applied push response loss | `test/native-delivery.test.ts` launches two public native workflows into real temporary repositories, holds integration until both exact results exist, holds the first applied push, observes the blocked second candidate, then uses public resume. It asserts unchanged results/candidate, two ordinary pushes, both results in local/remote target and settled resources. |
| S8: applied cleanup response loss | The same composed test holds the first applied native cleanup, observes publication/promotion and task still unfinished, then resumes from exact absence. |
| Compatible advanced head, unchanged implementation, finite refresh | `test/candidate-refresh.test.ts` exercises the production native delivery composition and the retained refresh adapter, including exact parent recovery, new qualification, denial, conflict, incompatible lineage, exhaustion, changed result/approval and endpoint refusal. |
| Exact native resource safety | `test/native-worktree.test.ts`, `test/workflow.test.ts`, `test/native-boundaries.test.ts` and `test/process-reconciliation.test.ts` cover native dirty/foreign/stale/unmerged refusal, moved branch preservation, absent resources and escaped/live/unknown writer custody. These adapter tests supplement the composed seam. |
| Operational observations and lock ownership | `test/operational-read.test.ts` and `test/git-guard.test.ts` verify read/mutation classification, absence of durable successful-read receipts, real OS serialization and exact helper release. |

## Observed qualification

The composed public native S7/S8 test passed in 469.70 seconds against the
qualified native binary. Both implementation results were accepted before the
integration barrier released. The test observed one candidate while the first
push was held, reconciled the applied push and cleanup through public resume,
and verified exactly two ordinary pushes, both results in the local and remote
target, unchanged accepted facts, and absence of all owned worktrees.

The single-result native city test proved both actor self-acknowledgements and
delivery, then exposed a public-resume selector defect: native scope nodes
mirror their subject delivery metadata. Resume now selects executable nodes;
controlled tests refuse missing or duplicate executable deliveries. Retained
public resume of that exact delivered run passed in 14.27 seconds, preserving
its original attempt/proposal and verifying remote target and resource absence.

The completed full `pnpm check-all` passed 246 tests in 40 files, including the
composed native delivery scenario. Coverage was 99.57% statements, 99% branches,
99.75% functions and 99.64% lines. Build, typecheck, complexity, lint and the
independent example checks passed. Scoped review closed the selector finding.
Detailed failed-run diagnostics belong to the external evidence archive.
The subsequently added paired review-restart fixture passed separately with two
live tests in 431.74 seconds. This gate does not certify tests added after it
completed; production qualification/custody code remained unchanged.

Completed Hapsland declaration evaluations reported no findings for
`acceptedResultMatches` (0.06), `candidateMatches` (0.05), `candidateKey` (0.03),
`gitRead` (0.07), `nativeRead` (0.11) and `operationalRead` (0.22), against threshold
0.7. Source-bearing classifier responses remain outside Git. The earlier
`nativeRead` finding was fixed by making its operation map local to the callable.
These are completed rule evaluations, not claims of exhaustive analysis.

Revision-specific qualification directories preserve earlier diagnostics.
Scoped reviews closed delivery correlation, remote-read operand and native
selector findings. Other parent scenarios and the configured-provider combined
trial remain separate acceptance boundaries.

| Required boundary | Status and next evidence |
| --- | --- |
| S7/S8 public native workflow with two accepted results and deterministic loss | Passed composed native test reaching both barriers. |
| Official integration policy comparison and precise reuse/adapters | Documented above with immutable source pin; no executable official refinery adoption claimed. |
| Same-target serialization, correlation, pinned publication recovery and finite refresh | Passed focused adapters and composed public native delivery. |
| Completion after publication, local promotion and cleanup; fresh successor eligibility | Implemented and covered by focused workflow checks; composed native delivery passed. |
| Exact native resource identity, preservation, absence reconciliation and branch compare-delete | Implemented with focused safety checks; S8 composed public recovery passed. |
| Native custody, escaped writers and operational observations | Retained narrow process guard and classified native reads; unknown custody preserves resources. No dead-session equivalence claimed. |
| Stable task/attempt/candidate metadata and immutable accepted implementation evidence | Implemented with changed-result/approval refusal and revision-specific qualification; composed propagation passed. |
| TypeScript/Effect, focused checks, full 99% gate, Hapsland, separate project checks and no CI | Focused/static/Hapsland checks and full 99% gate passed as described. The fixture project check is separate from pack qualification. No CI added. |
| Exact scenario handoff and parent preservation | This handoff records failed/missing observations; no parent completion or issue mutation claimed. |

Reproduction in the provisioned native environment:

```sh
# Prepare the qualified native dependencies according to SETUP.md first.
source trial/env.sh
mise exec -- pnpm test test/native-delivery.test.ts
mise exec -- pnpm check-all
```

# S7/S8 native delivery and cleanup

**Status: incomplete; no accepted result.**

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
integration; releasing a runtime lock or observing a dead session cannot release
an escaped writer. Unknown process observations retain custody.

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

| Scenario | Acceptance or focused safety evidence |
| --- | --- |
| S7: two accepted results, serialization, applied push response loss | `test/native-delivery.test.ts` launches two public native workflows into real temporary repositories, holds integration until both exact results exist, holds the first applied push, observes the blocked second candidate, then uses public resume. It asserts unchanged results/candidate, two ordinary pushes, both results in local/remote target and settled resources. |
| S8: applied cleanup response loss | The same composed test holds the first applied native cleanup, observes publication/promotion and task still unfinished, then resumes from exact absence. |
| Compatible advanced head, unchanged implementation, finite refresh | `test/candidate-refresh.test.ts` exercises the production native delivery composition and the retained refresh adapter, including exact parent recovery, new qualification, denial, conflict, incompatible lineage, exhaustion, changed result/approval and endpoint refusal. |
| Exact native resource safety | `test/native-worktree.test.ts`, `test/workflow.test.ts`, `test/native-boundaries.test.ts` and `test/process-reconciliation.test.ts` cover native dirty/foreign/stale/unmerged refusal, moved branch preservation, absent resources and escaped/live/unknown writer custody. These adapter tests supplement the composed seam. |
| Operational observations and lock ownership | `test/operational-read.test.ts` and `test/git-guard.test.ts` verify read/mutation classification, absence of durable successful-read receipts, real OS serialization and exact helper release. |

## Observed qualification

The composed public native test has **not passed**. Earlier runs exhausted the
startup or accepted-result observation bounds. The latest isolated snapshot run
(`s78-native-focus5`) failed with `native delivery observation pending` after
240.50 seconds. Fresh retained native events showed both exact worktrees prepared,
one preparation closed, both implementation results still absent and no candidate
constructed. Neither lost-response barrier was reached. The native supervisor
reported slow durable storage and unreadable process environments, including
PIDs 2178874 and 3075204. This is observed runtime evidence; it does not establish
that those conditions are the sole cause. Those resources and custody checks were
preserved. S7 and S8 remain unqualified.

Focused checks passed 48 tests across six files before the final fixture changes;
the final refresh/classification checks passed six tests across two files in
7.83 seconds. A separate recovery cohort passed eight tests across three files.
The complete gate passed dependency coherence, build, TypeScript/Effect,
Schema boundaries, circular dependency, complexity and lint stages; its coverage
stage is still running in a detached invocation after two turn interruptions.
No complete gate or 99% coverage result is claimed.

Completed Hapsland declaration evaluations reported no findings for
`acceptedResultMatches` (0.06), `candidateMatches` (0.05), `candidateKey` (0.03),
`gitRead` (0.07), `nativeRead` (0.11) and `operationalRead` (0.22), against threshold
0.7. Source-bearing classifier responses remain outside Git. The earlier
`nativeRead` finding was fixed by making its operation map local to the callable.
These are completed rule evaluations, not claims of exhaustive analysis.

Fresh independent review round one found that revision qualification logs could
overwrite earlier diagnostics. Revision-specific log directories now preserve
those outputs. Fresh round two reviewed `368f610..89dbc24` and reported no
reasonable blocking implementation findings; it expressly left live qualification
and the complete gate pending. No other parent scenario or combined live trial
is claimed completed by this handoff.

| Required boundary | Status and next evidence |
| --- | --- |
| S7/S8 public native workflow with two accepted results and deterministic loss | Failed observation run; requires a passing composed native test reaching both barriers. |
| Official integration policy comparison and precise reuse/adapters | Documented above with immutable source pin; no executable official refinery adoption claimed. |
| Same-target serialization, correlation, pinned publication recovery and finite refresh | Implemented with focused adapter evidence; public composition remains unqualified. |
| Completion after publication, local promotion and cleanup; fresh successor eligibility | Implemented and covered by focused workflow checks; complete native continuation remains unqualified. |
| Exact native resource identity, preservation, absence reconciliation and branch compare-delete | Implemented with focused safety checks; S8 public recovery remains unqualified. |
| Native custody, escaped writers and operational observations | Retained narrow process guard and classified native reads; unknown custody preserves resources. No dead-session equivalence claimed. |
| Stable task/attempt/candidate metadata and immutable accepted implementation evidence | Implemented with changed-result/approval refusal and revision-specific qualification; composed propagation remains unqualified. |
| TypeScript/Effect, focused checks, full 99% gate, Hapsland, separate project checks and no CI | Focused/static/Hapsland checks passed as described. Full gate remains unfinished. The fixture project check is separate from pack qualification. No CI added. |
| Exact scenario handoff and parent preservation | This handoff records failed/missing observations; no parent completion or issue mutation claimed. |

Reproduction in the provisioned native environment:

```sh
export DALPH_TRIAL_ROOT=/workspace/dalph-dogfood/gascity-dalph
source trial/env.sh
mise exec -- pnpm test test/native-delivery.test.ts
mise exec -- pnpm check-all
```

# S7/S8 native delivery and cleanup

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

Qualification is still in progress. The first composed run stopped during native
startup at its 60-second command bound; retained supervisor evidence showed about
42 seconds in tracker initialization. Startup now has a separate 120-second
bound. The second run reached native worktree preparation but exhausted the
180-second accepted-result observation deadline while the runtime reported
uncertain process attribution. The fixture now owns its tmux directory instead
of inheriting another city's directory. No failed run establishes S7/S8 success.

Focused checks before the final native rerun passed 48 tests across six files;
the subsequent production refresh-flow test passed four tests in its file.
TypeScript, Effect diagnostics, lint and complexity checks passed after coherent
helper extraction. Complete coverage and Hapsland results will be recorded after
the final gate and fresh review. No other parent scenario or combined live trial
is claimed completed by this handoff.

Reproduction in the provisioned native environment:

```sh
export DALPH_TRIAL_ROOT=/workspace/dalph-dogfood/gascity-dalph
source trial/env.sh
mise exec -- pnpm test test/native-delivery.test.ts
mise exec -- pnpm check-all
```

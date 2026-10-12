# Native session API fit

Inspected against Gas City commit
`8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a` on 2026-10-11.
The API findings are followed by the accepted 2026-10-11 product decision.

The pack must use supported Gas City operations wherever they cover the
boundary. A local platform patch is not an available upstream API.

## Compiled Ralph infrastructure qualification

The same bundled patch also qualifies the public finite heartbeat boundary.
Stock `gc runtime heartbeat` writes `held_until`, but its execution backstop
ignored that hold and drained a quiet integrator during actual project
qualification. The repaired backstop spends no observation budget during an
active hold and re-reads the exact session before drain. Expiry restores the
backstop; controller reconstruction never extends the hold. The pack requests
one finite hold at the deterministic role boundary, with explicit native
session context, rather than implementing a watchdog or renewal loop.
Native heartbeat/backstop tests passed through `//cmd/gc:gc_test` under Bazel.
The public root CLI also requires the embedded heartbeat result schema; the
leaf's `--json` flag alone is rejected by its JSON contract guard. The bundled
patch declares that existing payload and tests the actual public invocation
against a controlled native store.
Composed publication/cleanup proof still requires the actual native fixture.

Stock native transport retry retained the authored workspace through attempts
one to three, but its active `KindRalph` handler started semantic round two after
retry exhaustion. `evaluateRalphIteration` treated every nonpassing result as
another iteration. The legacy `KindCheck` hard-failure and infrastructure handling
did not cover this path; the public convergence primitive is not a qualified
replacement for this composition.

The bundled [native patch](../patches/gascity-native-workflow-boundaries.patch) repairs
the active Gas City dispatcher. Explicit hard body failure terminates; launched
exit 75 or typed infrastructure blindness retries the same completed iteration
under the existing separate infrastructure budget, and exhaustion is terminal.
Completed bodies with ordinary blocking gate verdicts retain semantic iteration.
The documented removed-work-directory failed-start rule is preserved. The pack
authors hard failure on its review body and verifies the public native build
identifier before cook; [setup](SETUP.md) defines the build recipe. This is a
patched-source qualification, not a claim that the upstream stock API was fixed.

Both public `ProcessControl` regression tests failed before the repair, then
passed together with neighboring Ralph tests. Bazel's dispatch test target,
including nogo, passed in 301.49 seconds. The first composed patched native
transport trial observed exactly three retries in round one and skipped
downstream delivery; its later public resume failed the pack's skipped-versus-
delivered distinction, so that invocation is not credited as a complete pass.
Stock session-close acceptance below remains independent of this control patch.

| Required operation | Existing owner | Consequence for the pack |
| --- | --- | --- |
| Permanently finish an open session | `session close`, `Manager.CloseDetailed`, under the native runtime lease | Delegate termination and lifecycle mutation to Gas City. |
| Kill a runtime while preserving work for restart | `session kill`, including its durable kill fence and controller poke | Do not substitute this for permanent completion: native reconciliation can restart it. |
| Remove a runtime still bound to a closed session | Supervisor closed-bound runtime reaper | Reuse native reconciliation; do not implement a second reaper in the pack. |
| Observe a named runtime | Native session read model and worker state | Distinguish observations from a durable tracker row. A closed row alone is not a runtime observation. |
| Prove every escaped writer absent after an ambiguous historical close | Not established by the inspected public close response or named-runtime observation | This separate acknowledgement is no longer required by the accepted product decision below. |

The supervisor already freshly reads the binding's `GC_SESSION_ID`, confirms
the corresponding bead closed through the live store, and stops the still-bound
runtime under a lease. Missing or unreadable identities are skipped rather than
treated as absent. This covers surviving runtime artifacts; it does not by itself
establish absence of processes that escaped that runtime's inventory.

The native supervisor also owns a separate process-table orphan sweep. It
attributes a root to the exact city and session, corroborates its ended
incarnation through independent tracker reads, requires a reparented root and
start identity, excludes infrastructure and delegates identity-fenced
termination to the provider. This is existing platform behavior, not a pack
cleanup implementation.

## Stock supervisor experiment

An isolated file-backed city, separate `GC_HOME` and separate tmux namespace
used the unmodified installed binary. Go build metadata confirmed revision
`8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a`, `vcs.modified=false`.
The fixture uses schema-2 `agents/writer/agent.toml`; legacy `[[agent]]` tables
are rejected by this revision.

Public start, session creation and repeated session close succeeded. A detached
45-second sleep process bearing the closed session's identity and exact city
path was then started before restarting this isolated supervisor. Gas City
reported its exact PID and session in `reaped process-table orphan ...
(row-closed-or-absent)`, and the process was absent immediately afterward,
before its natural timeout. The supervisor was stopped through its public CLI.

Retained local diagnostic artifacts are under
`/tmp/gascity-stock-api-GkzJ0A`: `orphan-before.txt`, `orphan.pid`,
`orphan-start.json` and `home/supervisor.log`. These transient paths are evidence
locations, not installation instructions or portable fixtures.

This proves that stock Gas City performs this cleanup case. It does not yet
qualify the complete pack workflow, and partial process scans remain visible in
the same supervisor log. A successful close or an empty session list does not
prove complete process absence; the product decision below accepts native close
without claiming that stronger fact. Default maintenance also reports a bd-only order
failure for the file-backed diagnostic city; this experiment is not a complete
maintenance or delivery qualification.

The public session GET response also cannot certify cleanup through its
`running` field. `enrichSessionResponseWithKeyedPaths` returns without probing
unless the lifecycle state is active; a failed state probe likewise leaves the
default false value. Therefore a closed response with `running: false` is not
a fresh negative runtime observation and says nothing about escaped writers.
The adapter reports an explicit retained-custody error for an invalid native
close response rather than exposing an unexplained schema failure.

The product decision accepted on 2026-10-11 removes the additional completion
acknowledgement requirement. Pack accepts stock close success plus fresh exact
session/task/workspace correlation and delegates orphan reconciliation to the
native supervisor. It does not assert synchronous absence of every detached
writer. Invalid or lost close responses retain custody until exact native close
is reconciled. The unpublished runtime_absent patch is no longer a pack
dependency; controlled fixtures use stock responses by default. Composed live
acceptance remains required before delivery completion is claimed.

## Shared review workspace routing

For pooled sessions, `gc.work_dir` on a task is an observation stamp, not an
unowned launch override. Complete native worktree provenance binds the owned
implementation workspace. Review/fix nodes cannot copy that provenance: its
bead identity belongs to the implementation task.

Stock pool routing also supports a configured agent `work_dir` plus the task's
`gc.pack_workspace` slug. The pack uses this route for review/fix borrowing:
configure both writer roles' base directory to `DALPH_WORKTREE_ROOT`, publish
the exact direct-child workspace slug before readiness, and retain the original
attempt and implementation ownership. Additional `gc.pack` prefixes are refused
because they change native path computation. The city template renders explicit
rig-scoped agent patches; preflight refuses missing or different workspace bases.

Legacy task `work_dir` remains an assigned-task launch authority, but an initial
unassigned pool launch has no assigned task to consult. It does not solve this
first-launch boundary. Drain-source resolution belongs to actual native drain
recipes; the pack does not fabricate drain membership to share a directory.

Relevant stock owners: `pool_desired_state.go:worktreeSpecForBead`,
`build_desired_state.go:poolTriggerWorkDir` and `packWorkspaceSlug`, and
`session_reconciler.go:resolveTaskBeadWorkDir`. Live proof must confirm the actual
review/fix session cwd; configuration and controlled selector tests are not that
proof.

Sources at the inspected commit:

- [Close implementation](https://github.com/gastownhall/gascity/blob/8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a/internal/session/manager.go): `CloseDetailed` and `KillContext`.
- [Kill CLI](https://github.com/gastownhall/gascity/blob/8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a/cmd/gc/cmd_session.go): `newSessionKillCmd` and `cmdSessionKillWithForce`.
- [Supervisor cleanup](https://github.com/gastownhall/gascity/blob/8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a/cmd/gc/session_beads.go): closed-bound runtime reaping and `stopStillBoundClosedRuntimeLeased`.
- [Runtime contract](https://github.com/gastownhall/gascity/blob/8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a/internal/runtime/runtime.go): `Provider.Stop` and `StopForCleanup`.
- [Public session runtime overlay](https://github.com/gastownhall/gascity/blob/8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a/internal/api/runtime_observation.go).

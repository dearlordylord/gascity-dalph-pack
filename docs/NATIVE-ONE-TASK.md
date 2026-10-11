# Native single-task delivery

This slice adds `native-v1` beside the retained `legacy-v1` deterministic path.
Independent bounded review and the remaining parent scenarios belong to later
slices. This document describes the implementation; observed acceptance results
are recorded separately in `TRIAL-RESULTS.md`.

Build the pack with the pinned Node and pnpm before importing it. Configure the
rig's `dalph.native-worker` as a direct native provider: inherit or explicitly
select `codex` or `claude`, with native provider/agent option defaults for model,
reasoning and permission mode. The worker has no script `start_command` and does
not invoke an agent CLI. `dalph.native-prepare` and `dalph.native-integrator` are
deterministic one-shot boundaries. The native formula routes its implementation
to the qualified agent from the launch contract.

Set the normal `DALPH_*` city, rig, target, branch, worktree, pack and tracker
settings, plus `DALPH_NATIVE_CONTRACT` pointing to an absolute JSON path and
`DALPH_NATIVE_TASK` containing the task instruction. An example contract is:

```json
{
  "version": 1,
  "agent": "expenses/dalph.native-worker",
  "harness": "claude",
  "harnessVersion": "2.1.289 (Claude Code)",
  "runtime": "tmux",
  "runtimeVersion": "tmux 3.3a",
  "readiness": ["claude", "auth", "status"],
  "check": { "command": ["node", "--test"], "timeoutSeconds": 60 }
}
```

Use the exact installed harness version output; version strings are compared
without a compatibility guess. Project checks must be explicit argv arrays and
have a positive finite timeout of at most 600 seconds. Qualification runs the
same configured command on the clean Base, implementation commit and integration
candidate, with separate durable command receipts. Neither the pack's quality
gate nor harness readiness substitutes for project qualification.

Launch and resume through these public entry points:

```sh
mise exec node@24.20.0 -- node "$DALPH_PACK_ROOT/dist/native.js" launch
mise exec node@24.20.0 -- node "$DALPH_PACK_ROOT/dist/native.js" resume WORKFLOW_ID
```

Launch creates a private content-addressed native check launcher under the
city’s `.gc` directory using its pinned Node executable and configured workspace
environment. This preserves the configuration inside Gas City’s narrow formula
check sandbox; the launcher never starts an agent. Source-bearing launcher
configuration stays outside Git.

Launch preflights the selected direct harness, native permission options, pinned
harness/runtime versions, readiness command, tracker health, required conditional
writes and guarded release, and project executable lookup. Preparation rechecks
admission before creating a task worktree. This revision supports local Linux
same-user process observation with tmux. Its hook claim implementation requires
`bd`; file-backed hook claims are refused before task preparation. The controlled
native provider called `fixture` is for acceptance tests.

A clean target must be on the configured branch and equal its freshly fetched
remote head for a new admission. Bind the native attempt and owned work plan
before provisioning; retained attempts keep their original Base and contract.
The product identity is the pair `(workflow root, task slot)`, with one immutable
attempt, Base, owned worktree and proposed/qualified commit. Native implementation,
check and delivery nodes carry `dalph.native_attempt` and `dalph.native_candidate`.
The implementation proposal records its actual native session. Candidate checks
require exact session/task/worktree correlation plus fresh stopped-session and
process observations before recording an accepted result.

Two task-work positions are durable attempt admissions, independently of the
native session pool's live count. Stopped, uncertain, closed-but-unsettled and
prepared retained attempts occupy their positions. Only exact completed delivery
and cleanup proofs settle one. Resume refuses a lost prepared worktree; it never
recreates it. A closed delivery whose final settlement acknowledgement was lost
can settle from its exact publication, promotion and cleanup proofs.

Existing deterministic integration constructs the ordered-parent merge candidate,
qualifies it, publishes with remote readback, promotes the target under its Git
guard and cleans only owned resources. Implementation completion merely proposes
work; the native check and deterministic integration authorize delivery.

Legacy receipts remain on the legacy entry point and default to `legacy-v1`.
Legacy execution refuses native-marked work both before and after claiming;
native resume requires an explicit `native-v1` launch fact and refuses legacy
roots. No legacy receipt is interpreted as a native session.

Prepared retained work with missing session inventory, or with an unobserved
proposal session, blocks resume and keeps its occupied position. This includes
the launch gap before a first writer is observed; operator reconciliation must
restore native evidence before recovery.

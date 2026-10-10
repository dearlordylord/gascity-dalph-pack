# Dalph delivery pack for Gas City

Gas City owns graph scheduling, dependency readiness, native claims and session
capacity. This pack runs one bounded task per native session. Workers invoke
the actual Codex CLI with `gpt-6-luna` and `model_reasoning_effort="max"` in
exact Git worktrees. The integrator runs no model.

The expenses workflow distinguishes implementation-result beads from delivered
task beads. Only delivered task beads unblock successor implementations. Worker
capacity is two; the target integrator capacity is one. No second scheduler is
run by the pack.

See [ACCEPTANCE.md](ACCEPTANCE.md) for chronological scenarios and required
evidence. Trial qualification is still in progress; the final report will name
the verified artifact revision and remaining limits.

## Delivery boundaries

Each work bead retains an immutable attempt, Base SHA, branch and path before
native `gc worktree ensure`. Recovery verifies an existing preparation and
refuses to recreate a lost prepared worktree. Model and qualification intents
precede child processes; known exits and fresh `/proc` writer observations
precede acceptance. A zombie cannot write; an unreadable live same-user process
retains custody. At most three command ordinals are retained without replacing
the preceding evidence. A failed qualification requires diagnosis; it is not
blindly repeated. Missing qualification exit evidence permits a fresh check
only after stopped-writer reconciliation. Models have a 600-second budget;
checks 90 seconds, with bounded process-group termination afterward.

The integrator merges the accepted result into a separate candidate with exact
ordered parents `[current target, result]`, qualifies that commit, records push
intent, and publishes with an ordinary push. Recovery reads remote ancestry
before another push. Promotion is fast-forward only on a clean target checkout.
Cleanup uses original native provenance and Base SHA, proves stopped writers,
then compare-deletes only the exact owned branch tip. Delivery closes after
both owned worktrees are cleaned, releasing successors through native tracker
dependencies. A cooperative Git lock waits at most 120 seconds; no reset,
force push, prune, or forced worktree removal is used.

Python implements the CLI boundaries and child custody. The loopback tracker
HTTP boundary uses Effect V4 HttpClient, Schema, typed failures and
`NodeRuntime.runMain`; it uses no direct fetch. Model progress remains visible
in tmux as well as retained logs so Gas City's quiet-session watchdog can
distinguish an executing turn from an idle claimed task.

## Pinned environment

| Component | Exact trial input |
| --- | --- |
| Gas City source | `8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a` |
| Gas City bundled core/BD packs | `e38ce9cc55d15fa351199c042f0d07aba1a347af` |
| Beads CLI source | `1b7bf9b1910d8ecec3f461f70f478314b654eaa6` |
| Dolt | `2.4.2` |
| tmux / Python | `3.3a` / Python 3 |
| Node / pnpm | `24.20.0` / `10.28.2` |
| Effect / platform-node / platform-node-shared | `4.0.0-beta.106` |

Beads release 1.3.1 lacks the four required `--if-revision` verbs. The pinned
source CLI supplies them; both conditional writes and guarded release remain
`require`. `native_transport="off"` deliberately uses the supported CLI
transport because the pinned native preflight could not confirm project ID in
this local direct-Dolt setup. These are compatibility constraints of this
prototype, not evidence that stock release binaries suffice.

Build the pinned sources with `mise exec go@1.27.2 -- go build`; Beads uses
`CGO_ENABLED=0` and `-tags gms_pure_go`. Set its build provenance with
`-ldflags '-X main.Build=1b7bf9b1910d8ecec3f461f70f478314b654eaa6'`.
The actual checkouts and binaries live beside this pack in `gascity/`,
`beads/`, and `bin/`. `pnpm-lock.yaml` pins adapter dependencies, including the
platform-node-shared override needed by this Effect beta.

## Run and inspect the current trial

```sh
cd /workspace/dalph-dogfood/gascity-dalph
. pack/trial/env.sh
gc --city "$DALPH_CITY_ROOT" --rig expenses ready --json
gc --city "$DALPH_CITY_ROOT" graph ex-6g2 --json
gc --city "$DALPH_CITY_ROOT" session list --json
bd -C "$DALPH_TARGET_REPO" show ex-6g2 --json
tmux -L dalph-expenses list-panes -a
```

Cook once for a new run with
`gc --city "$DALPH_CITY_ROOT" --rig expenses formula cook expenses-delivery --json`.
Retain its returned `root_id` and mapping; cooking again without an attachment
creates another workflow. The current run is `ex-6g2` and must not be recooked.
Restart the isolated supervisor with `gc supervisor start`; native tmux sessions
outlive an abrupt supervisor loss. To stop the city and its sessions use
`gc --city "$DALPH_CITY_ROOT" stop`. `GC_HOME` keeps its registry isolated;
`DOLT_ROOT_PATH` confines author configuration, and `TMUX_TMPDIR` confines tmux
state. No HOME or Codex authentication directory is replaced.

## Reproduce in a fresh directory

Use the pinned binaries above plus `git`, `mise`, `pnpm`, `python3`, `jq`,
`tmux`, `lsof`, and an authenticated Codex CLI able to run Luna max. Begin with
an empty trial directory and a free loopback supervisor port (8372 here).
Preserve the original trial when creating another one.

1. Copy `trial/seed/` into a fresh `expenses/` Git repository on `master`;
   commit the seed, initialize `expenses-remote.git` as a bare repository, add
   it as `origin`, and push `master` normally. Set a repository-local test
   identity. The seed has no application implementation or dependencies.
2. Adapt `trial/env.sh` and the two absolute paths in `trial/city.toml` to the
   new directory and pack location. Create the named `gc-home`, `tmux`,
   `evidence`, and `worktrees` directories. Source that environment. Set Dolt
   identity with `dolt config --global --add user.name 'Dalph Trial'` and
   `dolt config --global --add user.email 'dalph-trial@local'`; the sourced
   `DOLT_ROOT_PATH` makes these settings local to this trial.
3. Install the pack adapter with
   `mise exec node@24.20.0 -- pnpm install --frozen-lockfile` in the pack.
   Initialize the city with
   `gc init "$DALPH_CITY_ROOT" --file "$DALPH_PACK_ROOT/trial/city.toml" --beads-target local --beads-transport direct --no-start --skip-provider-readiness`.
   Start with `gc --city "$DALPH_CITY_ROOT" start`.
4. Verify the rig is registered; if absent, use
   `gc --city "$DALPH_CITY_ROOT" rig add "$DALPH_TARGET_REPO" --name expenses --prefix ex --default-branch master --include "dalph=$DALPH_PACK_ROOT"`.
   Fresh pinned Beads uses schema 69. For a retained older local trial, inspect
   `bd migrate schema --help` and migrate its exact owned databases before
   starting sessions; migration of an existing shared store is a separate
   operator decision. Keep `.beads/` files untracked in the target, preserve
   them on disk, and normally push any initialization commit before cooking.
5. Run `gc lint "$DALPH_PACK_ROOT"`, inspect
   `gc --city "$DALPH_CITY_ROOT" --rig expenses formula show expenses-delivery --json`,
   cook once as above, and retain the mapping. Gas City admits workers itself.

The trial config disables default maintenance orders and the BD dog so only
the agreed workflow acts on this isolated repository. For another project,
author its formula descriptions and contract file; set `DALPH_RIG`,
`DALPH_TARGET_REPO`, `DALPH_CITY_NAME`, `DALPH_CITY_ROOT`,
`DALPH_TRACKER_ENDPOINT`, `DALPH_TARGET_BRANCH`, and `DALPH_WORKTREE_ROOT`.
Claims and dependencies remain native GC/Beads authorities.

## Focused checks and evidence

```sh
mise exec node@24.20.0 -- pnpm test
```

Tests exercise exact-parent admission, native worktree refusals/idempotent
cleanup including a deliberately lost cleanup response, the real Effect HTTP
entrypoint, and real child-process custody. Bulk behavior is controlled; live
Codex evidence remains separate. `../evidence/` holds model JSONL/stderr,
per-session logs, qualification logs, tracker snapshots and fault experiments.
The superseded file-provider and subprocess experiments are retained for
diagnosis and do not count as passing recovery evidence. A final audit must
show all workflow beads closed, published acceptance tests passing, no model
or integrator running, and no eligible owned worktree or branch left.

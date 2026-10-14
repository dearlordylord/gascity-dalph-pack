---
name: gascity-dalph
description: Prepare a project and run or recover its task graph through the Gas City Dalph pack.
disable-model-invocation: true
---

# Deliver a task graph

The Operator supplies a target repository and tasks. Prepare an isolated Gas
City, launch the native workflow, and follow it through review, integration,
publication, ticket closure and owned cleanup. Gas City owns dispatch and
sessions; this pack supplies workflow formulas and delivery policy.

## Locate the pack and the run

When reading this file through a web link, clone
`https://github.com/dearlordylord/gascity-dalph-pack.git` into a directory beside
the target project. Record its exact commit and set `DALPH_PACK_ROOT` to that
absolute directory. Resolve the links below against the cloned repository;
they are operational instructions, not additional skills to install.

Identify the target repository, target branch, configured project check command
and task acceptance criteria from the user's request and project documentation.
Ask only for facts that cannot be determined there. Use the user's configured
harness/model settings. Read the target's agent instructions before task work.

If the project already has a city, retained environment, contract or workflow ID,
inspect those exact resources and take the **Recover** branch. Otherwise take
**Prepare**. Done: one identified project and either one retained workflow or
one new isolated workspace; no second root has been launched.

## Prepare a new machine or project

1. Read [setup](../../docs/SETUP.md), including dependency versions, then
   [matched native build](../../docs/NATIVE-CANDIDATE.md) before installing Gas
   City/Beads. The source manifest and bundled patch are required inputs; stock
   release binaries are not qualified substitutes. Install the listed Linux
   tools and pinned Node/pnpm/Go cohort using the machine's supported package
   manager and mise. Reuse matching installed tools. Authentication belongs to
   the user's harness; if absent, request that specific login.
   Done: required binaries resolve with matching identities and harness login.
2. Set the target-specific variables **before** sourcing `trial/env.sh`:
   `DALPH_PACK_ROOT`, `DALPH_TRIAL_ROOT`, `DALPH_TARGET_REPO`,
   `DALPH_TARGET_BRANCH`, `DALPH_RIG`, `DALPH_CITY_ROOT`, `DALPH_CITY_NAME`,
   `DALPH_TRACKER_ENDPOINT`, `DALPH_PROJECT_CONTRACT_PATH`. Keep city registry,
   tracker data, worktrees and evidence outside target commits. Use a short
   private tmux directory, a private temporary directory and separate ports for
   concurrent projects. Preserve an existing project's sources and remote;
   the example seed steps in setup apply only to a new demo repository.
   Persist the selected exports in an environment file inside the isolated
   workspace so another agent can recover the same resources.
   Done: exact paths, city identity and endpoint are recorded and independent
   of another project's live city.
3. Follow setup to build the pack and matched native tools, author the native
   contract with the project's actual check command, render the city, initialize
   it and register the rig with this pack. Select the proxied-native profile
   **before** rendering/initialization as described in matched native build.
   Verify the registered city name equals `DALPH_CITY_NAME`, and use the actual
   supervisor endpoint rather than assuming its default port.
   Done: clean target with matching ordinary remote head, registered rig,
   reachable supervisor and successful complete-role native preflight.

## Launch

Read [product graph](../../docs/PRODUCT-GRAPH.md) for graph identity and completion
boundaries. From any directory, use the recorded environment and absolute CLI:

```sh
. /absolute/path/to/isolated-workspace/env.sh
mise exec node@24.20.0 -- node "$DALPH_PACK_ROOT/dist/native.js" preflight
```

The ready entrypoints support one task or the four-task A → {B,C} → D diamond.
For one task, set `DALPH_NATIVE_TASK` to its instructions and run `launch`.
For the diamond, write a JSON object with `a`, `b`, `c`, `d` instructions and run:

```sh
mise exec node@24.20.0 -- node "$DALPH_PACK_ROOT/dist/native.js" launch-graph /absolute/path/tasks.json
```

Each instruction names owned files, behavior and acceptance checks. Preserve
the requested dependencies. For another topology, report the unsupported shape
and required native formula extension; obtain an explicit scope decision rather
than flattening the graph or claiming arbitrary-DAG support.

Retain the returned `workflow_id`, launch response, pack commit and contract
inside the isolated workspace. Gas City dispatches successors automatically.
Done: exactly one acknowledged root is recorded; follow that root to completion.

## Recover and observe

For an interrupted diamond, restore its original environment and contract, start
its exact city through Gas City, then run:

```sh
mise exec node@24.20.0 -- node "$DALPH_PACK_ROOT/dist/native.js" resume-graph WORKFLOW_ID
```

For a single task use `resume WORKFLOW_ID`. Recovery retains attempts, Base SHAs,
worktrees and consumed budgets. An ambiguous launch response requires exact
native root observation before another effect. Retained legacy workflows use
[legacy recovery](../../docs/RECOVERY.md); native resume refuses them.

Read [dashboard setup](../../dashboard/README.md) when the Operator wants a graph.
Build/serve from the pack with the same environment. Return the host-accessible
URL containing the actual city, rig and workflow ID. Confirm an HTTP observation
from that address; four tasks appear as four squares, with internal phases in
task details. The browser's requests use the dashboard origin; supervisor
loopback is server-side.

For slow or failed boundaries, preserve diagnostics and follow
[verification cost limits](../../docs/QUALITY.md#cost-limit). Record expected
duration and stop time before long work; stop owned operations safely at that
time. Broad gates are optional. Focused controlled proofs and live observations
have separate scopes; failed, skipped and unrun checks retain their status.
Done: the original workflow progresses, or an exact boundary and retained
recovery resources are reported. Green nodes alone are not completion.

## Finish

Inspect fresh native tracker/workflow facts and Git, then report:

- Each requested product task and the workflow are closed with native finality.
- The delivered target passes its configured checks; local and ordinary remote
  heads agree and the target includes all prerequisite changes.
- Exact owned temporary worktrees/branches and task writers are absent; unsafe
  or uncertain retained resources remain visible and prevent a cleanup claim.
- The live task graph reflects those facts, and the Operator has its URL.
- Repository state, commit, checks and remaining compatibility limits are named.

Use [acceptance evidence](../../docs/NATIVE-PRODUCT-RESULT.md) to understand the
qualified composition: primary live delivery and real alternate launch are
different claims. Current broad qualification, browser compatibility and full
alternate delivery are not automatically certified by importing this skill.

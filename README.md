# Gas City Dalph pack

Gas City schedules a dependency graph with bounded native worker sessions.
This pack delivers each task through an exact Git worktree, the configured
native harness, independent bounded review/fix, qualification, integration,
ordinary push and recoverable cleanup. A separate
read-only dashboard shows the DAG, frontier, and current work.

Gas City owns readiness, claims, and sessions. The pack supplies formulas and
executes one claimed step per session. The default limits are two workers and
one integrator. A successor depends on its prerequisite's **delivery**, so it
starts after integration and cleanup, rather than after a model response.

This is a pinned Linux prototype. A minimal configured-provider diamond has
survived interruption, integrated all four tasks and cleaned its owned worktrees.
Codex and Claude have demonstrated real launch/execution. Broad qualification,
Claude review/delivery and third admission under uncertain retained sessions
remain incomplete. Read [setup](docs/SETUP.md) before starting a fresh
city. New native runs use the launch/resume instructions there and the
[native maintenance boundaries](docs/NATIVE-MAINTENANCE.md). Use
[legacy recovery](docs/RECOVERY.md) for an older workflow.

## Start a native task

Prepare the pinned city and native contract through [setup](docs/SETUP.md).
Then run from this repository:

```sh
. trial/env.sh
mise exec node@24.20.0 -- node dist/native.js preflight
export DALPH_NATIVE_TASK='Describe a concrete change and its acceptance checks'
mise exec node@24.20.0 -- node dist/native.js launch
```

Retain the returned `workflow_id`. After a restart, use
`mise exec node@24.20.0 -- node dist/native.js resume <workflow-id>`.
Launch creates a new workflow; preflight and resume do not launch another root.
The independent native reviewer owns at most four semantic rounds. Infrastructure
failures retain their current round and exact recovery resources.

## Native four-task graph

Author a JSON object with four concrete instructions named `a`, `b`, `c`, and
`d`. The graph runs A first, B/C after A delivery, and D after both B/C
deliveries. Each instruction owns its files and states its acceptance checks.

```sh
. trial/env.sh
mise exec node@24.20.0 -- node dist/native.js launch-graph /absolute/path/instructions.json
```

Retain the returned `workflow_id`. Recover that same graph after interruption:

```sh
mise exec node@24.20.0 -- node dist/native.js resume-graph <workflow-id>
```

Gas City owns dispatch and review iterations. Resume reconciles retained launch,
attempt, Git and delivery identities before waking the city. It does not cook a
replacement graph. See [product graph boundaries](docs/PRODUCT-GRAPH.md).

Serve the dashboard with `pnpm dashboard:serve` and open
`http://HOST:43597/?city=CITY&scope=RIG&run=WORKFLOW_ID`. It shows four product
tasks with their dependency edges; selection exposes their execution phases.
Unproven delivery stays incomplete. The minimal live graph completed; combined
native acceptance is still incomplete and failed broad verification remains failed.

## Legacy four-task demo

This formula uses the retained `legacy-v1` adapter. The redesigned native
multi-task trial and its dashboard acceptance are tracked separately; do not
use this demo as evidence that the new native composition supports a diamond.

1. Clone this repository and prepare the exact dependencies and isolated city
   using [setup](docs/SETUP.md). Use `examples/expenses` as the demo's starting
   project. Done: the city and rig are registered, the target is clean and
   normally pushed to its remote, and the supervisor is reachable.
2. Source the trial environment in Bash, inspect the formula, then start one
   workflow:

   ```sh
   . trial/env.sh
   gc --city "$DALPH_CITY_ROOT" --rig "$DALPH_RIG" formula show expenses-export-diamond --json
   gc --city "$DALPH_CITY_ROOT" --rig "$DALPH_RIG" sling "$DALPH_RIG/dalph.worker" expenses-export-diamond --formula --json
   ```

   Retain the returned `workflow_id` and command response in your trial's
   `evidence/`. Done: the workflow exists and its first task is routed. Each new
   formula launch creates a new workflow; resume an existing run through
   [recovery](docs/RECOVERY.md).
3. Build and serve the graph page from this repository:

   ```sh
   mise exec node@24.20.0 -- pnpm dashboard:build
   mise exec node@24.20.0 -- pnpm dashboard:serve
   ```

   Open `http://HOST:43597/?city=CITY&scope=RIG&run=WORKFLOW_ID`, replacing the
   placeholders with the sourced city/rig names and returned workflow ID.
   Done: the page shows the formula title and DAG. Leave it open to observe
   automatic updates. See [dashboard](dashboard/README.md) for network setup,
   visual states, and delayed or unavailable data.
4. Observe delivery and finality. Done: fresh tracker reads show all workflow
   beads closed, the published target passes its acceptance tests, local and
   remote heads agree, and no task/candidate worktree, owned branch, or marked
   writer remains. Green active nodes alone are not completion.

The demo forks from a currency filter into CSV and JSON exports, then joins
those branches into one export API. Every work step specifies its owned files,
expected behavior, and acceptance tests in the formula. `examples/expenses`
contains the starting application fixture with formatting and report helpers.
The formula adds the export features to that fixture.

## Use your own project

Configure your native provider, model and reasoning settings in Gas City and
the selected harness before launching workers. The pack supplies no model or
reasoning override. Use a matching qualified harness/version/readiness contract;
missing capabilities fail visibly.

Set `DALPH_TRIAL_ROOT`, `DALPH_TARGET_REPO`, `DALPH_RIG`, `DALPH_CITY_NAME`,
`DALPH_CITY_ROOT`, `DALPH_TARGET_BRANCH`, and `DALPH_PROJECT_CONTRACT_PATH`
before sourcing `trial/env.sh`. Follow the native setup with your clean target,
normal remote and exact project check command. For a retained legacy workflow,
author a formula with work/delivery pairs using
`gc.run_target` (`dalph.worker` / `dalph.integrator`) and `dalph.phase`
(`work` / `deliver`); each pair shares a `dalph.task` identity. Successor work
steps depend on delivery steps. The project contract describes its build/test
and product requirements; this prototype currently qualifies with `pnpm test`.

Use an isolated city and worktree root per target project. The city template
keeps native health and lifecycle defaults and documents narrow destructive
maintenance exceptions. Diagnostic event archives expire after 30 days;
unfinished tracker/Git recovery records are preserved.

## Check or investigate

- **Quality:** [quality harness](docs/QUALITY.md) documents `pnpm check:fast`
  (60 seconds) and full `pnpm check all` (10 minutes),
  the 99% coverage floor, Effect diagnostics, source rules, and Hapsland.
- **Checks:** [setup](docs/SETUP.md#checks) names the focused pack, application,
  and browser commands, including prerequisites and skipped-check limits.
- **Recovery:** [recovery](docs/RECOVERY.md) explains custody, exact candidate
  reuse, native restart/wake, and evidence required before another attempt.
- **Platform reuse:** [primitive audit](docs/GASCITY-PRIMITIVES-AUDIT.md) records
  which Gas City mechanisms the prototype uses and which it still bypasses.
- **Acceptance:** [ACCEPTANCE.md](ACCEPTANCE.md) records the agreed chronology
  and authority boundaries; [trial results](docs/TRIAL-RESULTS.md) distinguish
  completed observations from untested portability and performance claims.

Generated binaries, credentials, tracker stores, worktrees, and model transcripts
stay in the isolated trial directory. They are not repository inputs.

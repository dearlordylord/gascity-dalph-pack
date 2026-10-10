# Gas City Dalph pack

Gas City schedules a dependency graph with bounded native worker sessions.
This pack delivers each task through an exact Git worktree, Codex **Luna max**,
qualification, integration, ordinary push, and recoverable cleanup. A separate
read-only dashboard shows the DAG, frontier, and current work.

Gas City owns readiness, claims, and sessions. The pack supplies formulas and
executes one claimed step per session. The default limits are two workers and
one integrator. A successor depends on its prerequisite's **delivery**, so it
starts after integration and cleanup, rather than after a model response.

This is a pinned Linux prototype. Completed live trials include operator
recovery from Beads timeouts; autonomous cold replay and low-latency dashboard
updates are not established. Read [setup](docs/SETUP.md) before starting a fresh
city, and [recovery](docs/RECOVERY.md) when a step stalls or an outcome is unknown.

## Start a four-task demo

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
contains the completed prior demo at commit `9a771700…`, before these exports;
it is a copyable application fixture, not a tracker database.

## Use your own project

Set `DALPH_TRIAL_ROOT`, `DALPH_TARGET_REPO`, `DALPH_RIG`, `DALPH_CITY_NAME`,
`DALPH_CITY_ROOT`, `DALPH_TARGET_BRANCH`, and `DALPH_PROJECT_CONTRACT_PATH`
before sourcing `trial/env.sh`. Follow the same setup with your clean target
and normal remote. Author a formula with work/delivery pairs using
`gc.run_target` (`dalph.worker` / `dalph.integrator`) and `dalph.phase`
(`work` / `deliver`); each pair shares a `dalph.task` identity. Successor work
steps depend on delivery steps. The project contract describes its build/test
and product requirements; this prototype currently qualifies with `pnpm test`.

Use an isolated city and worktree root per target project. This sample disables
maintenance orders in its city template; review that choice before adapting
it to a shared operational city.

## Check or investigate

- **Checks:** [setup](docs/SETUP.md#checks) names the focused pack, application,
  and browser commands, including prerequisites and skipped-check limits.
- **Recovery:** [recovery](docs/RECOVERY.md) explains custody, exact candidate
  reuse, native restart/wake, and evidence required before another attempt.
- **Acceptance:** [ACCEPTANCE.md](ACCEPTANCE.md) records the agreed chronology
  and authority boundaries; [trial results](docs/TRIAL-RESULTS.md) distinguish
  completed observations from untested portability and performance claims.

Generated binaries, credentials, tracker stores, worktrees, and model transcripts
stay in the isolated trial directory. They are not repository inputs.

# Serve the task graph

This read-only interface reuses Dalph's Cytoscape/Dagre renderer and reads
Gas City's run-detail API through Effect HTTP. The supervisor remains the
source of graph nodes, relationships, readiness, execution observations,
and terminality.

## Start and open

From the prepared pack directory:

```sh
. trial/env.sh
mise exec node@24.20.0 -- pnpm dashboard:build
mise exec node@24.20.0 -- pnpm dashboard:serve
```

Open `http://HOST:43597/?city=CITY&scope=RIG&run=WORKFLOW_ID`.
Use the native city name, rig name, and the workflow ID returned at launch.
The explicit rig scope avoids the slow ambiguous lookup observed in the trial.
Done: the formula title and branched dependency graph appear.

The server listens on `0.0.0.0:43597`. The browser makes same-origin API calls;
the server forwards them to `DALPH_TRACKER_ENDPOINT`, default
`http://127.0.0.1:8372`. That loopback is on the server, not the viewer's host.
Serve a different port/upstream with:

```sh
DALPH_DASHBOARD_PORT=43597 DALPH_TRACKER_ENDPOINT=http://127.0.0.1:8372 \
  mise exec node@24.20.0 -- pnpm dashboard:serve
```

An optional `native=http://HOST:NATIVE_PORT` query adds a drill-through link to
an already reachable native dashboard. The pack server serves its own page;
it does not expose the native dashboard on another port. Bind/firewall access
belongs to the deployment; this sample is for the isolated trusted trial host.

## Read the graph

The graph fills the viewport, supports pan/zoom, task selection, and Fit graph.
Graph summary starts collapsed and provides accessible task/relationship lists.
Prerequisites show arrows between product tasks. Pack formula identities
`TASK-work` and `TASK-deliver` form one task box; its current phase appears
inside that box. Four tasks therefore produce four boxes and four fork/join
arrows, even though Gas City retains separate work and delivery beads.
Internal phase edges, formula grouping, the run container and workflow-finalize
are excluded from the canvas. The header reports native run terminality.

- **Frontier:** tasks whose current phase is supervisor `ready`, with blue borders. Root readiness is
  excluded from task readiness.
- **Current work:** tasks whose current phase is supervisor `running`/`active`, with a double border.
  Green with a double border means active; completed green nodes have an
  ordinary border and a completed label.
- **Selected task:** prerequisites and execution observations appear beside
  the graph. Both phases retain their execution observations under the selected
  task. Raw observations are available under a collapsed detail.

Work completion alone never produces the delivered task color or increments
the completed task count; the delivery phase must complete.

These encodings display observations; they do not independently prove process
custody or accept task completion. See [finality](../docs/RECOVERY.md#completion)
for authoritative checks.

## Delayed data

One HTTP request runs at a time, with a 60-second timeout and a 15-second pause
**after its response**. Keep the page open; reload is not needed for updates.
A failed refresh retains the last graph, marks it stale, and displays the error.
A successful response may itself contain delayed native projection data:
`Live` means the request succeeded, not that every upstream event has arrived.

The trial observed a running tracker task while the API still returned all
nodes pending, and a closed tracker graph before API terminality caught up.
Native provider-health fan-out could delay requests by tens of seconds or
more. Compare fresh tracker reads with API data before restarting execution;
see [recovery](../docs/RECOVERY.md). The UI owns no scheduler or persisted
workflow state.

## Check changes

`pnpm dashboard:test` covers fork/join projection, readiness encoding, and
task aggregation and delivery-gated completion. `pnpm dashboard:build` bundles the browser entrypoint.
With Chromium installed and the server running, `pnpm dashboard:test:browser`
covers four task boxes, selection/prerequisites, fit, initially collapsed summary,
stale data retention after API failure, and a narrow viewport. It uses a
retained native fixture and controlled transport responses. Live execution and
host-facing request evidence are reported separately in
[trial results](../docs/TRIAL-RESULTS.md).

Execution crashes/retries are outside this GET-only UI boundary. Later native
observations show their results without starting another attempt. Vendor
provenance and the small viewport adjustment are recorded in
[vendor/ORIGIN.md](vendor/ORIGIN.md).

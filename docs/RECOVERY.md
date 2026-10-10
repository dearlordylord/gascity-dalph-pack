# Recover an existing run

The operator resumes the existing native workflow after inspecting the failed
boundary. Preserve the returned workflow ID and task mapping; instantiate a
formula once per new run. `formula cook` materializes an inspectable graph;
`gc sling TARGET FORMULA --formula` also routes a new workflow. Cooking an
additional graph is not recovery.

## Observe before continuing

1. Read fresh tracker status and native sessions:

   ```sh
   . trial/env.sh
   bd -C "$DALPH_TARGET_REPO" show TASK_ID --json
   gc --city "$DALPH_CITY_ROOT" session list --json
   gc --city "$DALPH_CITY_ROOT" graph WORKFLOW_ID --json
   ```

   Read the exact task's `dalph.*` metadata, `evidence/sessions/SESSION_ID.log`,
   and the corresponding `evidence/boundaries/*.json`, `.stdout`, `.stderr`.
   Done: identify the failed command or child stage, its intent, observed exit,
   and whether stopped writers are proved. A live handle alone is not progress.
2. Diagnose the failed boundary with one focused read/check. Preparation or
   tracker reads can fail before tests start. Run the test directly only if
   the failed child was a test. Done: the discriminating check passes, or the
   competing causes and next observation are recorded. After two attempts
   without new evidence, change the experiment rather than restarting broadly.
3. Let native reconciliation release a dead session's claim before routing its
   existing task again. Use `gc ... session wake SESSION_ID --json` to request
   wake; confirm it actually starts or returns the task to the ready queue.
   If the task is freshly ready after reconciliation, an operator may use
   `gc ... --rig "$DALPH_RIG" sling "$DALPH_RIG/dalph.worker" TASK_ID --json`
   (or `dalph.integrator` for delivery). Done: the resumed step retains its
   original attempt, Base, and owned worktree; there is no second active owner.
   A successful routing/wake response alone does not prove execution.

Start a stopped city with `gc --city "$DALPH_CITY_ROOT" start`; this also
registers it. Starting a supervisor alone does not register a removed city.
Abrupt coordinator loss can leave native tmux execution running: preserve it
and reconcile its exact process observations before launching another writer.
Stop the city and sessions explicitly with `gc --city "$DALPH_CITY_ROOT" stop`.

## Custody and publication

The pack records an immutable attempt, Base SHA, branch, and path before native
`gc worktree ensure`. Existing preparation is verified; a lost prepared
worktree is refused rather than recreated. Model and qualification intents
precede processes, and known exits plus fresh `/proc` stopped-writer observations
precede acceptance. Unknown same-user liveness retains custody. Each attempt
has at most three retained model/check ordinals; exhaustion stays visible for
an operator decision. Earlier intents and observations remain available.

Models have a 600-second budget; qualification has 90 seconds. CLI boundaries
retain process-group custody and fsynced receipts. An escaped descendant keeps
recovery and cleanup blocked until its marker proves stopped. These records
are workflow/process evidence, not replacements for tracker or Git authority.

The integrator makes a candidate with exact ordered parents
`[current target, accepted result]` and qualifies that commit. A push intent
precedes an ordinary push; recovery checks remote ancestry before repeating
an ambiguous publication. Promotion is fast-forward on the clean target.
Native cleanup uses original provenance and Base, proves stopped writers,
and compare-deletes the exact owned branch. It preserves dirty, foreign, or
ambiguous resources. Delivery closes after both owned worktrees are cleaned;
tracker dependencies then release successors. Git lock waiting is bounded.

## Completion

Close the outcome only when fresh tracker reads show every workflow bead
closed, published acceptance tests pass, local/remote heads agree, and exact
owned worktrees, branches, and marked writers are absent. Account for every
retained unsafe resource or unfinished command. Dashboard status is a view;
its upstream projection may lag tracker facts. See
[dashboard troubleshooting](../dashboard/README.md#delayed-data) when the code
is delivered but the page is still pending or active.

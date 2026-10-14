# Local quality gate

The pack maintainer chooses verification for the changed product boundary.
`pnpm check:fast` and `pnpm check all` are available broad checks; neither is
mandatory for every edit or handoff. `pnpm check` defaults to the fast command.
CI is intentionally absent.

## Cost limit

- Cap each verification-infrastructure problem at **30 minutes total and two
  attempts**, including diagnosis, edits, review, preparation, and command
  waiting across turns, sessions, and agents. Full runs and timeouts count.
  Renaming or committing never resets limits; already-overbudget work is
  exhausted. Record elapsed time, attempts, and deadline in existing evidence.
- Run a focused check first; retry only after new causal evidence or repair.
  At either cap, stop safely, reconcile custody, complete required cleanup even
  over cap, and preserve fences and evidence. Defer infrastructure repair;
  **continue product work this turn without awaiting approval**.
- Product defects block affected claims; unknowns are not harmless. Remove
  verification-only dependencies within authorized scope; retain actual product
  dependencies. Use the smallest direct proof through existing public tools for
  the same behavior. Never rebuild the exhausted harness, weaken tests, or imply
  unrun checks passed.
- Product proof covers graph, recovery, integration, ticket closure, owned
  cleanup, and live UI. If one boundary is unavailable, pursue other ready
  product work; only genuine external dependencies block everything.
- Further infrastructure repair requires separate explicit user choice; never
  make that choice prerequisite. Broad checks are optional per edit/handoff.

## Available commands

Prepare the pinned dependencies and native Gas City binary as described in
[setup](SETUP.md), then run:

```sh
. trial/env.sh
mise exec node@24.20.0 -- pnpm install --frozen-lockfile
mise exec node@24.20.0 -- pnpm check:fast
```

Both gates qualify dependencies and build first, then run independent static
checks with concurrency two. Coverage, example checks and native acceptance
follow in order. A failure interrupts sibling checks. One deadline covers
the entire cycle: 60 seconds for fast, 600 seconds for full. Expiry interrupts
the owned child process group; it never counts as a pass. Stage output streams
live and each completed stage reports its elapsed time.

Fast runs every static check, controlled tests with 99% coverage of every
production source file, and example checks. Controlled tests use at most four
Vitest workers; this changes only test scheduling, not Dalph runtime behavior.
Vitest persists source-keyed module transformations between runs. Every test
and coverage measurement still executes; test outcomes are never reused.
Short verification CLIs compile their current TypeScript entry with esbuild
before execution, avoiding repeated tsx module-loading overhead. Their ignored
JavaScript bundles are build outputs; every invocation executes the verifier.
Full adds the real Gas City
acceptance suite, with at most two file workers. Every test owns its city,
supervisor home, tracker database, tmux socket
directory, API port, target Git repository and retained evidence. The current
suite has ten cases; tests within each file run sequentially. This limit governs
qualification fixtures; application concurrency is unchanged.
Native scenarios remain
unchanged in `vitest.native.config.ts`; they are not part of routine fast runs.
Native city fixtures enable Gas City's `GC_BD_TRACE_JSON` in their own retained
root. Its `native-beads-trace.jsonl` records native Beads command durations and
call sites for focused latency diagnosis. This fixture observation does not
change pack runtime behavior, scenario assertions or production configuration.
Clean-delivery and review-settlement tests poll their final state every five
seconds. Each observation still reads the native authority freshly; the existing
deadlines and final assertions remain unchanged. This reduces fixture read load
without changing runtime admission or claim timing.
Retain each full result and diagnose its failed boundary through focused checks
before another full run. A timeout ceiling is not evidence
that the full suite successfully finishes inside it. Preparation or missing
native tools are environment failures and do not count as qualification.

Individual native acceptance tests also have a ceiling of ten minutes or less,
including review exhaustion and continuation. These local ceilings do not add
time to the full gate: its one shared deadline still covers all fixtures and
stages. A fixture timeout fails acceptance; no scenario or assertion is skipped.

Full admission retains `.quality/full-incomplete.json` until all stages complete
successfully and appends its start to `.quality/full-starts.jsonl`. There is no
calendar-day admission limit; historical daily records do not block a new run.
Failure or timeout leaves this fence: killing the test process does not prove
that detached native cities stopped. Preserve fixture logs, stop the exact owned
cities and their supervisors through public Gas City commands, and reconcile
their retained custody before removing the fence. Preserve the start history.
Fast checks remain available; no blind full retry occurs.

`test/quality/gate.test.ts` exercises cumulative deadlines, interruption
finalizers, retained fences and same-day admission after success or reconciled
failure using controlled command ports, isolated temporary directories
and TestClock. These tests run inside fast and launch no native cities or full
quality subprocesses. Real command-group interruption remains covered by
`test/quality/command.test.ts`; neither test establishes detached native writer
shutdown or a successful full native acceptance duration.

## Included checks

| Boundary | Check |
| --- | --- |
| Dependencies | Exact compatible Effect 4 / platform-node / Vitest / TSGo cohort; rejects legacy platform packages |
| Compilation | Strict TypeScript 7, exact optional properties, unchecked indexing, unused locals, override and switch checks |
| Effect usage | Effect diagnostics fail on both errors and warnings |
| Source rules | Type-aware Oxlint; no explicit any, floating promises, double casts, unchecked assertions, direct clocks, global mocks or console logging |
| Architecture | Schema-derived domain boundary types; canonical Effect Schema import; shared branded nonnegative integers; ordered destructuring |
| Formatting | dprint/Oxc and EditorConfig |
| Size | Production files at most 420 nonblank/noncomment lines; source function complexity at most 8 |
| Duplication | jscpd, maximum 2% duplicated source lines |
| Dependency graph | dpdm rejects circular source imports |
| Tests | Vitest and @effect/vitest; dependency substitution through layers or explicit ports; fast-check in separate property test files |
| Coverage | V8 minimum 99% independently for statements, branches, functions and lines |
| Native resources | Real Linux child processes, custody reconciliation, OS flock and Gas City worktree/Git refusal and recovery fixtures |
| Example target | Separate strict source typecheck, 47 CLI/application tests and an independent CLI product oracle |
| Commit | Husky builds the lint plugin, runs lint-staged and typecheck, then scans staged changes with gitleaks |

Coverage includes every `src/**/*.ts` file: delivery logic, native adapters,
domain schemas, graph projection, HTTP server and quality helpers. There are no
file exclusions, ignored branches or ratchet baselines. Startup scripts and the
DOM renderer have separate type/lint checks; browser acceptance validates the
renderer. The copyable example is a separate target application and has its own
checks; its tests are not counted toward pack coverage.

Maintained code is TypeScript. Browser and runtime JavaScript bundles are
ignored build outputs, generated with esbuild. No Python runtime is required.
Browser acceptance requires Chromium, its host dependencies and a running pack
server:

```sh
mise exec node@24.20.0 -- pnpm exec playwright install --with-deps chromium
mise exec node@24.20.0 -- pnpm dashboard:serve
# In another prepared shell:
mise exec node@24.20.0 -- pnpm dashboard:test:browser
```

## Hapsland

The project configuration selects maintained TypeScript for the installed
Hapsland agent hooks and inherits the user's semantic review policy. Credentials,
provider responses and local Hapsland state stay outside Git.

```sh
hapsland --version
hapsland doctor codex
hapsland rules check --path src/domain/candidate.ts --line 4
```

A doctor result checks installation readiness; it does not establish that a
semantic review ran. During this migration the installed executable reported
0.1.0, an explicit declaration review returned `evaluated` with one real request,
and Codex hooks delivered findings on command duration ownership and process
observation dependencies. Both findings were addressed. A skipped declaration
is not review evidence, and a successful review is not a claim about the
reviewer's accuracy.

The hook and credential configuration belongs to the developer's Hapsland
installation, not this pack. Use that installation's Codex setup and trust
workflow on another machine. Native installation details are owned by the
Hapsland project (`../jev` in the development workspace).

## Acceptance evidence

The TypeScript tests preserve the delivery and recovery contract in
[ACCEPTANCE.md](../ACCEPTANCE.md):

- Delivery/finality: `test/workflow.test.ts` verifies qualification, publication,
  promotion, cleanup and observed closure, including refusal paths.
- Publication ambiguity: the same suite reuses the retained candidate after a
  lost push observation, without another push or model invocation.
- Custody and loss: `test/native-command.test.ts`,
  `test/process-observation.test.ts` and `test/command-slot.test.ts` fence live or
  unknown writers, reconcile missing exits and enforce the finite command budget.
- Exact cleanup: `test/native-worktree.test.ts` checks real Git resources,
  foreign/stale ownership, dirty/unmerged trees, changed target Base and lost
  cleanup responses. `test/git-guard.test.ts` checks real OS serialization.
- Graph display: `test/dashboard.test.ts` and `dashboard/browser.test.ts` cover
  fork/join, frontier, task aggregation, delivery-gated completion, selection,
  collapsed summary and stale retention.

Native graph admission, coordinator restart with a live provider and the repair
graft remain owned by Gas City and the historical live trials. Controlled
TypeScript tests do not establish a new Luna provider run or autonomous cold
replay. [Trial results](TRIAL-RESULTS.md) retain the prior implementation's live
observations; the language migration does not relabel them as new live evidence.

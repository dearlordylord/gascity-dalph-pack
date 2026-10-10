# Prepare an isolated city

Use Bash on Linux. The prototype uses `/proc`, process groups, cooperative Git
locks, tmux, a direct local Beads/Dolt store, and a loopback supervisor. Other
platforms and newer dependency revisions need their own qualification.

## Dependencies

Use `git`, `mise`, `pnpm`, Python 3.11+, `jq`, `tmux`, `lsof`, and an authenticated
Codex CLI. These are the versions used by the completed trials:

| Component | Trial input |
| --- | --- |
| Gas City | `8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a` |
| Bundled core/BD packs | `e38ce9cc55d15fa351199c042f0d07aba1a347af` |
| Beads | `1b7bf9b1910d8ecec3f461f70f478314b654eaa6` |
| Dolt | `2.4.2` |
| Go | `1.27.2` |
| Node / pnpm | `24.20.0` / `10.28.2` |
| Codex CLI | `0.162.1`, with access to `gpt-6-luna` |
| tmux | `3.3a` |

`pnpm-lock.yaml` owns the exact JavaScript dependency graph. Beads release
1.3.1 lacks the four conditional `--if-revision` verbs required here; use the
pinned source build. The sample keeps conditional writes and guarded release
at `require`. Its `native_transport="off"` selects the supported CLI transport:
the trial's native preflight could not confirm project ID in this direct-Dolt
setup. Stock release binaries have not been qualified for this prototype.

Set the workspace outside the cloned pack; each city gets its own registry,
tracker data, evidence, and worktree root:

```sh
export DALPH_TRIAL_ROOT=/absolute/path/to/dalph-trial
. trial/env.sh
mkdir -p "$DALPH_TRIAL_ROOT"/{bin,sources,evidence,worktrees,tmux,gc-home}
```

Build the pinned sources into the trial's `bin/`:

```sh
git clone https://github.com/gastownhall/gascity.git "$DALPH_TRIAL_ROOT/sources/gascity"
git -C "$DALPH_TRIAL_ROOT/sources/gascity" checkout 8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a
(cd "$DALPH_TRIAL_ROOT/sources/gascity" && mise exec go@1.27.2 -- go build -o "$DALPH_TRIAL_ROOT/bin/gc" ./cmd/gc)
git clone https://github.com/gastownhall/beads.git "$DALPH_TRIAL_ROOT/sources/beads"
git -C "$DALPH_TRIAL_ROOT/sources/beads" checkout 1b7bf9b1910d8ecec3f461f70f478314b654eaa6
(cd "$DALPH_TRIAL_ROOT/sources/beads" && CGO_ENABLED=0 mise exec go@1.27.2 -- go build -tags gms_pure_go -ldflags '-X main.Build=1b7bf9b1910d8ecec3f461f70f478314b654eaa6' -o "$DALPH_TRIAL_ROOT/bin/bd" ./cmd/bd)
```

Install Dolt 2.4.2 from its [release](https://github.com/dolthub/dolt/releases/tag/v2.4.2)
and make `dolt` available on PATH. Check `gc version`, `bd version`,
`dolt version`, and `codex --version`. Verify the pinned Beads conditional
update/claim/release/close verbs in its help. Done: the exact binaries resolve
from this shell, and Codex is authenticated. Native GC core/BD packs are imported
by city initialization; compare their selected revision with the table before
crediting a reproduction of the original trial.

## Target and city

For the four-task export demo, copy the completed example into a new target
repository. For the original seven-task implementation, use `trial/seed/`
instead. The examples are starting snapshots; each fresh run gets a new target.

```sh
mkdir -p "$DALPH_TARGET_REPO"
cp -a examples/expenses/. "$DALPH_TARGET_REPO/"
git -C "$DALPH_TARGET_REPO" init -b "$DALPH_TARGET_BRANCH"
git -C "$DALPH_TARGET_REPO" config user.name 'Dalph Trial'
git -C "$DALPH_TARGET_REPO" config user.email 'dalph-trial@local'
git -C "$DALPH_TARGET_REPO" add .
git -C "$DALPH_TARGET_REPO" commit -m 'seed expenses example'
git init --bare "$DALPH_TRIAL_ROOT/expenses-remote.git"
git -C "$DALPH_TARGET_REPO" remote add origin "$DALPH_TRIAL_ROOT/expenses-remote.git"
git -C "$DALPH_TARGET_REPO" push -u origin "$DALPH_TARGET_BRANCH"
mise exec node@24.20.0 -- pnpm install --frozen-lockfile
dolt config --global --add user.name 'Dalph Trial'
dolt config --global --add user.email 'dalph-trial@local'
python3 trial/render-city.py > "$DALPH_TRIAL_ROOT/city.generated.toml"
gc init "$DALPH_CITY_ROOT" --file "$DALPH_TRIAL_ROOT/city.generated.toml" --beads-target local --beads-transport direct --no-start --skip-provider-readiness
gc --city "$DALPH_CITY_ROOT" start
```

The sourced `DOLT_ROOT_PATH` confines Dolt identity to this trial. `GC_HOME`
isolates the supervisor registry; `TMUX_TMPDIR` isolates native session state.
Codex uses your existing authenticated environment. The template contains
machine-path placeholders: pass the rendered file, not the template, to init.

Inspect `gc --city "$DALPH_CITY_ROOT" rig list --json`. If the target rig is
absent, register it:

```sh
gc --city "$DALPH_CITY_ROOT" rig add "$DALPH_TARGET_REPO" --name "$DALPH_RIG" --prefix ex --default-branch "$DALPH_TARGET_BRANCH" --include "dalph=$DALPH_PACK_ROOT"
```

Keep `.beads/` and `.gc/` data on disk and outside target commits. Normally push
any setup commit before beginning task attempts. Inspect the generated config,
run `gc lint "$DALPH_PACK_ROOT"`, and confirm the supervisor is reachable at
`DALPH_TRACKER_ENDPOINT`. The city name must match `DALPH_CITY_NAME` because
tracker writes address that exact native city. Done: registered city and rig,
clean target, matching local/remote target heads, and reachable supervisor.
Return to [README](../README.md#start-a-four-task-demo) to launch the workflow.

For a retained older store, use `bd migrate schema --help` to inspect its exact
owned database before migration. The pinned fresh trial used schema 69;
existing shared stores require an explicit migration decision.

## Checks

Run from the pack with the prepared environment:

```sh
. trial/env.sh
mise exec node@24.20.0 -- pnpm test
mise exec node@24.20.0 -- pnpm dashboard:test
mise exec node@24.20.0 -- pnpm dashboard:build
```

Pack tests cover protocol, actual child custody, the Effect HTTP boundary, and
native worktree refusal/idempotence. Native worktree tests skip when `gc` is
absent; a skip supplies no native coverage. Application checks run in the
example or actual published target with `mise exec node@24.20.0 -- pnpm test`.

For browser changes, install Chromium with
`mise exec node@24.20.0 -- pnpm exec playwright install --with-deps chromium`,
start the pack dashboard in another shell, then run
`mise exec node@24.20.0 -- pnpm dashboard:test:browser`.
Set `DALPH_DASHBOARD_URL` when the server uses a different address or port.
The browser test intercepts API reads with a retained fork/join fixture and a
controlled failure; it proves rendering and stale-state behavior, not live
execution. Live provider, recovery, and finality evidence remain separate.

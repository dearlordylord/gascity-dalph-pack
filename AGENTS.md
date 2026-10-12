# Working in the pack

Use pnpm and the pinned Node through mise. In fresh worktrees with absent
dependencies, run `mise exec -- pnpm install --frozen-lockfile` before checks. Source `trial/env.sh` only when a
native Gas City boundary is required. Gas City owns tracker state and claims;
Git owns commits and worktrees; the execution substrate owns writer liveness.
Preserve the accepted scenarios in [ACCEPTANCE.md](ACCEPTANCE.md).

Write maintained code, tests, and tooling in TypeScript. Use idiomatic Effect,
typed errors, Schema-owned boundary payloads, Config at startup, scoped services,
Effect HTTP, and injected clocks. Supply test dependencies through layers or
ports. Put property tests in `*.property.test.ts`.

During implementation and handoff use `pnpm check:fast`: the entire cycle has a
60-second deadline, including static checks and 99% coverage of all production
source. Run the full `pnpm check all` at most once per calendar day; its entire
cycle, including native city acceptance, has a ten-minute deadline. Retain that
day's result and diagnose failures with fast checks; do not repeat the full run.
Treat limits as design constraints rather than suppressing diagnostics. Preserve
native acceptance scenarios in the daily stage. See [quality](docs/QUALITY.md).

Hapsland reviews selected TypeScript source through the installed agent hooks.
Use `hapsland doctor codex` to diagnose local readiness and `hapsland rules check`
for an explicit supported declaration review. A skip or ready installation is
not evidence of a completed review. Source-bearing responses and credentials
stay outside Git. CI is intentionally absent.

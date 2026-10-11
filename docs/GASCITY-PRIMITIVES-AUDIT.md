# Gas City primitive audit

Observed 2026-10-11. Research only; this document does not change the runtime.
The local Gas City checkout is pinned at
`8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a`. Findings below distinguish
existing platform mechanisms from optional pack policy. Upstream main was also
read through official GitHub sources; availability is established from the
pinned checkout rather than assuming current documentation matches a release.

## Boundaries that the pack bypasses

| Boundary | Current pack | Available native mechanism | Assessment |
| --- | --- | --- | --- |
| Agent execution | Agent `start_command` starts our script; `src/delivery/stages.ts` directly launches `codex exec`. | Harness `provider`, provider presets/options, prompt rendering and session launch. | Confirmed bypass: the provider configured in Gas City does not choose the nested model executable. Removing model flags did not fix this. |
| Review and fix rounds | `src/delivery/workflow.ts` asks the same implementation call to review and fix itself. | Formula check/convergence with bounded iterations, independent review roles, synthesis and fix children. | Missing reusable native bounded review workflow; model retry count is a different budget. |
| Qualification and retry control | `stages.ts` and `command-slot.ts` keep qualification inside one wrapper turn and impose three command ordinals. | Formula `check`/`retry`, retained control beads, check timeouts and explicit exhaustion. | Native control flow is unused here. Move the checks and semantic retry decisions into the formula; ambiguous external effects still need reconciliation before any retry. |
| Tracker reads | `src/delivery/tracker.ts` runs `bd -C ... show`. | `gc beads show/list/metadata-cas`, scoped through the configured provider. | Confirmed provider coupling. Claims already use `gc hook --claim`; do not replace that native owner. |
| Recoverable agent session | GC supervises the outer one-shot script, while the script owns its nested model command and process receipts. | Provider resume command and runtime/session lifecycle, recovery of assigned work, durable convergence reconciliation. | GC can recover the wrapper, but nested model execution does not become a native harness session. Local stopped-writer evidence still serves a distinct purpose; session existence alone does not prove child writers stopped. |
| Maintenance | `trial/city.toml` suspends `bd.dog`, disables native bead transport and skips health, orphan, branch, reaper and compaction orders. | Native transport `auto`, configured orders and supervisory maintenance. | Trial overrides suppress useful platform services. Restore selectively with ownership/safety checks, not by blindly enabling every order. |

Native execution is configurable along independent harness, model, upstream,
transport and runtime axes. The pinned guide documents headless `subprocess`,
tmux, SSH, Kubernetes and exec runtime backends. ACP requires a compatible
harness; it is not a universal replacement for every CLI. These choices should
remain operator configuration rather than being hidden behind our nested Codex
command. [Official execution guide](https://github.com/gastownhall/gascity/blob/main/docs/guides/configuring-an-agent.md).
Pinned owners: `docs/guides/configuring-an-agent.md`,
`docs/reference/config.md` (`start_command`, `work_query`, `native_transport`).

The pinned formula guide already shows an orchestrator-owned review expansion:
parallel acceptance, test-evidence and simplicity reviews, then synthesis and
fixes, with an exec verdict gate and `max_attempts = 6`. The loop repeats the
subtree rather than merely rerunning one implementation command. Current
official pack main publishes the corresponding reusable
[build-basic-review formula](https://github.com/gastownhall/gascity-packs/blob/main/gascity/formulas/build-basic-review.formula.toml).
The external pack version has not been pinned or executed in this audit;
compatibility and required role/scripts must be checked before importing it.
Pinned owners: `docs/guides/understanding-formulas.md` (Multi-Lane Review Loops),
`internal/convergence/handler.go`, `internal/convergence/reconcile.go`.

The pinned [formula specification](https://github.com/gastownhall/gascity/blob/8fd6aa25ce73b3e8cf0c1e092e8a14ab00b4c15a/docs/reference/specs/formula-spec-v2.md)
also provides check-script timeouts and separate semantic/infrastructure budgets.
Our worker instead runs a fixed `pnpm test` command with a fixed timeout. This
restricts the reusable pack to one qualification command and makes native run
observations less granular. Check and retry constructs have different contracts;
neither should be added around an uncertain push without preserving read-back
reconciliation.

## Existing reuse and limits of replacement

**Worktree creation and removal already use Gas City.**
`src/delivery/worktrees.ts` calls native `gc worktree ensure/verify/cleanup`.
The pinned native implementation binds repository, branch, base SHA,
bead/store identity, owner, generation and exact provisioning attempt. Cleanup
can return `cleanup_pending` and refuses unsafe deletion. Our extra
stopped-writer and moved-branch checks must not be discarded merely because
native provisioning is available. No finding says the pack reinvented all
worktree management. Pinned owners: `cmd/gc/cmd_worktree.go`,
`internal/worktree`, `docs/reference/cli.md` (gc worktree). Current
[official CLI reference](https://github.com/gastownhall/gascity/blob/main/docs/reference/cli.md)
also exposes the commands. The older `gastown-command-map.md` claim that no
generic `gc worktree` namespace exists is stale relative to actual pinned code.

**Frontier scheduling, routing and bounded worker pools already use Gas City.**
The worker/integrator pools are two and one respectively, formula `needs`
edges determine readiness, and `gc hook --claim` selects work. This is not a
manual per-task routing implementation. Native recovery queries prioritize
in-progress work assigned to the session before ready work; provider launches
and formula decomposition should preserve those authorities.
Pinned owners: `docs/reference/config.md` (`work_query`),
`docs/reference/cli.md` (gc hook), `docs/reference/specs/formula-spec-v2.md`.

One smaller protocol gap remains: our `run` decoder accepts only the hook's
`action = "work"` response. Native hook discovery/claim can report no work or
drain; the wrapper treats that normal quiescence as a failed command rather than
an intentional idle outcome. This does not replace native claims, but it loses
their lifecycle meaning. Pinned owner: `docs/reference/cli.md` (gc hook).

**Local process and evidence custody needs a separate migration decision.**
The parent code audit found that `src/delivery/command.ts` records even read
commands in fsynced nonce receipts and scans retained boundary evidence during
reconciliation, without retention. Its `/proc` marker census and local Codex
permission flags couple execution to the local host. Native session
logs/wait/kill/resume can replace some operational plumbing, but this audit did
not establish an equivalent proof for escaped descendant writers, exact
candidate custody, or ambiguous external mutations. Neither deleting the
receipts nor treating a dead native session as proof of stopped writers is
justified by the current evidence. Pinned owner: `docs/reference/cli.md`
(gc session, gc runtime, gc wait).

**Integration policy is reusable pack functionality, not a generic core merge
queue API.** Our workflow manually constructs candidates, qualifies them,
pushes, promotes and closes delivery beads. The official Gastown pack has
refinery behavior; the pinned command map explicitly locates merge-queue
behavior in packs and formulas. This is an opportunity to compose/reuse pack
policy, not evidence that a missing `gc merge` primitive would do everything.
Inspect the refinery contract before replacing our exact-candidate delivery
semantics. Pinned owners: `docs/reference/gastown-command-map.md`,
`docs/guides/gastown-config-recipes.md`.
[Official pack source](https://github.com/gastownhall/gascity-packs).

## Recommended order

1. Make implementation and reviewer calls native configured harness sessions;
   retain deterministic preparation, qualification and cleanup as script steps.
2. Represent bounded review/fix cycles in formulas/convergence, with explicit
   exhaustion and operator outcomes, instead of a prompt-only self-review.
3. Route tracker reads through the native provider and review trial-only
   maintenance overrides against actual retained ownership evidence.
4. Compare official integration/refinery policy with our candidate contract
   before selecting reuse. Keep the separate task graph UI: it is an intentional
   product projection, not a replacement scheduler.

No new live run, publishing action or runtime migration was performed for this
audit. Native capability is established by source; end-to-end compatibility of
a redesigned pack remains unqualified.

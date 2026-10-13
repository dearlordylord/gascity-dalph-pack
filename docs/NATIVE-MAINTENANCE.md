# Native maintenance boundaries

The Operator uses the rendered city configuration for production. Gas City owns
health, claim reconciliation, session lifecycle and maintenance dispatch. The
pack does not run an additional general resource cleaner.

## Restored defaults

The deterministic `native-prepare`, `native-review-prepare`, `native-qualifier`
and `native-integrator` roles use Gas City's default work queries, including
assigned-work crash recovery. They no longer replace that contract with an
unassigned-only query. Native scale checks remain unchanged for every role.
Interactive worker/reviewer queries retain only the necessary workspace
discovery boundary described in [acceptance](../ACCEPTANCE.md).

These former skips are removed: `beads-health`, `dolt-health`,
`mol-dog-doctor`, `mol-dog-phantom-db`, `cascade-nudge-on-blocker-close`,
`cross-rig-deps`, `gate-sweep`, `notify-on-human-gate-creation`,
`nudge-mail-sweep`, `nudge-on-route`, `order-tracking-sweep`, `orphan-sweep`,
`renudge-stale-human-gates` and `spawn-storm-detect`. Native dispatch and guards
remain authoritative. Health checks observe tracker/Dolt readiness; doctor and
phantom checks report without removing databases. Orphan reconciliation uses
fresh native session inventory. Order tracking maintenance removes its own
expired dispatch history, rather than product attempt/review records.

The template no longer suspends `bd.dog` globally. It also removes the
`native_transport="off"` override: the pinned native `auto` default chooses
transport. Missing required conditional writes or guarded release still refuses
pack admission; there is no direct Beads fallback.

## Narrow retained exceptions

| Order | Reason retained in the installation template |
| --- | --- |
| `dolt-remotes-patrol` | Database remote publication needs explicit operator-owned destinations and credentials. Git delivery does not authorize database replication. |
| `jsonl-export` | Export destinations and retention are deployment choices; the pack does not invent an archival destination. |
| `mol-dog-backup` | Database backup needs an explicit durable destination and retention contract. |
| `mol-dog-compactor` | Database-history compaction is separate from task delivery and lacks an accepted retained-run safety proof. |
| `mol-dog-stale-db` | Age-based database/process cleanup is not proof that a database is unused by retained or foreign work. |
| `prune-branches` | Native `gc/*` pruning has remote-absence paths not qualified for legacy/foreign ownership. Dalph cleans its own exact disposition-typed branches during delivery. |
| `reaper` | Closed native review/session facts may still be needed by an unfinished delivery or human continuation. |
| `wisp-compact` | Closed child records can remain recovery evidence for unfinished parents; age alone does not authorize deletion. |

Daemon graph/session collection remains at its native disabled default: the
template does not set `wisp_gc_interval` together with `wisp_ttl`. At the pinned
revision, enabling it also purges closed infra session rows after a separate
72-hour default. Metadata references from retained proposals/verdicts do not
protect those rows. A closed failed graph can likewise still await human
continuation. Increasing TTL only delays this loss and is not a safety proof.
These tracker records therefore remain retained; their physical storage is not
claimed bounded by this slice. Operators must not enable these collectors on
retained Dalph work without a separately qualified ownership/retention policy.

## Bounded diagnostics

Supported `[events.rotation]` rotates the active event file at 256 MiB and removes
archives older than 720 hours (30 days). Native record/time checks permit a
temporary size overshoot. This bounds diagnostic age and active-file size, not
total archive bytes or tracker storage. Tracker/Git own workflow recovery facts;
event replay and a complete audit older than 30 days are not guaranteed.

Controlled workflow acceptance fixtures explicitly suppress unrelated patrols
and suspend the database dog locally. Those fixture restrictions do not appear
in the production template and do not prove production maintenance behavior.
The fresh installation fixture uses the production renderer with a controlled
harness. It observes the eight resolved exclusions, unsuspended database dog,
disabled age-only collection and the event rotation policy through public Gas
City configuration. Public `events rotate --wait` succeeds while the legacy
worktree, branch and uncertain receipt survive repeat preflight and legacy
resume refusal. Fixture closure waits for supervisor shutdown and stops its
two exact provider scopes; their retained files are preserved. These focused
observations do not replace whole-suite qualification or prove a total archive
byte cap.

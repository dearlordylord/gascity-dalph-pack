# Process census repair handoff

Base: `330b440a5391e1b01a65edf38c309afc59cd4ff8` (published implementation).
Reference only: accepted #3 `46e1baf1f204dfe6f94e5495997c3da1fa477627`.
The candidate is the commit containing this handoff; Git records its exact SHA.

The existing immediate `Schedule.recurs(3)` retries only per-PID observations
(initial plus three rechecks), never a command. Each retry reads owner and
birth/state afresh. A successful environment read now requires a closing
owner/birth observation before its marker can establish exclusion or inclusion.
Changed identity retries the complete observation; missing UID fails closed.
NotFound or freshly observed Z/X permits absence; exhausted unreadability
returns the existing actionable BoundaryFailure. No elapsed-time grace applies.

## Focused evidence

`test/process-reconciliation.test.ts` uses injected filesystem ports and the
Effect test clock for deterministic immediate schedules, with exact read traces.

| Scenario | Evidence |
| --- | --- |
| R1 | PermissionDenied and Unknown followed by fresh NotFound/Z/X; closing terminal observation; one physical child exits after live stat and before injected denied environment, then a fresh real stat proves absence. |
| R2 | Stable PermissionDenied/Unknown has exactly four observations and BoundaryFailure, no empty partial result; missing owner fails closed. |
| R3 | Mixed incarnations discard a foreign marker and retain the current matching writer; continually changing births fail closed; changed owner requires another complete observation. |
| R4 | Applied-mutation counter remains one through rechecks; a separate cleanup census performs all five fresh reads and retains the live writer. The port exposes only observations; no tracker/Git/check operation is retried. |

The physical fixture synchronizes on child readiness and exit events, uses no
sleep or probabilistic loops, and injects the error at the exact read boundary.
It proves physical exit/absence, not that Linux must emit PermissionDenied on
all exit races. Existing direct tests preserve marker, birth, foreign-owner and
terminal exclusions. Focused result: 22 tests passed.

## Qualification and limits

Dependencies prepared with `mise exec -- pnpm install --frozen-lockfile`.
Focused TypeScript check and lint/complexity passed. Full gate and independent
candidate review results are recorded in the follow-up qualification record.
The first gate stopped on complexity 9 > 8; extracting the terminal predicate
resolved it. A subsequent gate passed before the final missing-UID hardening;
that change requires a fresh complete gate.

Hapsland `rules check --path src/delivery/process-observation.ts --line 9`
evaluated the new supported `isTerminal` declaration: jev-latest, one real
request, body_reaches_undeclared probability 0.03 (threshold > 0.7), clear.
Effect-wrapped declarations were skipped as unsupported selection (`import`),
not represented as reviewed. Source-bearing responses remain outside Git.
Doctor readiness alone is not semantic evidence.

The published baseline has a serial census; this repair deliberately preserves
that outer loop and does not copy #3. During integration keep #3's outer
`Effect.forEach` concurrency 16 and apply this per-PID observation body and
bounded schedule inside it. No concurrency multiplication is introduced here.
The original integrator owns conflicts and combined qualification. Scope remains
local Linux cooperative same-user processes; inaccessible foreign scopes are
not qualified. This candidate does not publish #3 or complete #1–#7. Original
Dalph owns publication and any later FullRerun against the compatible head.

## Final qualification record

Qualified and independently reviewed code candidate:
`09bc64eba0ca4597e883f2d53d08ef2ca1a385b5` against the Base above.
`mise exec -- pnpm check-all` exited 0 on that exact candidate: all stages
passed, 13 test files / 126 tests; statements 99.68% (639/641), branches
99.12% (340/343), functions 100% (160/160), lines 99.64% (564/566).
The example suite passed 47 tests and the independent CLI oracle passed.

Fresh independent same-model reviewer with medium reasoning, round one,
reviewed Base..candidate, linked #1/#3, repository instructions, injected and
physical tests, and compatibility handoff: no reasonable blocking findings.
Review ended at the first clean verdict. The earlier reviewer launch was
interrupted before review to select the explicitly required medium effort;
it produced no verdict and consumed no review round.

This final evidence-only commit adds this record; implementation and tests are
identical to the qualified/reviewed candidate. Its exact result SHA is supplied
to original Dalph by the accepted result. No remote publication or future
combined native-primitives qualification is claimed here. Local gate logs and
source-bearing Hapsland responses remain outside Git under `/tmp/census-*`.

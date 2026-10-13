# Exact RIG observations

The pack reads task facts from its configured RIG through Gas City's public
`beads show --store-ref` boundary. Gas City selects the authoritative local
store and returns its existing normalized Bead output. This avoids neighboring
store scans during repeated custody and acceptance observations. CITY session
reads retain logical routing so migrated class bindings remain authoritative.

The capability guard checks the actual CLI before task planning or resource
effects. Missing capability refuses launch. The adapter retains its scoped HTTP
dependency, exact ID guard, raw empty metadata refusal and conditional write
acknowledgements. This change does not widen control mutation routing.

## Scenario evidence

| Boundary | Evidence |
| --- | --- |
| Exact RIG task read, CITY logical routing, missing-capability refusal | `test/native-scoped-point.test.ts` |
| Raw empty value refusal and conditional write reconciliation | `test/native-metadata-acknowledgement.test.ts` |
| Complete source and linked module packaging | `test/native-candidate-manifest.test.ts`; clean public-base patch application |
| Collision, missing ID, stale cache bypass, normalized output and close/output failures | Bundled `cmd_beads_scoped_show_test.go` and `beads-scoped-show.txtar` |
| Migrated CITY relic refusal and unchanged ordinary logical routing | Bundled migrated binding control and existing route matrix |
| Persistent and ephemeral native/Bd reads, operator-off fallback, unchanged database HEAD | Owned native differential, both exact-store and ordinary reads compared within each backend |

The focused adapter/workflow/review checks passed 44 tests. The subsequent fast
gate passed all 294 pack tests, 47 example tests, static checks and the independent
example oracle within its 60-second deadline. Production coverage is 99.49%
statements, 99.08% branches, 99.54% functions and 99.61% lines.

A retained review-gate comparison used the same new GC binary for both adapters.
Before: 9.78 and 8.49 seconds; after: 5.55 and 5.72 seconds. Every observation
returned the expected blocking verdict and both owned database services were
stopped afterward. These samples establish a local improvement, not a general
performance guarantee or completion of the full ten-minute acceptance suite.

Astra's scoped source and adapter reviews reported no blockers. Hapsland
evaluated a supported existing parent-order declaration with one classifier
request; the changed Effect wrapper was unsupported and skipped. That skip does
not qualify the wrapper. The full installation/recovery/maintenance composition
and graph acceptance remain open.

## Gate bootstrap repair

Gas City's clean condition environment resolves tool directories starting with
`bd`. A split diagnostic toolchain selected an older `gc` from that directory,
which refused the exact-store flag. The initial tracker read was outside the
gate error handler, so that infrastructure failure exited 1 without publishing
a verdict. Subsequent review preparation correctly refused missing evidence.
The isolated installation now keeps its qualified `gc` and `bd` together, as
the copyable build instructions already do.

The review-gate error boundary now includes typed bootstrap, identity and first
read failures. Only a validated `ReviewBlocking` returns 1; other typed failures
return 75 for Gas City's existing finite infrastructure retry policy. Other
CLI modes retain their error behavior. Three real CLI controls cover unavailable
read, missing contract and invalid identity, including refusal before any read
for bootstrap failures. A retained real verdict through the rebuilt entrypoint
in a controlled clean environment still returned `ReviewBlocking` and exit 1.
That diagnostic does not resume or qualify the original workflow.

The repair's fast gate passed 297 tests and the existing static/example checks
within its 60-second deadline, with the same coverage above. Astra closed the
expanded typed error boundary without blockers. Original full native acceptance
remains required.

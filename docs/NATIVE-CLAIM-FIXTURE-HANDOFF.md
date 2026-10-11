# Native claim fixture repair

Code candidate: `d5ecc18ab7c7c8bdd1a57362dfa6d2b25a18f6d7`, based on published #3
`c9109ac13bb01e1485f616a1a577b98c44b26d41`. Only the test fixture and direct
fixture tests change. Existing S9 assertions, production protocols, runtime
isolation and #1–#7 blocking edges remain intact.

| Scenario | Controlled evidence in test/native-tracker-fixture.test.ts |
| --- | --- |
| F1 | Discovery bead array returned verbatim; exact root, argv, cwd and timeout forwarded; no claim observation. |
| F2 | Pre-claim identity ready read allowed; strict successful claim recorded before named ready failure; disabling injection resumes the exact controlled assignment. |
| F3 | Native failure, ambiguous CommandRejected, arrays and invalid Claim receipts append nothing and cannot arm failure injection. Non-gc commands remain untouched. Existing CAS counters and lost-response handling are preserved. |
| F4 | Separate claim-first and discovery-then-claim sequences preserve the same failure/resume chronology. |

Four direct tests pass (`/tmp/native-fixture-direct.log`); TypeScript and Effect
diagnostics pass with zero errors/warnings (`/tmp/native-fixture-typecheck.log`);
build and lint pass. Dependencies were prepared with
`mise exec -- pnpm install --frozen-lockfile`.

The unchanged live S9 focused run passed its initial post-claim failure and
worker resume assertions, then failed during integrator qualification:
`writer absence unknown at /proc/2130368` with FileSystem.readFile Unknown.
Evidence: `/tmp/native-fixture-focused.log`, native root
`/tmp/s9-native-n2aDP9`. Successful native hook receipts
`c411f6b1-a772-4b15-9cb4-179f56e97303.json` and
`6d2b120e-365c-4372-81d9-78a702910fc2.json` in its
`evidence/boundaries` directory establish real claim and existing_assignment
for the same `fi-bhm` under root `fi-c3r`. No custody guard was weakened.

Hapsland doctor reports local readiness unknown; it is not review evidence.
The fixture review was skipped as not-included. Imported Effect declarations
were also unsupported skips. An eligible explicit review of unchanged
`claimOwnershipMatches` at src/delivery/tracker-scope.ts:14 evaluated one
classifier request: body_reaches_undeclared clear, probability 0.03, threshold
greater than 0.7 (`/tmp/native-fixture-hapsland-scope.log`). This is supported
declaration evidence, not a classifier review of excluded fixture code.
Source-bearing responses and credentials remain outside Git.

Accepted #2 `d58eb957b271e7046c17b0f65e217b62864032e0` was inspected for
compatibility only. Its implementation was not recreated or cherry-picked.
Controlled discovery chronology is covered; execution of the combined accepted
#2 and published #3 tree remains the original integrator's FullRerun obligation.

Fresh scoped review round 1 examined published base through the code candidate,
repository instructions and S9 specifications at medium reasoning. It reported
no reasonable blocking findings and independently passed all four direct tests.
No second code review round was needed.

Required full qualification of the code candidate passed once:
`source trial/env.sh; mise exec -- pnpm check-all` exited 0.
All 142 tests in 16 files passed, including unchanged live S9 and the four direct
fixture tests. Coverage: statements 99.72% (727/729), branches 99.27% (413/416),
functions 100% (182/182), lines 99.69% (646/648); all 99% thresholds satisfied.
All static stages, example typecheck, 47 example tests and independent CLI oracle
passed. Coverage suite duration was 190.51 seconds. Full evidence is retained in
`/tmp/native-fixture-check-all.log` and `/tmp/s9-native-64nWci`.
This required gate followed inspection of the focused failure evidence; no
repeat-until-green loop or extra live fixture was added. The initial focused
writer-observation failure remains documented above.

The handoff commit adds only this evidence document to the reviewed, qualified
code candidate; its final identity is supplied by Dalph's result commit.
Combined #2 qualification remains outstanding and is not claimed here.

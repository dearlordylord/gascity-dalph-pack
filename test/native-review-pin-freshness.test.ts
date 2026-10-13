import { Effect, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeReviewFixture } from "./helpers/native-review-fixture.ts"
import { CANDIDATE } from "./helpers/workflow-fixture.ts"
import { BeadId, CommitSha } from "../src/domain/shared.ts"

for (const boundary of ["prepare", "fix"] as const) {
  for (const change of ["head", "dirty"] as const) {
    it.effect(`review ${boundary} observes ${change} changes immediately before candidate pin`, () =>
      Effect.gen(function* () {
        const f = yield* nativeReviewFixture
        yield* Effect.gen(function* () {
          yield* f.start
          let altered = false
          const alterGit = () => {
            if (altered) return
            altered = true
            if (change === "head") f.state.workHead = CANDIDATE
            else f.state.dirty = true
          }
          if (boundary === "prepare") {
            const metadata = f.tracker.metadata
            f.tracker.metadata = (...args) =>
              metadata(...args).pipe(
                Effect.tap(() => {
                  if (args[0] === "fix" && args[1] === "gc.pack_workspace") alterGit()
                  return Effect.void
                })
              )
          } else {
            const record = f.tracker.record
            f.tracker.record = (...args) =>
              record(...args).pipe(
                Effect.tap(() => {
                  if (args[0] === "fix" && args[1] === "native_fix_initial_1") alterGit()
                  return Effect.void
                })
              )
          }
          const actor = boundary === "prepare" ? "review-prepare" : "fix"
          const invoke =
            boundary === "prepare"
              ? f.review.prepare(yield* f.row(actor))
              : f.review.finishFix(yield* f.row(actor), BeadId.make("fix-session"))
          if (change === "dirty") {
            const failure = yield* Effect.flip(invoke)
            expect(String(failure)).toContain("review candidate must be committed and clean")
            expect(f.raw("work").metadata["dalph.native_review_candidate_initial_1"]).toBeUndefined()
            expect(f.raw(actor).status).toBe("open")
            expect(f.raw(actor).metadata["gc.outcome"]).toBeUndefined()
            const retained =
              boundary === "prepare"
                ? f.raw("fix").metadata["dalph.native_attempt"]
                : f.raw("fix").metadata["dalph.native_fix_initial_1"]
            expect(retained).toBeDefined()
            f.state.dirty = false
            yield* invoke
            expect(f.raw(actor).status).toBe("closed")
            expect(
              boundary === "prepare"
                ? f.raw("fix").metadata["dalph.native_attempt"]
                : f.raw("fix").metadata["dalph.native_fix_initial_1"]
            ).toBe(retained)
          } else {
            yield* invoke
            const pin = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ commit: CommitSha })))(
              f.raw("work").metadata["dalph.native_review_candidate_initial_1"]
            )
            expect(pin.commit).toBe(CANDIDATE)
            expect(f.raw(actor).status).toBe("closed")
          }
        }).pipe(Effect.provide(f.layer))
      })
    )
  }
}

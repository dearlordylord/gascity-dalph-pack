import { Effect, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeReviewFixture } from "./helpers/native-review-fixture.ts"
import { NativeAttempt } from "../src/native/contract.ts"
import { publishSharedWorkspace } from "../src/native/shared-workspace.ts"

it.effect("review and fix borrow the retained workspace through native pool routing without copying ownership", () =>
  Effect.gen(function* () {
    const f = yield* nativeReviewFixture
    yield* Effect.gen(function* () {
      yield* f.start
      yield* f.review.prepare(yield* f.row("review-prepare"))
      for (const id of ["review", "fix"]) {
        const metadata = f.raw(id).metadata
        expect(metadata["gc.pack_workspace"]).toBe("work-work")
        expect(metadata["dalph.native_attempt"]).toBe(f.raw("work").metadata["dalph.native_attempt"])
        expect(metadata["gc.worktree_owner"]).toBeUndefined()
      }
      f.round(2)
      const attempt = yield* f.tracker.fact(f.raw("work").id, "native_attempt", NativeAttempt)
      if (!attempt) throw new Error("missing retained attempt")
      yield* publishSharedWorkspace(f.config, f.tracker, yield* f.row("review"), attempt)
      expect(f.raw("review").metadata["gc.pack_workspace"]).toBe("work-work")
      expect(f.paths.has(attempt.plan.path)).toBe(true)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect(
  "shared workspace routing refuses foreign roots, pack prefixes and lossy native slugs before publication",
  () =>
    Effect.gen(function* () {
      for (const fault of ["root", "pack", "slug"]) {
        const f = yield* nativeReviewFixture
        yield* Effect.gen(function* () {
          yield* f.start
          const attempt = yield* f.tracker.fact(f.raw("work").id, "native_attempt", NativeAttempt)
          if (!attempt) throw new Error("missing retained attempt")
          f.raw("review").metadata["gc.pack_workspace"] = "retained"
          if (fault === "pack") f.raw("review").metadata["gc.pack"] = "foreign-pack"
          const changed = yield* Schema.decodeUnknownEffect(NativeAttempt)({
            ...attempt,
            plan: {
              ...attempt.plan,
              path:
                fault === "root"
                  ? "/foreign/worktrees/work-work"
                  : fault === "slug"
                    ? `/fixture/worktrees/${"x".repeat(97)}`
                    : attempt.plan.path
            }
          })
          yield* Effect.flip(publishSharedWorkspace(f.config, f.tracker, yield* f.row("review"), changed))
          expect(f.raw("review").metadata["gc.pack_workspace"]).toBe("retained")
          expect(f.paths.has(attempt.plan.path)).toBe(true)
        }).pipe(Effect.provide(f.layer))
      }
    })
)

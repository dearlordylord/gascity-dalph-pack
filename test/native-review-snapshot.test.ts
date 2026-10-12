import { Effect, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeReviewFixture } from "./helpers/native-review-fixture.ts"
import { BeadId, BoundaryFailure } from "../src/domain/shared.ts"
import { retainedFact } from "../src/native/retained-fact.ts"
import { reviewFactKey } from "../src/native/review-fact-key.ts"

it.effect("fresh native review facts need no additional implementation point reads", () =>
  Effect.gen(function* () {
    const f = yield* nativeReviewFixture
    yield* Effect.gen(function* () {
      yield* f.start
      yield* f.review.prepare(yield* f.row("review-prepare"))
      const execute = f.commands.execute
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        args.includes("show") && args.includes("work")
          ? Effect.fail(new BoundaryFailure({ message: "redundant immutable point read" }))
          : execute(root, args, cwd, timeout, logs)
      const verdict = yield* f.verdict
      yield* f.review.submit(yield* f.row("review"), verdict)
      expect(f.raw("review").status).toBe("closed")
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("review facts refuse missing or malformed owner values without adopting another node's copy", () =>
  Effect.gen(function* () {
    for (const key of ["native_attempt", "native_proposal"]) {
      for (const fault of ["absent", "empty", "malformed"]) {
        const f = yield* nativeReviewFixture
        yield* Effect.gen(function* () {
          yield* f.start
          const name = `dalph.${key}`
          f.raw("review").metadata[name] = f.raw("work").metadata[name] ?? ""
          if (fault === "absent") delete f.raw("work").metadata[name]
          else f.raw("work").metadata[name] = fault === "empty" ? "" : "{}"
          yield* Effect.flip(f.review.context(yield* f.row("review")))
          expect(f.raw("review").status).toBe("open")
        }).pipe(Effect.provide(f.layer))
      }
    }
    expect(yield* retainedFact({ id: BeadId.make("unowned"), status: "open" }, "missing", Schema.String)).toBeNull()
  })
)

it.effect("facts published after one list require a new review context instead of stale snapshot retry", () =>
  Effect.gen(function* () {
    const f = yield* nativeReviewFixture
    yield* Effect.gen(function* () {
      yield* f.start
      const proposal = f.raw("work").metadata["dalph.native_proposal"] ?? ""
      delete f.raw("work").metadata["dalph.native_proposal"]
      const execute = f.commands.execute
      let lists = 0
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        execute(root, args, cwd, timeout, logs).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              if (args.includes("beads") && args.includes("list")) {
                lists++
                f.raw("work").metadata["dalph.native_proposal"] = proposal
              }
            })
          )
        )
      yield* Effect.flip(f.review.context(yield* f.row("review")))
      expect(lists).toBe(1)
      expect((yield* f.review.context(yield* f.row("review"))).proposal.task).toBe("task")
      expect(lists).toBe(2)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("missing or malformed previous verdict and candidate pin still refuse", () =>
  Effect.gen(function* () {
    for (const fault of ["absent", "malformed"]) {
      const f = yield* nativeReviewFixture
      yield* Effect.gen(function* () {
        yield* f.start
        f.round(2)
        if (fault === "malformed") f.raw("work").metadata["dalph.native_review_initial_1"] = "{}"
        yield* Effect.flip(f.review.prepare(yield* f.row("review-prepare")))
        expect(f.raw("review-prepare").status).toBe("open")
        f.round(1)
        yield* f.review.prepare(yield* f.row("review-prepare"))
        const pin = `dalph.${reviewFactKey("native_review_candidate", "initial", 1)}`
        if (fault === "absent") delete f.raw("work").metadata[pin]
        else f.raw("work").metadata[pin] = "{}"
        yield* Effect.flip(f.review.submit(yield* f.row("review"), yield* f.verdict))
        expect(f.raw("review").status).toBe("open")
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("a claim changed after the immutable snapshot still refuses review publication", () =>
  Effect.gen(function* () {
    const f = yield* nativeReviewFixture
    yield* Effect.gen(function* () {
      yield* f.start
      yield* f.review.prepare(yield* f.row("review-prepare"))
      const verdict = yield* f.verdict
      const execute = f.commands.execute
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        execute(root, args, cwd, timeout, logs).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              if (args.includes("beads") && args.includes("list"))
                f.raw("review-session").metadata.current_claim_bead_id = "foreign"
            })
          )
        )
      yield* Effect.flip(f.review.submit(yield* f.row("review"), verdict))
      expect(f.raw("review").status).toBe("open")
      expect(f.raw("review").metadata["dalph.native_review_initial_1"]).toBeUndefined()
    }).pipe(Effect.provide(f.layer))
  })
)

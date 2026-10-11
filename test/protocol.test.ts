import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { authorizeCleanup, worktreeAction } from "../src/domain/protocol.ts"
import { exactParents } from "../src/domain/candidate.ts"

it.effect("accepts exact ordered parents only", () =>
  Effect.sync(() => {
    expect(exactParents(["target", "result"], "target", "result")).toBe(true)
    for (const parents of [[], ["target"], ["result", "target"], ["target", "other"], ["target", "result", "other"]]) {
      expect(exactParents(parents, "target", "result")).toBe(false)
    }
  })
)

it.effect("never recreates a lost prepared attempt", () =>
  Effect.gen(function* () {
    expect(yield* worktreeAction(false, false)).toBe("ensure")
    expect(yield* worktreeAction(false, true)).toBe("verify")
    expect(yield* worktreeAction(true, true)).toBe("verify")
    expect((yield* Effect.flip(worktreeAction(true, false))).message).toContain("lost")
  })
)

it.effect("cleanup requires both independent authorities", () =>
  Effect.gen(function* () {
    yield* authorizeCleanup(true, true)
    for (const [published, stopped] of [
      [false, false],
      [false, true],
      [true, false]
    ]) {
      const failure = yield* Effect.flip(authorizeCleanup(Boolean(published), Boolean(stopped)))
      expect(failure.message).toContain("retains")
    }
  })
)

import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { commitFixtureChanges } from "../trial/commit-fixture-changes.ts"
import { CommandRejected } from "../src/delivery/command.ts"
import { AbsolutePath } from "../src/domain/attempt.ts"
import { NodeServices } from "@effect/platform-node"

it.effect("a committed fixture retry preserves its result while genuine Git failures remain failures", () =>
  Effect.gen(function* () {
    for (const fault of ["none", "diff", "commit"] as const) {
      let changed = true
      let commits = 0
      const git = {
        git: (args: ReadonlyArray<string>) => {
          if (args[0] === "diff") {
            if (fault === "diff")
              return Effect.fail(new CommandRejected({ message: "diff failed", receipt: "/retained", exit: 2 }))
            return changed
              ? Effect.fail(new CommandRejected({ message: "changed", receipt: "/retained", exit: 1 }))
              : Effect.succeed("")
          }
          if (fault === "commit")
            return Effect.fail(new CommandRejected({ message: "commit failed", receipt: "/retained", exit: 1 }))
          commits++
          changed = false
          return Effect.succeed("same candidate")
        }
      }
      const operation = commitFixtureChanges(git, AbsolutePath.make("/fixture/worktree"), "fixture proof")
      if (fault === "none") {
        yield* operation
        yield* operation
        expect(commits).toBe(1)
      } else {
        const failure = yield* Effect.flip(operation)
        expect(failure._tag).toBe("CommandRejected")
        expect(commits).toBe(0)
      }
    }
  }).pipe(Effect.provide(NodeServices.layer))
)

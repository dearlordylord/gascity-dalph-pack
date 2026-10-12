import { Effect } from "effect"
import type { Git } from "../src/delivery/git.ts"
import type { AbsolutePath } from "../src/domain/attempt.ts"

/** A replay after commit preserves that commit; only diff exit 1 means new staged changes. */
export const commitFixtureChanges = Effect.fn("Fixture.commitChanges")(function* (
  git: Pick<Git, "git">,
  path: typeof AbsolutePath.Type,
  message: string
) {
  const changed = yield* git.git(["diff", "--cached", "--quiet"], path).pipe(
    Effect.as(false),
    Effect.catchTag("CommandRejected", (error) => (error.exit === 1 ? Effect.succeed(true) : Effect.fail(error)))
  )
  if (!changed) return
  yield* git.git(
    [
      "-c",
      "user.name=Native Fixture",
      "-c",
      "user.email=native@local",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      message
    ],
    path
  )
})

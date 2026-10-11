import { Effect } from "effect"
import { join } from "node:path"
import type { RuntimeConfig } from "./config.ts"
import type { Commands } from "./tracker.ts"
import { targetGuard } from "./guard.ts"

export const makeGit = (config: RuntimeConfig, commands: Commands) => {
  const git = (args: ReadonlyArray<string>, cwd = config.repo) =>
    commands.execute(config.root, ["git", "-C", cwd, ...args])
  const guarded = <A, E, R>(operation: Effect.Effect<A, E, R>) =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* git(["rev-parse", "--path-format=absolute", "--git-common-dir"])
        yield* targetGuard(join(directory, "dalph-target.guard"))
        return yield* operation
      })
    )
  return { git, guarded, target: `refs/heads/${config.branch}`, remote: `refs/remotes/origin/${config.branch}` }
}
export type Git = ReturnType<typeof makeGit>

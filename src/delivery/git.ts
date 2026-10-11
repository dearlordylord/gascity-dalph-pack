import { Effect } from "effect"
import { join } from "node:path"
import type { RuntimeConfig } from "./config.ts"
import type { Commands } from "./tracker.ts"
import { targetGuard } from "./guard.ts"

export const makeGit = (config: RuntimeConfig, commands: Commands) => {
  const git = (args: ReadonlyArray<string>, cwd = config.repo) =>
    commands.execute(config.root, ["git", "-C", cwd, ...args])
  const guard = <A, E, R>(name: string, operation: Effect.Effect<A, E, R>) =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* git(["rev-parse", "--path-format=absolute", "--git-common-dir"])
        yield* targetGuard(join(directory, name))
        return yield* operation
      })
    )
  const guarded = <A, E, R>(operation: Effect.Effect<A, E, R>) => guard("dalph-target.guard", operation)
  const integrating = <A, E, R>(operation: Effect.Effect<A, E, R>) => guard("dalph-integration.guard", operation)
  return {
    git,
    guarded,
    integrating,
    target: `refs/heads/${config.branch}`,
    remote: `refs/remotes/origin/${config.branch}`
  }
}
export type Git = ReturnType<typeof makeGit>

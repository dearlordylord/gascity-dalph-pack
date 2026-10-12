import { Config, Console, Effect, FileSystem } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { parse } from "smol-toml"
import { fileURLToPath } from "node:url"
import { BoundaryFailure } from "../src/domain/shared.ts"

const settings = Config.unwrap({
  CITY_NAME: Config.NonEmptyString("DALPH_CITY_NAME"),
  RIG: Config.NonEmptyString("DALPH_RIG"),
  BRANCH: Config.NonEmptyString("DALPH_TARGET_BRANCH"),
  TARGET_REPO: Config.NonEmptyString("DALPH_TARGET_REPO"),
  PACK_ROOT: Config.NonEmptyString("DALPH_PACK_ROOT"),
  WORKTREE_ROOT: Config.NonEmptyString("DALPH_WORKTREE_ROOT")
})
const main = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const values = yield* settings
  let source = yield* fs.readFileString(fileURLToPath(new URL("../trial/city.toml", import.meta.url)))
  for (const [placeholder, value] of Object.entries(values))
    source = source.replaceAll(`"@@${placeholder}@@"`, JSON.stringify(value))
  yield* Effect.try({
    try: () => {
      if (source.includes("@@")) throw new Error("Unresolved city template placeholder")
      parse(source)
    },
    catch: (error) => new BoundaryFailure({ message: `Invalid rendered city configuration: ${String(error)}` })
  })
  yield* Console.log(source.trimEnd())
})
NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)))

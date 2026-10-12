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
const runtimeEnvironment = Config.unwrap({
  DALPH_TRIAL_ROOT: Config.NonEmptyString("DALPH_TRIAL_ROOT"),
  DALPH_CITY_ROOT: Config.NonEmptyString("DALPH_CITY_ROOT"),
  DALPH_TRACKER_ENDPOINT: Config.NonEmptyString("DALPH_TRACKER_ENDPOINT"),
  DALPH_NATIVE_CONTRACT: Config.NonEmptyString("DALPH_NATIVE_CONTRACT"),
  DALPH_PROJECT_CONTRACT_PATH: Config.NonEmptyString("DALPH_PROJECT_CONTRACT_PATH"),
  GC_HOME: Config.NonEmptyString("GC_HOME"),
  DOLT_ROOT_PATH: Config.NonEmptyString("DOLT_ROOT_PATH"),
  TMUX_TMPDIR: Config.NonEmptyString("TMUX_TMPDIR")
})
const main = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const values = yield* settings
  let source = yield* fs.readFileString(fileURLToPath(new URL("../trial/city.toml", import.meta.url)))
  for (const [placeholder, value] of Object.entries(values))
    source = source.replaceAll(`"@@${placeholder}@@"`, JSON.stringify(value))
  const environment = {
    ...(yield* runtimeEnvironment),
    ...Object.fromEntries(
      Object.entries(values).map(([key, value]) => [`DALPH_${key === "BRANCH" ? "TARGET_BRANCH" : key}`, value])
    )
  }
  source += Object.entries(environment)
    .map(([key, value]) => `${key} = ${JSON.stringify(value)}\n`)
    .join("")
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

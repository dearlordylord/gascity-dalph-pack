import { createHash } from "node:crypto"
import { Effect, FileSystem, Schema } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands } from "../delivery/tracker.ts"
import { shellQuote } from "./shell.ts"

export function nativeLauncherSource(
  env: Readonly<Record<string, string>>,
  nodeExecutable: string,
  script: string,
  mode: "check" | "review-gate"
) {
  const values = Object.entries(env).map(([key, value]) => shellQuote(`${key}=${value}`))
  return `#!/bin/sh\nset -eu\nexec env ${values.join(" ")} ${shellQuote(nodeExecutable)} ${shellQuote(script)} ${shellQuote(mode)}\n`
}

export const nativeCheckLauncher = Effect.fn("Native.checkLauncher")(function* (
  config: RuntimeConfig,
  commands: Commands,
  nodeExecutable: string,
  mode: "check" | "review-gate" = "check"
) {
  const loaded = yield* commands
    .execute(config.root, [...["gc", "--city", config.city], "config", "show", "--json"])
    .pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.fromJsonString(
            Schema.Struct({
              config: Schema.Struct({ Workspace: Schema.Struct({ Env: Schema.Record(Schema.String, Schema.String) }) })
            })
          )
        )
      )
    )
  const source = nativeLauncherSource(
    loaded.config.Workspace.Env,
    nodeExecutable,
    `${config.pack}/dist/native.js`,
    mode
  )
  const hash = createHash("sha256").update(source).digest("hex")
  const path = `${config.city}/.gc/native-check-${hash}.sh`
  const fs = yield* FileSystem.FileSystem
  yield* fs.makeDirectory(`${config.city}/.gc`, { recursive: true })
  if (yield* fs.exists(path)) {
    if ((yield* fs.readFileString(path)) !== source)
      return yield* new BoundaryFailure({ message: "native check launcher differs from its bound configuration" })
  } else yield* fs.writeFileString(path, source, { mode: 0o700 })
  return path
})

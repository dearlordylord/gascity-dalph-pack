import { createHash } from "node:crypto"
import { Effect, FileSystem, Schema } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands } from "../delivery/tracker.ts"
import { shellQuote } from "./shell.ts"

export const nativeCheckLauncher = Effect.fn("Native.checkLauncher")(function* (
  config: RuntimeConfig,
  commands: Commands
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
  const env = Object.entries(loaded.config.Workspace.Env).map(([key, value]) => shellQuote(`${key}=${value}`))
  const source = `#!/bin/sh\nset -eu\nexec env ${env.join(" ")} ${shellQuote(process.execPath)} ${shellQuote(`${config.pack}/dist/native.js`)} check\n`
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

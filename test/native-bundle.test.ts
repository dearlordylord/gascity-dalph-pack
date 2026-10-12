import { Duration, Effect, FileSystem } from "effect"
import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { runCommand } from "../src/quality/command.ts"

it.live("the native ESM artifact refuses invalid operations without external node_modules", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "dalph-bundle-" })
    yield* fs.copyFile("dist/native.js", `${root}/native.mjs`)
    const failure = yield* runCommand({
      executable: "env",
      args: [
        "-i",
        `DALPH_TRIAL_ROOT=${root}`,
        "GC_SESSION_ID=operator",
        process.execPath,
        `${root}/native.mjs`,
        "invalid-bundle-operation"
      ],
      cwd: root,
      timeout: Duration.seconds(5)
    }).pipe(Effect.flip)
    expect("exit" in failure && failure.exit).toBe(1)
    expect(yield* fs.readFileString(`${root}/native-error-operator`)).toContain(
      'SchemaError(Expected "launch" | "preflight"'
    )
    expect((yield* fs.readDirectory(root)).sort()).toEqual(["native-error-operator", "native.mjs"])
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
)

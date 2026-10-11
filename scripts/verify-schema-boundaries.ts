import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { Console, Effect } from "effect"
import { NodeRuntime } from "@effect/platform-node"

import { BoundaryFailure } from "../src/domain/shared.ts"

const files = async (directory: string): Promise<ReadonlyArray<string>> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const children = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? files(join(directory, entry.name)) : Promise.resolve([join(directory, entry.name)])
    )
  )
  return children.flat()
}
NodeRuntime.runMain(
  Effect.gen(function* () {
    const paths = yield* Effect.tryPromise(() => files("src/domain"))
    for (const path of paths.filter((path) => path.endsWith(".ts"))) {
      const source = yield* Effect.tryPromise(() => readFile(path, "utf8"))
      if (/^export interface /m.test(source))
        return yield* Effect.fail(new BoundaryFailure({ message: `${path}: boundary types must derive from Schema` }))
    }
    const maintained = yield* Effect.tryPromise(async () =>
      (await Promise.all(["src", "scripts", "test", "dashboard", "trial", "examples"].map(files))).flat()
    )
    const legacy = maintained.filter((path) => /\.(?:py|js|mjs)$/.test(path) && path !== "dashboard/app.bundle.js")
    if (legacy.length)
      return yield* new BoundaryFailure({ message: `Maintained source must be TypeScript: ${legacy.join(", ")}` })
    yield* Console.log("Domain schema boundaries verified")
  })
)

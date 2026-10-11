import { Console, Duration, Effect, Schema } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import { runCommand } from "../src/quality/command.ts"

interface Dependency {
  readonly version?: string
  readonly dependencies?: Readonly<Record<string, Dependency>>
  readonly devDependencies?: Readonly<Record<string, Dependency>>
}
const Dependency: Schema.Codec<Dependency> = Schema.suspend(() =>
  Schema.Struct({
    version: Schema.optionalKey(Schema.String),
    dependencies: Schema.optionalKey(Schema.Record(Schema.String, Dependency)),
    devDependencies: Schema.optionalKey(Schema.Record(Schema.String, Dependency))
  })
)
const COMMAND_TIMEOUT_SECONDS = 30
const expected = new Map([
  ["effect", "4.0.0"],
  ["@effect/platform-node", "4.0.0"],
  ["@effect/platform-node-shared", "4.0.0"],
  ["@effect/vitest", "4.0.0"],
  ["@effect/tsgo", "0.36.4"],
  ["vitest", "5.0.1"],
  ["@vitest/coverage-v8", "5.0.1"]
])
const visit = (dependency: Dependency, found: Map<string, Set<string>>) => {
  for (const [name, child] of Object.entries({ ...dependency.dependencies, ...dependency.devDependencies })) {
    if (name === "@effect/platform" || name === "@effect/cli") throw new Error(`Obsolete Effect package: ${name}`)
    if (expected.has(name)) {
      const versions = found.get(name) ?? new Set<string>()
      versions.add(child.version ?? "missing")
      found.set(name, versions)
    }
    visit(child, found)
  }
}
NodeRuntime.runMain(
  Effect.gen(function* () {
    const result = yield* runCommand({
      executable: "pnpm",
      args: ["list", "--depth", "Infinity", "--json"],
      timeout: Duration.seconds(COMMAND_TIMEOUT_SECONDS)
    })
    const projects = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Dependency)))(result.stdout)
    const found = new Map<string, Set<string>>()
    yield* Effect.try(() => {
      projects.forEach((project) => visit(project, found))
      for (const [name, version] of expected) {
        const actual = found.get(name)
        if (actual?.size !== 1 || !actual.has(version))
          throw new Error(`${name}: expected ${version}, found ${[...(actual ?? [])].join(", ")}`)
      }
    })
    yield* Console.log("Effect dependency cohort verified")
  })
)

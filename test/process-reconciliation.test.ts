import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Layer, Option, PlatformError } from "effect"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { markedProcesses } from "../src/delivery/process-observation.ts"
import { BirthTicks } from "../src/domain/shared.ts"

const stat = (birth = 100, state = "R") => `42 (fixture) ${[state, ...Array(18).fill("0"), String(birth)].join(" ")}`
const failure = (reason: "PermissionDenied" | "Unknown" | "NotFound", path: string) =>
  PlatformError.systemError({ _tag: reason, module: "FileSystem", method: "readFileString", pathOrDescriptor: path })
const observe = (
  read: (path: string) => Effect.Effect<string, PlatformError.PlatformError>,
  uid = () => Option.some(1)
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const info = yield* fs.stat("/proc/self")
    const reads: Array<string> = []
    const port = {
      ...fs,
      readDirectory: () => Effect.succeed(["42", "self"]),
      stat: (path: string) =>
        Effect.sync(() => {
          reads.push(path)
          return { ...info, uid: uid() }
        }),
      readFileString: (path: string) =>
        Effect.suspend(() => {
          reads.push(path)
          return read(path)
        })
    }
    const result = yield* markedProcesses("MARK=owned", BirthTicks.make(100), 1, "/fixture").pipe(
      Effect.provide(Layer.succeed(FileSystem.FileSystem, port)),
      Effect.result
    )
    return { reads, result }
  }).pipe(Effect.provide(NodeServices.layer))

for (const reason of ["PermissionDenied", "Unknown"] as const) {
  for (const stopped of ["absent", "Z", "X"]) {
    it.effect(`R1 ${reason} requires a fresh ${stopped} fact`, () =>
      Effect.gen(function* () {
        let stats = 0
        const { reads, result } = yield* observe((path) => {
          if (path.endsWith("environ")) return Effect.fail(failure(reason, path))
          stats++
          return stats === 1
            ? Effect.succeed(stat())
            : stopped === "absent"
              ? Effect.fail(failure("NotFound", path))
              : Effect.succeed(stat(100, stopped))
        })
        expect(result).toMatchObject({ _tag: "Success", success: [] })
        expect(reads).toEqual([
          "/fixture/42",
          "/fixture/42/stat",
          "/fixture/42/environ",
          "/fixture/42",
          "/fixture/42/stat"
        ])
      })
    )
  }
  it.effect(`R2 stable ${reason} consumes exactly four observations and fails closed`, () =>
    Effect.gen(function* () {
      const { reads, result } = yield* observe((path) =>
        path.endsWith("stat") ? Effect.succeed(stat()) : Effect.fail(failure(reason, path))
      )
      expect(result).toMatchObject({ _tag: "Failure", failure: { _tag: "BoundaryFailure" } })
      expect(reads).toEqual(Array(4).fill(["/fixture/42", "/fixture/42/stat", "/fixture/42/environ"]).flat())
    })
  )
}

it.effect("R3 rejects mixed incarnations and retains the current matching writer", () =>
  Effect.gen(function* () {
    let stats = 0
    let environments = 0
    const { reads, result } = yield* observe((path) => {
      if (path.endsWith("stat")) return Effect.succeed(stat(++stats === 1 ? 100 : 101))
      return Effect.succeed(++environments === 1 ? "MARK=foreign\0" : "MARK=owned\0")
    })
    expect(result).toMatchObject({ _tag: "Success", success: [42] })
    expect(reads).toEqual(
      Array(2)
        .fill(["/fixture/42", "/fixture/42/stat", "/fixture/42/environ", "/fixture/42", "/fixture/42/stat"])
        .flat()
    )
  })
)
it.effect("R3 continually changing identities remain unknown", () =>
  Effect.gen(function* () {
    let birth = 100
    const { reads, result } = yield* observe((path) =>
      Effect.succeed(path.endsWith("stat") ? stat(birth++) : "MARK=owned\0")
    )
    expect(result).toMatchObject({ _tag: "Failure", failure: { _tag: "BoundaryFailure" } })
    expect(reads).toHaveLength(20)
  })
)
it.effect("R4 retries only reads after an applied mutation and cleanup observes afresh", () =>
  Effect.gen(function* () {
    let mutations = 0
    let environments = 0
    yield* Effect.sync(() => {
      mutations++
    })
    const read = (path: string) =>
      path.endsWith("stat")
        ? Effect.succeed(stat())
        : ++environments === 1
          ? Effect.fail(failure("PermissionDenied", path))
          : Effect.succeed("MARK=owned\0")
    const first = yield* observe(read)
    expect(first.result).toMatchObject({ _tag: "Success", success: [42] })
    const cleanup = yield* observe(read)
    expect(cleanup.result).toMatchObject({ _tag: "Success", success: [42] })
    expect(cleanup.reads).toHaveLength(5)
    expect(first.reads).toHaveLength(8)
    expect(mutations).toBe(1)
  })
)

it.live("physical exit between live stat and denied environment is freshly proved absent", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const child = spawn(process.execPath, ["-e", "process.stdout.write('ready');process.stdin.resume()"], {
      stdio: ["pipe", "pipe", "pipe"]
    })
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        child.kill()
      })
    )
    yield* Effect.promise(() => once(child.stdout, "data"))
    const pid = child.pid
    if (pid === undefined) return yield* Effect.die("child PID missing")
    const path = `/proc/${pid}`
    const owner = Option.getOrThrow((yield* fs.stat(path)).uid)
    const reads: Array<string> = []
    const port = {
      ...fs,
      readDirectory: () => Effect.succeed([String(pid)]),
      stat: (file: string) =>
        Effect.suspend(() => {
          reads.push(file)
          return fs.stat(file)
        }),
      readFileString: (file: string) =>
        Effect.gen(function* () {
          reads.push(file)
          if (!file.endsWith("environ")) return yield* fs.readFileString(file)
          yield* Effect.promise(async () => {
            const exited = once(child, "exit")
            child.kill()
            await exited
          })
          return yield* failure("PermissionDenied", file)
        })
    }
    expect(
      yield* markedProcesses("MARK=owned", BirthTicks.make(0), owner).pipe(
        Effect.provide(Layer.succeed(FileSystem.FileSystem, port))
      )
    ).toEqual([])
    expect(reads).toEqual([path, `${path}/stat`, `${path}/environ`, path])
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped)
)

it.effect("R1 a terminal state freshly observed after environment excludes the process", () =>
  Effect.gen(function* () {
    let stats = 0
    const { reads, result } = yield* observe((path) =>
      Effect.succeed(path.endsWith("stat") ? stat(100, ++stats === 1 ? "R" : "Z") : "MARK=owned\0")
    )
    expect(result).toMatchObject({ _tag: "Success", success: [] })
    expect(reads).toHaveLength(5)
  })
)

it.effect("R2 missing owner evidence fails closed without reading an environment", () =>
  Effect.gen(function* () {
    const { reads, result } = yield* observe(
      () => Effect.succeed(stat()),
      () => Option.none()
    )
    expect(result).toMatchObject({ _tag: "Failure", failure: { _tag: "BoundaryFailure" } })
    expect(reads).toEqual(["/fixture/42"])
  })
)
it.effect("R3 owner changes require a fresh observation before foreign exclusion", () =>
  Effect.gen(function* () {
    let owners = 0
    const { reads, result } = yield* observe(
      (path) => Effect.succeed(path.endsWith("stat") ? stat() : "MARK=owned\0"),
      () => Option.some(++owners === 1 ? 1 : 2)
    )
    expect(result).toMatchObject({ _tag: "Success", success: [] })
    expect(reads).toEqual([
      "/fixture/42",
      "/fixture/42/stat",
      "/fixture/42/environ",
      "/fixture/42",
      "/fixture/42/stat",
      "/fixture/42"
    ])
  })
)

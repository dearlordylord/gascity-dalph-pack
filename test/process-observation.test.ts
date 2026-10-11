import { Effect, FileSystem, Layer, Option, PlatformError } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { join } from "node:path"
import { markedProcesses, parseProcessStat } from "../src/delivery/process-observation.ts"
import { BirthTicks } from "../src/domain/shared.ts"

const stat = (state: string, birth = 100) =>
  `42 (name with spaces) ${[state, ...Array(18).fill("0"), String(birth)].join(" ")}`
const makeFixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.makeTempDirectoryScoped()
  const path = join(root, "42")
  yield* fs.makeDirectory(path)
  yield* fs.writeFileString(join(path, "stat"), stat("R"))
  yield* fs.writeFileString(join(path, "environ"), "DALPH_BOUNDARY=owned\0OTHER=x\0")
  const owner = Option.getOrThrow((yield* fs.stat(path)).uid)
  return { fs, root, path, owner }
})
const provide = <A, E, R>(effect: Effect.Effect<A, E, R | FileSystem.FileSystem>) =>
  effect.pipe(Effect.provide(NodeServices.layer), Effect.scoped)

it.effect("parses start ticks after a parenthesized process name", () =>
  Effect.gen(function* () {
    expect((yield* parseProcessStat(stat("R"))).birth).toBe(100)
    expect((yield* Effect.flip(parseProcessStat("malformed")))._tag).toBe("SchemaError")
  })
)
it.live("holds live marked writers, ignores old and foreign processes, and releases zombies", () =>
  provide(
    Effect.gen(function* () {
      const { fs, owner, path, root } = yield* makeFixture
      expect(yield* markedProcesses("DALPH_BOUNDARY=owned", BirthTicks.make(100), owner, root)).toEqual([42])
      expect(yield* markedProcesses("DALPH_BOUNDARY=other", BirthTicks.make(100), owner, root)).toEqual([])
      expect(yield* markedProcesses("DALPH_BOUNDARY=owned", BirthTicks.make(101), owner, root)).toEqual([])
      expect(yield* markedProcesses("DALPH_BOUNDARY=owned", BirthTicks.make(100), owner + 1, root)).toEqual([])
      for (const state of ["Z", "X"]) {
        yield* fs.writeFileString(join(path, "stat"), stat(state))
        expect(yield* markedProcesses("DALPH_BOUNDARY=owned", BirthTicks.make(100), owner, root)).toEqual([])
      }
    })
  )
)
it.live("treats a disappearing process as absence", () =>
  provide(
    Effect.gen(function* () {
      const { fs, owner, path, root } = yield* makeFixture
      yield* fs.remove(join(path, "stat"))
      expect(yield* markedProcesses("DALPH_BOUNDARY=owned", BirthTicks.make(100), owner, root)).toEqual([])
    })
  )
)
for (const reason of ["PermissionDenied", "Unknown"] as const) {
  it.live(`unreadable live writers fail closed after bounded ${reason} rechecks`, () =>
    provide(
      Effect.gen(function* () {
        const { fs, owner, root } = yield* makeFixture
        let observations = 0
        const denied = {
          ...fs,
          readFileString: (path: string) =>
            path.endsWith("environ")
              ? Effect.suspend(() => {
                  observations++
                  return Effect.fail(
                    PlatformError.systemError({
                      _tag: reason,
                      module: "FileSystem",
                      method: "readFileString",
                      pathOrDescriptor: path
                    })
                  )
                })
              : fs.readFileString(path)
        }
        const failure = yield* Effect.flip(
          markedProcesses("DALPH_BOUNDARY=owned", BirthTicks.make(100), owner, root).pipe(
            Effect.provide(Layer.succeed(FileSystem.FileSystem, denied))
          )
        )
        expect(failure._tag).toBe("BoundaryFailure")
        expect(observations).toBe(4)
      })
    )
  )
}
it.live("permission race is reconciled by a fresh stopped observation", () =>
  provide(
    Effect.gen(function* () {
      const { fs, owner, path, root } = yield* makeFixture
      const exiting = {
        ...fs,
        readFileString: (file: string) =>
          file.endsWith("environ")
            ? fs
                .writeFileString(join(path, "stat"), stat("Z"))
                .pipe(
                  Effect.andThen(
                    Effect.fail(
                      PlatformError.systemError({
                        _tag: "PermissionDenied",
                        module: "FileSystem",
                        method: "readFileString",
                        pathOrDescriptor: file
                      })
                    )
                  )
                )
            : fs.readFileString(file)
      }
      expect(
        yield* markedProcesses("DALPH_BOUNDARY=owned", BirthTicks.make(100), owner, root).pipe(
          Effect.provide(Layer.succeed(FileSystem.FileSystem, exiting))
        )
      ).toEqual([])
    })
  )
)

it.live("rechecks an unknown stat read when the process disappears during observation", () =>
  provide(
    Effect.gen(function* () {
      const { fs, owner, path, root } = yield* makeFixture
      let reads = 0
      const exiting = {
        ...fs,
        readFileString: (file: string) =>
          file.endsWith("stat")
            ? Effect.gen(function* () {
                reads++
                yield* fs.remove(path, { recursive: true })
                return yield* PlatformError.systemError({
                  _tag: "Unknown",
                  module: "FileSystem",
                  method: "readFileString",
                  pathOrDescriptor: file
                })
              })
            : fs.readFileString(file)
      }
      expect(
        yield* markedProcesses("DALPH_BOUNDARY=owned", BirthTicks.make(100), owner, root).pipe(
          Effect.provide(Layer.succeed(FileSystem.FileSystem, exiting))
        )
      ).toEqual([])
      expect(reads).toBe(1)
    })
  )
)

it.live("a batched census retains every live owner and fails if any owner is unreadable", () =>
  provide(
    Effect.gen(function* () {
      const { fs, owner, root } = yield* makeFixture
      const second = join(root, "43")
      yield* fs.makeDirectory(second)
      yield* fs.writeFileString(join(second, "stat"), stat("R"))
      yield* fs.writeFileString(join(second, "environ"), "DALPH_BOUNDARY=owned\0")
      const census = markedProcesses("DALPH_BOUNDARY=owned", BirthTicks.make(100), owner, root)
      expect((yield* census).sort((a, b) => a - b)).toEqual([42, 43])
      yield* fs.writeFileString(join(second, "stat"), stat("Z"))
      expect(yield* census).toEqual([42])
      yield* fs.writeFileString(join(second, "stat"), stat("R"))
      let reads = 0
      const unreadable = {
        ...fs,
        readFileString: (path: string) =>
          path === join(second, "environ")
            ? Effect.suspend(() => {
                reads++
                return Effect.fail(
                  PlatformError.systemError({
                    _tag: "Unknown",
                    module: "FileSystem",
                    method: "readFileString",
                    pathOrDescriptor: path
                  })
                )
              })
            : fs.readFileString(path)
      }
      expect((yield* Effect.flip(census.pipe(Effect.provideService(FileSystem.FileSystem, unreadable))))._tag).toBe(
        "BoundaryFailure"
      )
      expect(reads).toBe(4)
    })
  )
)

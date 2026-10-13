import { Deferred, Effect, Fiber, FileSystem, Ref } from "effect"
import { expect, it } from "@effect/vitest"
import * as TestClock from "effect/testing/TestClock"
import { NodeServices } from "@effect/platform-node"
import { makeQualityGate } from "../../scripts/quality-gate.ts"
import { CommandFailure } from "../../src/quality/command.ts"

const output = () => undefined
const accepted = Effect.succeed({ stdout: "", stderr: "" })
const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.makeTempDirectoryScoped()
  return { fs, directory: `${root}/quality` }
})

it.effect("a failed static check interrupts its concurrent sibling before coverage starts", () =>
  Effect.gen(function* () {
    const { directory } = yield* fixture
    const started = yield* Deferred.make<void>()
    const stopped = yield* Ref.make(false)
    const calls: string[] = []
    const gate = makeQualityGate((command) => {
      const stage = command.args[0] ?? ""
      calls.push(stage)
      if (stage === "verify:schema-boundaries")
        return Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(Ref.set(stopped, true))
        )
      if (stage === "circular")
        return Deferred.await(started).pipe(
          Effect.andThen(Effect.fail(new CommandFailure({ command: stage, message: "controlled rejection" })))
        )
      return accepted
    }, directory)
    expect((yield* Effect.flip(gate("fast", output)))._tag).toBe("CommandFailure")
    expect(yield* Ref.get(stopped)).toBe(true)
    expect(calls.slice(0, 3)).toEqual(["verify:effect-cohort", "build", "typecheck"])
    expect(calls).not.toContain("test:coverage")
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped)
)

it.effect("fast deadline covers cumulative stages and finalizes the interrupted child", () =>
  Effect.gen(function* () {
    const { directory, fs } = yield* fixture
    const second = yield* Deferred.make<void>()
    const first = yield* Deferred.make<void>()
    const stopped = yield* Ref.make(false)
    let calls = 0
    const gate = makeQualityGate(
      () =>
        Effect.gen(function* () {
          calls++
          yield* Ref.set(stopped, false)
          if (calls === 1) yield* Deferred.succeed(first, undefined)
          if (calls === 2) yield* Deferred.succeed(second, undefined)
          yield* Effect.sleep("40 seconds")
          return { stdout: "", stderr: "" }
        }).pipe(Effect.ensuring(Ref.set(stopped, true))),
      directory
    )
    const running = yield* gate("fast", output).pipe(Effect.flip, Effect.forkScoped)
    yield* Deferred.await(first)
    yield* TestClock.adjust("40 seconds")
    yield* Deferred.await(second)
    yield* TestClock.adjust("20 seconds")
    expect((yield* Fiber.join(running))._tag).toBe("TimeoutError")
    expect(calls).toBe(2)
    expect(yield* Ref.get(stopped)).toBe(true)
    expect(yield* fs.exists(directory)).toBe(false)
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped)
)

it.effect("full timeout retains custody and prevents another full while fast remains available", () =>
  Effect.gen(function* () {
    const { directory, fs } = yield* fixture
    const started = yield* Deferred.make<void>()
    const stopped = yield* Ref.make(false)
    let calls = 0
    const gate = makeQualityGate(() => {
      calls++
      return Deferred.succeed(started, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(Ref.set(stopped, true))
      )
    }, directory)
    const running = yield* gate("all", output).pipe(Effect.flip, Effect.forkScoped)
    yield* Deferred.await(started)
    yield* TestClock.adjust("10 minutes")
    expect((yield* Fiber.join(running))._tag).toBe("TimeoutError")
    expect(yield* Ref.get(stopped)).toBe(true)
    expect(yield* fs.exists(`${directory}/full-incomplete.json`)).toBe(true)
    expect((yield* Effect.flip(gate("all", output)))._tag).toBe("BoundaryFailure")
    expect(calls).toBe(1)
    yield* makeQualityGate(() => accepted, directory)("fast", output)
    expect(yield* fs.exists(`${directory}/full-incomplete.json`)).toBe(true)
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped)
)

it.effect("a reconciled failed full and a successful full allow another admission on the same day", () =>
  Effect.gen(function* () {
    for (const fails of [true, false]) {
      const { directory, fs } = yield* fixture
      let calls = 0
      const gate = makeQualityGate(() => {
        calls++
        return fails && calls === 1
          ? Effect.fail(new CommandFailure({ command: "controlled", message: "rejected" }))
          : accepted
      }, directory)
      if (fails) {
        expect((yield* Effect.flip(gate("all", output)))._tag).toBe("CommandFailure")
        yield* fs.remove(`${directory}/full-incomplete.json`)
      } else yield* gate("all", output)
      const consumed = calls
      yield* gate("all", output)
      expect(calls).toBeGreaterThan(consumed)
      expect(yield* fs.exists(`${directory}/full-incomplete.json`)).toBe(false)
      expect((yield* fs.readFileString(`${directory}/full-starts.jsonl`)).trim().split("\n")).toHaveLength(2)
    }
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped)
)

it.effect("controlled checks overlap within two lanes and native waits for every result", () =>
  Effect.gen(function* () {
    const { directory } = yield* fixture
    const coverage = yield* Deferred.make<void>()
    const example = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const calls: string[] = []
    const gate = makeQualityGate((command) => {
      const stage = command.args[0] ?? ""
      calls.push(stage)
      if (stage === "test:coverage")
        return Deferred.succeed(coverage, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
          Effect.as({ stdout: "", stderr: "" })
        )
      if (stage === "example:oracle")
        return Deferred.succeed(example, undefined).pipe(Effect.as({ stdout: "", stderr: "" }))
      return accepted
    }, directory)
    const pending = yield* gate("all", output).pipe(Effect.forkScoped)
    yield* Deferred.await(coverage)
    yield* Deferred.await(example)
    expect(calls).toContain("example:typecheck")
    expect(calls).toContain("example:test")
    expect(calls).not.toContain("test:native")
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(pending)
    expect(calls).toContain("test:native")
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped)
)

it.effect("a controlled failure joins its live sibling and refuses native admission", () =>
  Effect.gen(function* () {
    const { directory } = yield* fixture
    const started = yield* Deferred.make<void>()
    const stopped = yield* Ref.make(false)
    const calls: string[] = []
    const gate = makeQualityGate((command) => {
      const stage = command.args[0] ?? ""
      calls.push(stage)
      if (stage === "test:coverage")
        return Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(Ref.set(stopped, true))
        )
      if (stage === "example:typecheck")
        return Deferred.await(started).pipe(
          Effect.andThen(Effect.fail(new CommandFailure({ command: stage, message: "controlled rejection" })))
        )
      return accepted
    }, directory)
    expect((yield* Effect.flip(gate("all", output)))._tag).toBe("CommandFailure")
    expect(yield* Ref.get(stopped)).toBe(true)
    expect(calls).not.toContain("test:native")
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped)
)

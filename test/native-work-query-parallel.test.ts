import { Deferred, Effect, Fiber, Ref, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { BoundaryFailure } from "../src/domain/shared.ts"
import { NativeQuerySettings, nativeWorkQuery } from "../src/native/work-query.ts"

const settings = (extra: Record<string, string> = {}) =>
  Schema.decodeUnknownSync(NativeQuerySettings)({ template: "fixture/dalph.native-worker", ...extra })
const row = (args: ReadonlyArray<string>) => ({
  tier: args.includes("in_progress") ? "in_progress" : args.includes("--assignee") ? "assigned-ready" : "unassigned",
  identity: args.at(-1),
  blocked_by: args.includes("in_progress") ? ["retained-blocker"] : []
})

it.effect("native query preserves all identity tiers and blocked rows with at most four active reads", () =>
  Effect.gen(function* () {
    const active = yield* Ref.make(0)
    const peak = yield* Ref.make(0)
    const entered = yield* Ref.make(0)
    const four = yield* Deferred.make<void>()
    const calls = yield* Ref.make<ReadonlyArray<ReadonlyArray<string>>>([])
    const result = yield* nativeWorkQuery(
      settings({ session: "seat", name: "runtime", alias: "collapsed", directory: "/owned/work-A" }),
      {
        execute: (args) =>
          Effect.gen(function* () {
            yield* Ref.update(calls, (calls) => [...calls, args])
            const current = yield* Ref.updateAndGet(active, (count) => count + 1)
            yield* Ref.update(peak, (value) => Math.max(value, current))
            if ((yield* Ref.updateAndGet(entered, (count) => count + 1)) === 4) yield* Deferred.succeed(four, undefined)
            return yield* Deferred.await(four).pipe(
              Effect.as(JSON.stringify([row(args)])),
              Effect.ensuring(Ref.update(active, (count) => count - 1))
            )
          })
      }
    )
    expect(yield* Ref.get(peak)).toBe(4)
    expect(yield* Ref.get(active)).toBe(0)
    expect(result).toEqual([
      ...["seat", "runtime", "collapsed"].map((identity) => ({
        tier: "in_progress",
        identity,
        blocked_by: ["retained-blocker"]
      })),
      ...["seat", "runtime", "collapsed"].map((identity) => ({ tier: "assigned-ready", identity, blocked_by: [] })),
      { tier: "unassigned", identity: "--unassigned", blocked_by: [] }
    ])
    expect((yield* Ref.get(calls)).every((args) => args.includes("gc.pack_workspace=work-A"))).toBe(true)
  })
)

it.effect("no-seat native probes need no actor workspace and retain optional native identities", () =>
  Effect.gen(function* () {
    for (const extra of [{}, { directory: "/controller" }, { name: "runtime", alias: "alias" }]) {
      const calls: Array<ReadonlyArray<string>> = []
      yield* nativeWorkQuery(settings(extra), {
        execute: (args) => {
          calls.push(args)
          return Effect.succeed("[]")
        }
      })
      expect(calls.every((args) => !args.some((arg) => arg.startsWith("gc.pack_workspace=")))).toBe(true)
      expect(calls).toContainEqual(expect.arrayContaining(["--unassigned"]))
    }
  })
)

it.effect("missing or root actor workspace refuses before public ready reads", () =>
  Effect.gen(function* () {
    for (const extra of [{ session: "seat" }, { session: "seat", directory: "/" }]) {
      const reads = yield* Ref.make(0)
      yield* Effect.flip(
        nativeWorkQuery(settings(extra), {
          execute: () => Ref.update(reads, (count) => count + 1).pipe(Effect.as("[]"))
        })
      )
      expect(yield* Ref.get(reads)).toBe(0)
    }
  })
)

it.effect("failed, empty or non-array native ready results cannot become partial success", () =>
  Effect.gen(function* () {
    for (const response of [
      Effect.fail(new BoundaryFailure({ message: "transport" })),
      Effect.succeed(""),
      Effect.succeed("{}")
    ]) {
      const failed = yield* Effect.flip(nativeWorkQuery(settings(), { execute: () => response }))
      expect(failed.message).toContain("native ready query failed")
    }
  })
)

it.effect("interrupted native query awaits all four started read finalizers", () =>
  Effect.gen(function* () {
    const entered = yield* Ref.make(0)
    const finished = yield* Ref.make(0)
    const four = yield* Deferred.make<void>()
    const running = yield* nativeWorkQuery(
      settings({ session: "seat", name: "runtime", alias: "alias", directory: "/owned/work-A" }),
      {
        execute: () =>
          Effect.gen(function* () {
            if ((yield* Ref.updateAndGet(entered, (count) => count + 1)) === 4) yield* Deferred.succeed(four, undefined)
            return yield* Effect.never
          }).pipe(Effect.ensuring(Ref.update(finished, (count) => count + 1)))
      }
    ).pipe(Effect.forkScoped)
    yield* Deferred.await(four)
    yield* Fiber.interrupt(running)
    expect(yield* Ref.get(entered)).toBe(4)
    expect(yield* Ref.get(finished)).toBe(4)
  }).pipe(Effect.scoped)
)

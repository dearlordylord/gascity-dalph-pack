import { Deferred, Effect, Fiber } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { nativeReviewFixture } from "./helpers/native-review-fixture.ts"
import { BeadId, BoundaryFailure } from "../src/domain/shared.ts"
import { nativeWriterInventory } from "../src/native/session-inventory.ts"
import { nativeStopKey } from "../src/native/session-stop.ts"
import { makeNativeController } from "../src/native/controller.ts"

it.effect("missing terminal sessions overlap within four boundaries, deduplicate and join all finalizers", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const ids = Array.from({ length: 8 }, (_, index) => BeadId.make(`closed-${index}`))
    for (const id of ids) f.rows.set(id, { ...f.raw("session"), id, status: "closed" })
    let active = 0
    let peak = 0
    const reads: string[] = []
    const execute = f.commands.execute
    f.commands.execute = (root, args, cwd, timeout, logs) => {
      if (args.includes("session") && args.includes("list")) return Effect.succeed('{"sessions":[]}')
      if (!args.includes("beads") || !args.includes("show")) return execute(root, args, cwd, timeout, logs)
      return Effect.acquireUseRelease(
        Effect.sync(() => {
          active++
          peak = Math.max(peak, active)
          reads.push(String(args[args.indexOf("show") + 1]))
        }),
        () =>
          Effect.gen(function* () {
            if (active === 4) yield* Deferred.succeed(entered, undefined)
            yield* Deferred.await(release)
            return yield* execute(root, args, cwd, timeout, logs)
          }),
        () =>
          Effect.sync(() => {
            active--
          })
      )
    }
    yield* Effect.gen(function* () {
      const running = yield* nativeWriterInventory(f.config, f.commands, [...ids, ...ids]).pipe(Effect.forkScoped)
      yield* Deferred.await(entered)
      expect(active).toBe(4)
      expect(reads).toHaveLength(4)
      yield* Deferred.succeed(release, undefined)
      expect((yield* Fiber.join(running)).map((entry) => entry.id)).toEqual(ids)
      expect(peak).toBe(4)
      expect(active).toBe(0)
      expect(reads).toEqual(ids)
    }).pipe(Effect.provide(f.layer), Effect.scoped)
  })
)

it.effect("inventory collapses identical duplicates and refuses contradictory duplicates before writer effects", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    const entry = { id: "session", template: f.contract.agent, closed: true }
    const execute = f.commands.execute
    for (const fault of ["same", "template", "status"]) {
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        args.includes("session") && args.includes("list")
          ? Effect.succeed(
              JSON.stringify({
                sessions: [
                  entry,
                  {
                    ...entry,
                    ...(fault === "template" ? { template: "foreign" } : {}),
                    ...(fault === "status" ? { closed: false } : {})
                  }
                ]
              })
            )
          : execute(root, args, cwd, timeout, logs)
      yield* Effect.gen(function* () {
        const read = nativeWriterInventory(f.config, f.commands, [])
        if (fault === "same") expect(yield* read).toEqual([entry])
        else expect(String(yield* Effect.flip(read))).toContain("contradictory duplicate")
        expect(f.events.some((event) => event.startsWith("native-close:"))).toBe(false)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("a terminal close may complete beside a foreign open writer, but the whole gate refuses cleanup", () =>
  Effect.gen(function* () {
    const f = yield* nativeReviewFixture
    yield* Effect.gen(function* () {
      yield* f.start
      yield* f.review.prepare(yield* f.row("review-prepare"))
      yield* f.review.submit(yield* f.row("review"), yield* f.verdict)
      f.rows.set("foreign-session", {
        id: BeadId.make("foreign-session"),
        status: "open",
        metadata: {
          pool_managed: "true",
          session_origin: "ephemeral",
          state: "awake",
          template: "foreign/worker",
          work_dir: "/fixture/worktrees/work-work",
          current_claim_bead_id: "foreign-task"
        }
      })
      const closed = yield* Deferred.make<void>()
      const execute = f.commands.execute
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        Effect.gen(function* () {
          if (args.includes("session") && args.includes("list"))
            return JSON.stringify({
              sessions: ["session", "review-session", "fix-session", "foreign-session"].map((id) => ({
                id,
                template: f.raw(id).metadata.template,
                closed: f.raw(id).status === "closed"
              }))
            })
          if (args.includes("beads") && args.includes("show") && args[args.indexOf("show") + 1] === "foreign-session")
            yield* Deferred.await(closed)
          const result = yield* execute(root, args, cwd, timeout, logs)
          if (
            args.includes("session") &&
            args.includes("close") &&
            args[args.indexOf("close") + 1] === "review-session"
          )
            yield* Deferred.succeed(closed, undefined)
          return result
        })
      expect(String(yield* Effect.flip(f.review.gate(yield* f.row("review-control"))))).toContain(
        "unrelated native writer"
      )
      expect(f.events).toContain("native-close:review-session")
      expect(f.events).not.toContain("native-close:foreign-session")
      expect(f.raw("foreign-session").status).toBe("open")
      expect(f.raw("work").metadata["dalph.native_approved_initial_1"]).toBeUndefined()
      expect(f.paths.has("/fixture/worktrees/work-work")).toBe(true)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect(
  "a sibling failure after public close retains intent, joins interruption and reconciles the lost result",
  () =>
    Effect.gen(function* () {
      const f = yield* nativeReviewFixture
      yield* Effect.gen(function* () {
        yield* f.start
        yield* f.review.prepare(yield* f.row("review-prepare"))
        yield* f.review.submit(yield* f.row("review"), yield* f.verdict)
        const submitted = yield* Deferred.make<void>()
        let finalized = false
        const execute = f.commands.execute
        f.commands.execute = (root, args, cwd, timeout, logs) => {
          if (args.includes("beads") && args.includes("show") && args[args.indexOf("show") + 1] === "fix-session")
            return Deferred.await(submitted).pipe(
              Effect.andThen(Effect.fail(new BoundaryFailure({ message: "sibling observation failed" })))
            )
          if (
            args.includes("session") &&
            args.includes("close") &&
            args[args.indexOf("close") + 1] === "review-session"
          )
            return Effect.acquireUseRelease(
              Effect.void,
              () =>
                Effect.gen(function* () {
                  yield* execute(root, args, cwd, timeout, logs)
                  yield* Deferred.succeed(submitted, undefined)
                  return yield* Effect.never
                }),
              () =>
                Effect.sync(() => {
                  finalized = true
                })
            )
          return execute(root, args, cwd, timeout, logs)
        }
        expect(String(yield* Effect.flip(f.review.gate(yield* f.row("review-control"))))).toContain(
          "sibling observation failed"
        )
        expect(finalized).toBe(true)
        const key = `dalph.${nativeStopKey(BeadId.make("review-session"))}`
        expect(f.raw("review").metadata[key]).toBeDefined()
        expect(f.raw("work").metadata["dalph.native_approved_initial_1"]).toBeUndefined()
        expect(f.paths.has("/fixture/worktrees/work-work")).toBe(true)
        f.commands.execute = execute
        yield* f.review.gate(yield* f.row("review-control"))
        expect(f.events.filter((event) => event === "native-close:review-session")).toHaveLength(2)
        expect(f.raw("work").metadata["dalph.native_approved_initial_1"]).toBeDefined()
      }).pipe(Effect.provide(f.layer))
    })
)

it.effect("concurrent positive observations of two occupied sessions refuse resume without freeing capacity", () =>
  Effect.gen(function* () {
    const f = yield* nativeReviewFixture
    yield* Effect.gen(function* () {
      yield* f.start
      f.raw("fix-session").status = "open"
      f.raw("fix-session").metadata.state = "awake"
      const both = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      let lists = 0
      let activeReads = 0
      const execute = f.commands.execute
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        Effect.gen(function* () {
          if (args.includes("session") && args.includes("list")) lists++
          const id = args[args.indexOf("show") + 1]
          if (
            lists >= 2 &&
            args.includes("beads") &&
            args.includes("show") &&
            ["fix-session", "review-session"].includes(id ?? "")
          ) {
            activeReads++
            if (activeReads === 2) yield* Deferred.succeed(both, undefined)
            yield* Deferred.await(release)
          }
          return yield* execute(root, args, cwd, timeout, logs)
        })
      const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
      const running = yield* controller.resume(BeadId.make("root")).pipe(Effect.flip, Effect.forkScoped)
      yield* Deferred.await(both)
      yield* Deferred.succeed(release, undefined)
      expect(String(yield* Fiber.join(running))).toContain("multiple retained review/fix sessions")
      expect(f.events).not.toContain("native-close:fix-session")
      expect(f.events).not.toContain("native-close:review-session")
      expect(f.events).not.toContain("native-resume")
      expect(f.paths.has("/fixture/worktrees/work-work")).toBe(true)
    }).pipe(Effect.provide(f.layer), Effect.scoped)
  })
)

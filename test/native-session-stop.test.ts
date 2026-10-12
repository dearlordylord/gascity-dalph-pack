import { Effect, Exit } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { nativeSession } from "../src/native/session-observation.ts"
import { stopNativeWriter, nativeStopKey } from "../src/native/session-stop.ts"
import { BeadId } from "../src/domain/shared.ts"

it.effect("an open completed producer remains native-owned and receives no pack close", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      const open = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
      expect((yield* Effect.flip(stopNativeWriter(f.config, f.commands, f.tracker, open)))._tag).toBe(
        "NativeSessionPending"
      )
      expect(f.events).not.toContain("native-close:session")
      expect(f.raw("session").status).toBe("open")
      expect(f.raw("work").metadata[`dalph.${nativeStopKey(open.id)}`]).toBeUndefined()
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("retained recovery refuses a session reopened before close without completing its task", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "in_progress"
      f.raw("session").status = "closed"
      const before = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
      f.raw("session").status = "open"
      yield* Effect.flip(stopNativeWriter(f.config, f.commands, f.tracker, before, { _tag: "RetainedRecovery" }))
      expect(f.events).not.toContain("native-close:session")
      expect(f.raw("work").status).toBe("in_progress")
      expect(f.raw("work").metadata[`dalph.${nativeStopKey(before.id)}`]).toBeUndefined()
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("successful native close needs no optional process confirmation", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      f.raw("session").status = "closed"
      f.nativeState.legacyClose = false
      f.nativeState.runtimeAbsent = false
      const live = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
      yield* stopNativeWriter(f.config, f.commands, f.tracker, live)
      expect(f.raw("session").status).toBe("closed")
      expect(f.events).toContain("native-runtime-stop:session")
      expect(f.raw("work").metadata[`dalph.${nativeStopKey(live.id)}`]).toBeDefined()
      f.nativeState.runtimeAbsent = true
      const closed = yield* nativeSession(f.config, f.commands, live.id)
      yield* stopNativeWriter(f.config, f.commands, f.tracker, closed)
      expect(f.events.filter((event) => event === "native-close:session")).toHaveLength(2)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("an intervening close reconciles through stock idempotent close without extra teardown proof", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      f.nativeState.legacyClose = true
      const live = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
      f.raw("session").status = "closed"
      const execute = f.commands.execute
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        Effect.gen(function* () {
          if (args.includes("session") && args.includes("close")) {
            f.raw("session").status = "closed"
            f.raw("session").metadata.state = "closed"
          }
          return yield* execute(root, args, cwd, timeout, logs)
        })
      const outcome = yield* Effect.exit(stopNativeWriter(f.config, f.commands, f.tracker, live))
      expect(Exit.isSuccess(outcome)).toBe(true)
      expect(f.events).not.toContain("native-runtime-stop:session")
      expect(f.raw("work").metadata[`dalph.${nativeStopKey(live.id)}_observed`]).toBeUndefined()
    }).pipe(Effect.provide(f.layer))
  })
)
it.effect("replay repeats stock close even when closed bead retains awake lifecycle metadata", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      f.raw("session").status = "closed"
      const live = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
      yield* stopNativeWriter(f.config, f.commands, f.tracker, live)
      const closed = yield* nativeSession(f.config, f.commands, live.id)
      expect(closed.status).toBe("closed")
      expect(closed.metadata.state).toBe("awake")
      yield* stopNativeWriter(f.config, f.commands, f.tracker, closed)
      expect(f.events.filter((event) => event === "native-close:session")).toHaveLength(2)
      expect(f.raw("work").metadata[`dalph.${nativeStopKey(live.id)}_observed`]).toBeUndefined()
    }).pipe(Effect.provide(f.layer))
  })
)
it.effect("a crash after intent and self-close recovers through fresh native teardown", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      f.raw("session").status = "closed"
      f.raw("session").metadata.state = "closed"
      f.raw("work").metadata[`dalph.${nativeStopKey(BeadId.make("session"))}`] = JSON.stringify({
        version: 1,
        session: "session",
        node: "work",
        path: "/fixture/worktrees/work-work",
        template: f.contract.agent
      })
      const closed = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
      yield* stopNativeWriter(f.config, f.commands, f.tracker, closed)
      expect(f.events).toContain("native-close:session")
      expect(f.raw("work").metadata[`dalph.${nativeStopKey(closed.id)}_observed`]).toBeUndefined()
    }).pipe(Effect.provide(f.layer))
  })
)
it.effect("a lost native close response recovers by repeating native close", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      f.raw("session").status = "closed"
      f.raw("session").metadata.state = "awake"
      f.nativeState.closeResponseLost = true
      const before = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
      yield* Effect.flip(stopNativeWriter(f.config, f.commands, f.tracker, before))
      expect(f.raw("work").metadata[`dalph.${nativeStopKey(BeadId.make("session"))}`]).toBeDefined()
      const after = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
      f.nativeState.closeResponseLost = false
      yield* stopNativeWriter(f.config, f.commands, f.tracker, after)
      expect(f.events.filter((event) => event === "native-close:session")).toHaveLength(2)
    }).pipe(Effect.provide(f.layer))
  })
)
it.effect("historical sessions require native teardown and unfinished writers retain custody", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      f.raw("session").status = "closed"
      f.raw("session").metadata.state = "closed"
      const old = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
      yield* stopNativeWriter(f.config, f.commands, f.tracker, old)
      expect(f.events).toContain("native-close:session")
      f.events.length = 0
      delete f.raw("work").metadata[`dalph.${nativeStopKey(old.id)}`]
      f.raw("session").status = "open"
      f.raw("work").status = "open"
      const live = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
      expect(String(yield* Effect.flip(stopNativeWriter(f.config, f.commands, f.tracker, live)))).toContain(
        "unfinished"
      )
      expect(f.events).not.toContain("native-close:session")
      expect(f.raw("work").metadata[`dalph.${nativeStopKey(live.id)}`]).toBeUndefined()
      f.raw("work").status = "closed"
      f.raw("session").status = "closed"
      f.raw("session").metadata.state = "closed"
      const selfClosed = yield* nativeSession(f.config, f.commands, live.id)
      yield* stopNativeWriter(f.config, f.commands, f.tracker, selfClosed)
      expect(f.events).toContain("native-close:session")
    }).pipe(Effect.provide(f.layer))
  })
)
it.effect("native retirement remains pending without creating a pack stop intent", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      f.raw("session").status = "open"
      f.nativeState.stopFailure = true
      const session = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
      yield* Effect.flip(stopNativeWriter(f.config, f.commands, f.tracker, session))
      expect(f.raw("session").status).toBe("open")
      expect(f.raw("work").metadata[`dalph.${nativeStopKey(BeadId.make("session"))}`]).toBeUndefined()
    }).pipe(Effect.provide(f.layer))
  })
)
it.effect("contradictory stop identity is refused before touching another session", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      f.raw("session").status = "open"
      f.raw("work").metadata[`dalph.${nativeStopKey(BeadId.make("session"))}`] = JSON.stringify({
        version: 1,
        session: "session",
        node: "work",
        path: "/foreign/worktree",
        template: f.contract.agent
      })
      const session = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
      expect(String(yield* Effect.flip(stopNativeWriter(f.config, f.commands, f.tracker, session)))).toContain(
        "another session"
      )
      expect(f.events).not.toContain("native-close:session")
    }).pipe(Effect.provide(f.layer))
  })
)
it.effect("a close response naming another session is not acceptance", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      f.raw("session").status = "closed"
      f.nativeState.closeWrongSession = true
      const session = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
      expect(String(yield* Effect.flip(stopNativeWriter(f.config, f.commands, f.tracker, session)))).toContain(
        "another session"
      )
    }).pipe(Effect.provide(f.layer))
  })
)
it.effect("failed-create, unknown and missing lifecycle observations reconcile through exact native close", () =>
  Effect.gen(function* () {
    for (const state of ["failed-create", "unknown", undefined]) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        f.raw("work").status = "closed"
        f.raw("session").status = "closed"
        if (state === undefined) delete f.raw("session").metadata.state
        else f.raw("session").metadata.state = state
        const session = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
        yield* stopNativeWriter(f.config, f.commands, f.tracker, session)
        expect(f.events).toContain("native-close:session")
        expect(f.raw("session").status).toBe("closed")
      }).pipe(Effect.provide(f.layer))
    }
  })
)
it.effect("a successful close response needs a fresh correlated stopped observation", () =>
  Effect.gen(function* () {
    for (const field of ["status", "node", "path", "template"] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        f.raw("work").status = "closed"
        f.raw("session").status = "closed"
        const before = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
        const execute = f.commands.execute
        f.commands.execute = (root, args, cwd, timeout, logs) =>
          execute(root, args, cwd, timeout, logs).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (!args.includes("close")) return
                const session = f.raw("session")
                if (field === "status") session.status = "open"
                else
                  session.metadata[field === "node" ? "gc.trigger_bead_id" : field === "path" ? "work_dir" : field] =
                    "foreign"
              })
            )
          )
        expect(String(yield* Effect.flip(stopNativeWriter(f.config, f.commands, f.tracker, before)))).toContain(
          "exact stopped"
        )
        expect(f.raw("work").metadata[`dalph.${nativeStopKey(before.id)}`]).toBeDefined()
      }).pipe(Effect.provide(f.layer))
    }
  })
)

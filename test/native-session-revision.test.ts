import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { nativeSession } from "../src/native/session-observation.ts"
import { nativeStopKey, stopNativeWriter } from "../src/native/session-stop.ts"
import { BeadId, BoundaryFailure } from "../src/domain/shared.ts"

const sessionId = BeadId.make("session")
const workId = BeadId.make("work")

it.effect("retained recovery checks one fresh terminal pool row and the subsequent reverse binding", () =>
  Effect.gen(function* () {
    for (const changeBinding of [false, true]) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        f.raw("session").status = "closed"
        f.raw("work").status = "in_progress"
        const before = yield* nativeSession(f.config, f.commands, sessionId)
        let sessionReads = 0
        let readsAtClose = 0
        const original = f.commands.execute
        f.commands.execute = (...args: Parameters<typeof original>) =>
          original(...args).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (args[1].includes("beads") && args[1].includes("show") && args[1].includes(sessionId)) {
                  sessionReads++
                  if (changeBinding) f.raw("work").metadata["gc.session_id"] = "foreign"
                }
                if (args[1].includes("close")) readsAtClose = sessionReads
              })
            )
          )
        const stop = stopNativeWriter(f.config, f.commands, f.tracker, before, workId, { _tag: "RetainedRecovery" })
        if (changeBinding) {
          yield* Effect.flip(stop)
          expect(f.events.filter((event) => event === "native-close:session")).toHaveLength(0)
        } else {
          yield* stop
          expect(readsAtClose).toBe(1)
          expect(f.raw("work").status).toBe("in_progress")
        }
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("stable native revision reuses close, while ABA and unavailable fences require stock close", () =>
  Effect.gen(function* () {
    for (const fault of [
      "stable",
      "replay-aba",
      "close-aba",
      "missing",
      "zero",
      "unavailable",
      "foreign",
      "binding",
      "multiple"
    ] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        f.raw("work").status = "closed"
        f.raw("session").status = "closed"
        let revision = "-8688987519789115479"
        const original = f.commands.execute
        f.commands.execute = (...args: Parameters<typeof original>) => {
          if (args[1].includes("bd") && args[1].includes("show")) {
            if (fault === "unavailable") return Effect.fail(new BoundaryFailure({ message: "read unavailable" }))
            const row = {
              ...f.raw("session"),
              id: fault === "foreign" ? "foreign" : sessionId,
              issue_type: "session",
              revision: fault === "missing" ? undefined : fault === "zero" ? "0" : revision,
              metadata: {
                ...f.raw("session").metadata,
                pool_managed: true,
                ...(fault === "binding" ? { template: "foreign" } : {})
              }
            }
            return Effect.succeed(JSON.stringify(fault === "multiple" ? [row, row] : [row]))
          }
          return original(...args).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (fault === "close-aba" && args[1].includes("close")) revision = `${revision}1`
              })
            )
          )
        }
        const before = yield* nativeSession(f.config, f.commands, sessionId)
        yield* stopNativeWriter(f.config, f.commands, f.tracker, before, workId)
        if (fault === "replay-aba") revision = "9007199254740993"
        yield* stopNativeWriter(f.config, f.commands, f.tracker, before, workId)
        expect(f.events.filter((event) => event === "native-close:session")).toHaveLength(fault === "stable" ? 1 : 2)
        const proof = f.raw("work").metadata[`dalph.${nativeStopKey(sessionId)}_stable`]
        if (fault === "stable") expect(proof).toContain("-8688987519789115479")
        if (!["stable", "replay-aba"].includes(fault)) expect(proof).toBeUndefined()
      }).pipe(Effect.provide(f.layer))
    }
  })
)

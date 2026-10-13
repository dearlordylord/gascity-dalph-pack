import { Effect, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { nativeSession } from "../src/native/session-observation.ts"
import { NativeStopObservation, nativeStopKey, stopNativeWriter } from "../src/native/session-stop.ts"
import { BeadId, BoundaryFailure } from "../src/domain/shared.ts"
import { CommandRejected } from "../src/delivery/command.ts"

const sessionId = BeadId.make("session")
const workId = BeadId.make("work")
const intentKey = `dalph.${nativeStopKey(sessionId)}`
const observationKey = `${intentKey}_observed`

it.effect("known native close still requires fresh terminal session and reverse bindings", () =>
  Effect.gen(function* () {
    for (const fault of ["status", "claim", "owner", "path", "template", "manual", "unfinished"] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        f.raw("work").status = "closed"
        f.raw("session").status = "closed"
        const before = yield* nativeSession(f.config, f.commands, sessionId)
        yield* stopNativeWriter(f.config, f.commands, f.tracker, before, workId)
        if (fault === "status") f.raw("session").status = "open"
        if (fault === "claim") f.raw("session").metadata.current_claim_bead_id = "foreign"
        if (fault === "owner") f.raw("work").metadata["gc.session_id"] = "foreign"
        if (fault === "path") f.raw("session").metadata.work_dir = "/foreign"
        if (fault === "template") f.raw("session").metadata.template = "foreign"
        if (fault === "manual") f.raw("session").metadata.manual_session = "true"
        if (fault === "unfinished") f.raw("work").status = "in_progress"
        yield* Effect.flip(stopNativeWriter(f.config, f.commands, f.tracker, before, workId))
        expect(f.events.filter((event) => event === "native-close:session")).toHaveLength(1)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("orphaned close observation cannot replace its original intent", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      f.raw("session").status = "closed"
      const before = yield* nativeSession(f.config, f.commands, sessionId)
      yield* stopNativeWriter(f.config, f.commands, f.tracker, before, workId)
      delete f.raw("work").metadata[intentKey]
      yield* stopNativeWriter(f.config, f.commands, f.tracker, before, workId)
      expect(f.events.filter((event) => event === "native-close:session")).toHaveLength(2)
      expect(f.raw("work").metadata[intentKey]).toBeDefined()
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("malformed or foreign retained close outcomes refuse without overwrite", () =>
  Effect.gen(function* () {
    for (const fault of ["malformed", "intent", "session", "response"] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        f.raw("work").status = "closed"
        f.raw("session").status = "closed"
        const before = yield* nativeSession(f.config, f.commands, sessionId)
        yield* stopNativeWriter(f.config, f.commands, f.tracker, before, workId)
        const observed = Schema.decodeUnknownSync(Schema.fromJsonString(NativeStopObservation))(
          f.raw("work").metadata[observationKey]
        )
        const corrupted =
          fault === "malformed"
            ? "{broken"
            : JSON.stringify({
                ...observed,
                intent: fault === "intent" ? { ...observed.intent, node: "foreign" } : observed.intent,
                response: {
                  ...observed.response,
                  session_id: fault === "session" ? "foreign" : observed.response.session_id,
                  ok: fault !== "response"
                }
              })
        f.raw("work").metadata[observationKey] = corrupted
        yield* Effect.flip(stopNativeWriter(f.config, f.commands, f.tracker, before, workId))
        expect(f.raw("work").metadata[observationKey]).toBe(corrupted)
        expect(f.events.filter((event) => event === "native-close:session")).toHaveLength(1)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("interruption before close observation retains intent and requires another close", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      f.raw("session").status = "closed"
      const before = yield* nativeSession(f.config, f.commands, sessionId)
      const original = f.tracker.record
      const interrupted = {
        ...f.tracker,
        record: (...args: Parameters<typeof original>) =>
          args[1].endsWith("_observed")
            ? Effect.fail(new BoundaryFailure({ message: "cut before observation" }))
            : original(...args)
      }
      yield* Effect.flip(stopNativeWriter(f.config, f.commands, interrupted, before, workId))
      expect(f.raw("work").metadata[intentKey]).toBeDefined()
      expect(f.raw("work").metadata[observationKey]).toBeUndefined()
      yield* stopNativeWriter(f.config, f.commands, f.tracker, before, workId)
      expect(f.events.filter((event) => event === "native-close:session")).toHaveLength(2)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("applied close observation with lost write response still requires current native close", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      f.raw("session").status = "closed"
      const before = yield* nativeSession(f.config, f.commands, sessionId)
      const original = f.commands.execute
      f.commands.execute = (...args: Parameters<typeof original>) =>
        original(...args).pipe(
          Effect.flatMap((result) =>
            args[1].includes(`--key=${observationKey}`)
              ? Effect.fail(
                  new CommandRejected({ message: "applied observation response lost", receipt: "/fixture/lost" })
                )
              : Effect.succeed(result)
          )
        )
      yield* stopNativeWriter(f.config, f.commands, f.tracker, before, workId)
      expect(f.raw("work").metadata[observationKey]).toBeDefined()
      yield* stopNativeWriter(f.config, f.commands, f.tracker, before, workId)
      expect(f.events.filter((event) => event === "native-close:session")).toHaveLength(2)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("reopened and reclosed session cannot reuse a historical close outcome", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      f.raw("work").status = "closed"
      f.raw("session").status = "closed"
      const before = yield* nativeSession(f.config, f.commands, sessionId)
      yield* stopNativeWriter(f.config, f.commands, f.tracker, before, workId)
      f.raw("session").status = "open"
      f.raw("session").status = "closed"
      yield* stopNativeWriter(f.config, f.commands, f.tracker, before, workId)
      expect(f.events.filter((event) => event === "native-close:session")).toHaveLength(2)
    }).pipe(Effect.provide(f.layer))
  })
)

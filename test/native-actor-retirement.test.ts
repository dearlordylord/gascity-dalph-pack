import { ConfigProvider, Effect, Layer } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import {
  acknowledgeActorRetirement,
  acknowledgeCompletedActor,
  nativeActorRetirement
} from "../src/native/actor-retirement.ts"
import { BeadId, BoundaryFailure } from "../src/domain/shared.ts"
import { RESULT } from "./helpers/workflow-fixture.ts"

it.effect("completed actors request self retirement without making acknowledgement stopped custody", () =>
  Effect.gen(function* () {
    for (const fault of ["none", "unfinished", "foreign", "token", "name", "reply", "lost"] as const) {
      const f = yield* nativeFixture
      yield* f.workflow.prepare(yield* f.row("prepare")).pipe(Effect.provide(f.layer))
      f.state.workHead = RESULT
      yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session")).pipe(Effect.provide(f.layer))
      const retained = f.raw("work").metadata["dalph.native_proposal"]
      if (fault === "unfinished") f.raw("work").status = "open"
      if (fault === "foreign") f.raw("work").metadata["gc.session_id"] = "another"
      const calls: ReadonlyArray<string>[] = []
      const commands = {
        ...f.commands,
        execute: (_root: string, args: ReadonlyArray<string>) => {
          calls.push(args)
          if (fault === "lost") return Effect.fail(new BoundaryFailure({ message: "lost native ack response" }))
          return Effect.succeed(
            JSON.stringify({
              schema_version: "1",
              ok: true,
              command: "runtime drain-ack",
              action: "drain-ack",
              session: fault === "reply" ? "foreign-runtime" : "own-runtime",
              status: "acknowledged"
            })
          )
        }
      }
      const operation = acknowledgeCompletedActor(f.config, commands, f.tracker, BeadId.make("work")).pipe(
        Effect.provide(
          Layer.merge(
            f.layer,
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                GC_SESSION_ID: "session",
                ...(fault === "name" ? {} : { GC_SESSION_NAME: "own-runtime" }),
                ...(fault === "token" ? {} : { GC_INSTANCE_TOKEN: "own-token" })
              })
            )
          )
        )
      )
      if (fault === "none" || fault === "unfinished") yield* operation
      else yield* Effect.flip(operation)
      expect(calls).toHaveLength(["unfinished", "foreign", "token", "name"].includes(fault) ? 0 : 1)
      for (const args of calls) {
        expect(nativeActorRetirement(args)).toBe(true)
        expect(args).not.toContain("--operator")
        expect(args).not.toContain("session")
      }
      expect(f.raw("work").metadata["dalph.native_proposal"]).toBe(retained)
      expect(f.raw("work").metadata["dalph.result"]).toBeUndefined()
      expect(f.events).not.toContain("native-close:session")
    }
  })
)
it.effect("strict retirement refuses an unfinished actor before any acknowledgement", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* acknowledgeActorRetirement(f.config, f.commands, f.tracker, BeadId.make("work")).pipe(
      Effect.provide(
        Layer.merge(
          f.layer,
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              GC_SESSION_ID: "session",
              GC_SESSION_NAME: "own-runtime",
              GC_INSTANCE_TOKEN: "own-token"
            })
          )
        )
      ),
      Effect.flip
    )
  })
)

it.effect("operator targets and reproduced environments cannot delegate actor self-ack custody", () =>
  Effect.sync(() => {
    expect(nativeActorRetirement(["gc", "runtime", "drain-ack", "--json"])).toBe(true)
    for (const args of [
      ["gc", "runtime", "drain-ack", "other", "--json"],
      ["gc", "runtime", "drain-ack", "--operator", "--json"],
      ["sh", "-c", "gc runtime drain-ack --json"],
      ["env", "GC_SESSION_ID=old", "gc", "runtime", "drain-ack", "--json"]
    ])
      expect(nativeActorRetirement(args)).toBe(false)
  })
)

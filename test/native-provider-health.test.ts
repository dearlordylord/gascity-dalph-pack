import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { nativeProviderHealth } from "../src/native/provider-health.ts"
import { BoundaryFailure } from "../src/domain/shared.ts"
import { CommandRejected } from "../src/delivery/command.ts"

it.effect("native provider recovery accepts exact health while its backend remains available", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    const fs = f.fs
    const requests: ReadonlyArray<string>[] = []
    let backendAvailable = false
    const execute = f.commands.execute
    const commands = {
      ...f.commands,
      execute: Effect.fn("Fixture.providerHealth")(function* (...args: Parameters<typeof execute>) {
        requests.push(args[1])
        backendAvailable = true
        if (args[4]) {
          yield* fs.writeFileString(args[4].stdout, "retained reply")
          yield* fs.writeFileString(args[4].stderr, "")
        }
        return yield* execute(...args)
      })
    }
    yield* Effect.gen(function* () {
      const response = yield* nativeProviderHealth(f.config, commands)
      expect(response.city_path).toBe(f.config.city)
      expect(backendAvailable).toBe(true)
      expect(requests).toHaveLength(1)
      expect(requests[0]).not.toContain("--rig")
      for (const marker of [
        "DALPH_BOUNDARY",
        "DALPH_ATTEMPT",
        "GC_SESSION_ID",
        "GC_SESSION_NAME",
        "GC_TMUX_SESSION",
        "GC_INSTANCE_TOKEN"
      ])
        expect(requests[0]).toContain(marker)
    }).pipe(Effect.provide(f.layer))
  })
)

for (const response of [
  "malformed",
  JSON.stringify({}),
  JSON.stringify({ schema_version: "2", ok: true, city_path: "/fixture/city", provider: "bd", status: "healthy" }),
  JSON.stringify({ schema_version: "1", ok: false, city_path: "/fixture/city", provider: "bd", status: "healthy" }),
  JSON.stringify({ schema_version: "1", ok: true, city_path: "/foreign", provider: "bd", status: "healthy" }),
  JSON.stringify({ schema_version: "1", ok: true, city_path: "/fixture/city", provider: "file", status: "healthy" }),
  JSON.stringify({ schema_version: "1", ok: true, city_path: "/fixture/city", provider: "bd", status: "unhealthy" })
]) {
  it.effect(`native health refuses unqualified response: ${response}`, () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      let calls = 0
      const commands = {
        ...f.commands,
        execute: () => {
          calls++
          return Effect.succeed(response)
        }
      }
      yield* Effect.gen(function* () {
        yield* Effect.flip(nativeProviderHealth(f.config, commands))
        expect(calls).toBe(1)
      }).pipe(Effect.provide(f.layer))
    })
  )
}

for (const failure of [
  new BoundaryFailure({ message: "health timeout" }),
  new CommandRejected({ message: "health unavailable", receipt: "retained", exit: 7 })
]) {
  it.effect(`native health preserves failed recovery without retry: ${failure._tag}`, () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      let calls = 0
      const commands = {
        ...f.commands,
        execute: () => {
          calls++
          return Effect.fail(failure)
        }
      }
      yield* Effect.gen(function* () {
        expect(yield* Effect.flip(nativeProviderHealth(f.config, commands))).toBe(failure)
        expect(calls).toBe(1)
      }).pipe(Effect.provide(f.layer))
    })
  )
}

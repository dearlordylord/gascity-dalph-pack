import { Clock, Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { nativeRuntimeHeartbeat, runtimeHeartbeat } from "../src/native/runtime-heartbeat.ts"
import { BeadId } from "../src/domain/shared.ts"

it.effect("quiet deterministic work receives one finite public native hold", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    const now = yield* Clock.currentTimeMillis
    const calls: ReadonlyArray<string>[] = []
    const commands = {
      ...f.commands,
      execute: (_root: string, args: ReadonlyArray<string>) => {
        calls.push(args)
        return Effect.succeed(
          JSON.stringify({
            schema_version: "1",
            ok: true,
            command: "runtime heartbeat",
            session: "integrator-display",
            held_until: new Date(now + 60000).toISOString()
          })
        )
      }
    }
    yield* runtimeHeartbeat(f.config, commands, BeadId.make("exact-session"), "native-integrator-session").pipe(
      Effect.provide(f.layer)
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain("GC_SESSION_ID=exact-session")
    expect(calls[0]).toContain("GC_TMUX_SESSION=native-integrator-session")
    expect(calls[0]).toContain(`GC_CITY_PATH=${f.config.city}`)
    expect(nativeRuntimeHeartbeat(calls[0] ?? [])).toBe(true)
    for (const held_until of [new Date(now).toISOString(), new Date(now + 86400000).toISOString(), "invalid"]) {
      commands.execute = () =>
        Effect.succeed(
          JSON.stringify({
            schema_version: "1",
            ok: true,
            command: "runtime heartbeat",
            session: "display",
            held_until
          })
        )
      yield* Effect.flip(
        runtimeHeartbeat(f.config, commands, BeadId.make("exact-session"), "native-integrator-session")
      ).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("only the exact bounded native timer call delegates custody", () =>
  Effect.sync(() => {
    expect(nativeRuntimeHeartbeat(["gc", "runtime", "heartbeat", "--duration=2400s", "--json"])).toBe(true)
    for (const args of [
      ["gc", "runtime", "heartbeat", "--duration=8760h", "--json"],
      ["sh", "-c", "gc", "runtime", "heartbeat", "--duration=2400s", "--json"],
      ["gc", "runtime", "heartbeat", "--duration=2400s", "--json", "extra"],
      ["env", "GC_SESSION_ID=", "gc", "runtime", "heartbeat", "--duration=2400s", "--json"],
      [
        "env",
        "-u",
        "GC_ALIAS",
        "-u",
        "GC_CITY",
        "GC_SESSION_ID=session",
        "GC_TMUX_SESSION=",
        "GC_CITY_PATH=/city",
        "gc",
        "runtime",
        "heartbeat",
        "--duration=2400s",
        "--json"
      ],
      [
        "env",
        "-u",
        "GC_ALIAS",
        "-u",
        "GC_CITY",
        "GC_SESSION_ID=session",
        "GC_TMUX_SESSION=runtime",
        "GC_CITY_PATH=relative",
        "gc",
        "runtime",
        "heartbeat",
        "--duration=2400s",
        "--json"
      ]
    ])
      expect(nativeRuntimeHeartbeat(args)).toBe(false)
  })
)

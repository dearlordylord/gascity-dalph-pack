import { Effect, FileSystem } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { nativeHookCommand } from "../src/native/hook-command.ts"
import { makeNativeCommands } from "../src/delivery/command.ts"

it.effect("only exact self-hook commands delegate claim custody to Gas City", () =>
  Effect.sync(() => {
    for (const prefix of [["gc"], ["gc", "--city", "/city", "--rig", "fixture"]]) {
      expect(nativeHookCommand([...prefix, "hook", "current", "--id-only"])).toBe(true)
      expect(nativeHookCommand([...prefix, "hook", "--claim", "--drain-ack", "--json"])).toBe(true)
    }
    for (const args of [
      [],
      ["gc"],
      ["gc", "--city", "/city"],
      ["gc", "hook", "--claim", "--json"],
      ["gc", "hook", "--claim", "--drain-ack", "--json", "foreign"],
      ["gc", "hook", "current", "--id-only", "--operator"],
      ["env", "GC_SESSION_ID=foreign", "gc", "hook", "current", "--id-only"],
      [
        "env",
        "-u",
        "DALPH_BOUNDARY",
        "-u",
        "DALPH_ATTEMPT",
        "-u",
        "GC_SESSION_ID",
        "gc",
        "hook",
        "current",
        "--id-only"
      ],
      ["sh", "-c", "gc hook --claim --drain-ack --json"]
    ])
      expect(nativeHookCommand(args)).toBe(false)
  })
)

it.live("a failed self-hook keeps native output without claiming stopped project writers", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped()
    const commands = yield* makeNativeCommands
    const failure = yield* Effect.flip(
      commands.execute(root, ["gc", "--city", `${root}/absent`, "hook", "current", "--id-only"])
    )
    expect(failure._tag).toBe("CommandRejected")
    if (failure._tag === "CommandRejected") {
      expect(yield* fs.exists(failure.receipt)).toBe(false)
      expect(yield* fs.exists(failure.receipt.replace(/\.json$/, ".stderr"))).toBe(true)
    }
    expect((yield* fs.readDirectory(`${root}/evidence/boundaries`)).filter((name) => name.endsWith(".json"))).toEqual(
      []
    )
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped)
)

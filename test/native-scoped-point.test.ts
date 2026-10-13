import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { BeadId } from "../src/domain/shared.ts"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { nativeSession } from "../src/native/session-observation.ts"
import { nativePreflight } from "../src/native/preflight.ts"

it.effect("RIG task reads select the exact native store while CITY sessions retain logical residency", () =>
  Effect.gen(function* () {
    const fixture = yield* nativeFixture
    const reads: Array<ReadonlyArray<string>> = []
    const execute = fixture.commands.execute
    fixture.commands.execute = (root, args, cwd, timeout, logs) => {
      if (args.includes("beads") && args.includes("show")) reads.push(args)
      return execute(root, args, cwd, timeout, logs)
    }
    yield* Effect.gen(function* () {
      expect((yield* fixture.tracker.bead(BeadId.make("work"))).id).toBe("work")
      expect((yield* nativeSession(fixture.config, fixture.commands, BeadId.make("session"))).id).toBe("session")
      const task = reads.find((args) => args[args.indexOf("show") + 1] === "work")
      const session = reads.find((args) => args[args.indexOf("show") + 1] === "session")
      expect(task).toContain("--store-ref=rig:fixture")
      expect(session?.some((arg) => arg.startsWith("--store-ref="))).toBe(false)
      expect(task).toContain("GC_NO_API=1")
      expect(session).toContain("GC_NO_API=1")
    }).pipe(Effect.provide(fixture.layer))
  })
)

it.effect("missing exact-store read capability refuses before native task or resource effects", () =>
  Effect.gen(function* () {
    const fixture = yield* nativeFixture
    fixture.nativeState.scopedPointReads = false
    const failure = yield* Effect.flip(nativePreflight(fixture.config, fixture.contract, fixture.commands)).pipe(
      Effect.provide(fixture.layer)
    )
    expect(String(failure)).toContain("exact-store read")
    expect(fixture.events).not.toContain("native-cook")
    expect(fixture.paths.size).toBe(0)
    expect(fixture.raw("work").metadata["dalph.native_attempt"]).toBeUndefined()
  })
)

import { Effect, Exit } from "effect"
import { expect, it } from "@effect/vitest"
import { cleanupNativeFixture } from "./helpers/native-city-cleanup.ts"
import { CommandFailure } from "../src/quality/command.ts"

for (const fault of ["none", "city", "supervisor", "history", "rig-provider", "city-provider"]) {
  it.effect(`fixture cleanup ${fault} failure still joins both exact provider stops`, () =>
    Effect.gen(function* () {
      const city = "/owned-fixture/city"
      const calls: string[] = []
      const outcome = yield* cleanupNativeFixture((args) => {
        expect(args[0]).toBe("gc")
        const stage =
          args[1] === "supervisor"
            ? "supervisor"
            : args.at(-1) === "commit"
              ? "history"
              : args.includes("bd")
                ? args.includes("--rig")
                  ? "rig-provider"
                  : "city-provider"
                : "city"
        if (stage !== "supervisor") expect(args.slice(1, 3)).toEqual(["--city", city])
        calls.push(stage)
        return stage === fault
          ? Effect.fail(new CommandFailure({ command: "gc", message: `controlled ${stage} rejection` }))
          : Effect.succeed("stopped")
      }, city).pipe(Effect.exit)
      expect(Exit.isSuccess(outcome)).toBe(fault === "none")
      expect(calls.slice(0, 2)).toEqual(["city", "supervisor"])
      expect(calls.filter((stage) => stage.endsWith("provider"))).toEqual(["rig-provider", "city-provider"])
      if (fault === "city" || fault === "supervisor") expect(calls).not.toContain("history")
      else expect(calls.slice(0, 3)).toEqual(["city", "supervisor", "history"])
    })
  )
}

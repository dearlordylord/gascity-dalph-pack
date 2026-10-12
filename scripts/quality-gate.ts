import { Clock, Console, Duration, Effect, FileSystem } from "effect"
import { runCommand } from "../src/quality/command.ts"
import { BoundaryFailure } from "../src/domain/shared.ts"

const MILLISECONDS_PER_SECOND = 1000
const FAST_SECONDS = 60
const FULL_SECONDS = 600
const DISPLAY_DECIMALS = 2
const stages = [
  "verify:effect-cohort",
  "build",
  "typecheck",
  "verify:schema-boundaries",
  "circular",
  "complexity",
  "lint",
  "test:coverage",
  "example:typecheck",
  "example:test",
  "example:oracle"
]

/** One deadline covers every stage and interrupts the owned child on expiry. */
export const makeQualityGate =
  (execute: typeof runCommand, directory: string) =>
  (mode: "fast" | "all", onOutput: (stream: "stdout" | "stderr", text: string) => void) => {
    const budget = Duration.seconds(mode === "fast" ? FAST_SECONDS : FULL_SECONDS)
    const selected = mode === "all" ? [...stages, "test:native"] : stages
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const fence = `${directory}/full-incomplete.json`
      if (mode === "all") {
        yield* fs.makeDirectory(directory, { recursive: true })
        if (yield* fs.exists(fence))
          return yield* new BoundaryFailure({
            message:
              "Previous full run has unproven native custody; reconcile its exact cities before removing .quality/full-incomplete.json"
          })
        const started = new Date(yield* Clock.currentTimeMillis).toISOString()
        const day = started.split("T")[0]
        yield* fs.writeFileString(`${directory}/full-${day}.started`, started, { flag: "wx" })
        yield* fs.writeFileString(
          fence,
          JSON.stringify({
            started,
            budgetSeconds: FULL_SECONDS,
            custody: "unproven until successful completion; retain native fixture logs"
          }),
          { flag: "wx" }
        )
      }
      for (const stage of selected) {
        const started = yield* Clock.currentTimeMillis
        yield* Console.log(`Checking ${stage}`)
        yield* execute({ executable: "pnpm", args: [stage], timeout: budget, onOutput })
        const elapsed = (yield* Clock.currentTimeMillis) - started
        yield* Console.log(`Passed ${stage} in ${(elapsed / MILLISECONDS_PER_SECOND).toFixed(DISPLAY_DECIMALS)}s`)
      }
      if (mode === "all") yield* fs.remove(fence)
    }).pipe(Effect.timeout(budget))
  }

export const qualityGate = makeQualityGate(runCommand, ".quality")

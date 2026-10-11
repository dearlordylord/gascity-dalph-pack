import { Console, Duration, Effect } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import { runCommand } from "../src/quality/command.ts"

const STAGE_TIMEOUT_MINUTES = 10
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
const main = Effect.gen(function* () {
  for (const stage of stages) {
    yield* Console.log(`Checking ${stage}`)
    const result = yield* runCommand({
      executable: "pnpm",
      args: [stage],
      timeout: Duration.minutes(STAGE_TIMEOUT_MINUTES)
    })
    yield* Console.log(result.stdout.trim())
  }
})
NodeRuntime.runMain(main)

import { Console, Duration, Effect } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import { runCommand } from "../src/quality/command.ts"

const STAGE_TIMEOUT_MINUTES = 10
// The serial native fixture suite has independently bounded review and recovery cases.
const NATIVE_COVERAGE_TIMEOUT_MINUTES = 160
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
      timeout: Duration.minutes(stage === "test:coverage" ? NATIVE_COVERAGE_TIMEOUT_MINUTES : STAGE_TIMEOUT_MINUTES)
    })
    yield* Console.log(result.stdout.trim())
  }
})
NodeRuntime.runMain(main)

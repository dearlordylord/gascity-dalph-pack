import { type Cause, Effect, Result } from "effect"
import type { CommandFailure } from "../../src/quality/command.ts"
import { BoundaryFailure } from "../../src/domain/shared.ts"

type Execute = (
  args: ReadonlyArray<string>,
  cwd?: string,
  seconds?: number
) => Effect.Effect<string, CommandFailure | Cause.TimeoutError>

/** Failed setup or shutdown retains evidence but still stops both owned providers. */
export const cleanupNativeFixture = Effect.fn("NativeFixture.cleanup")(function* (execute: Execute, city: string) {
  yield* Effect.gen(function* () {
    const cityStop = yield* execute(["gc", "--city", city, "stop"], undefined, 15).pipe(Effect.result)
    const supervisorStop = yield* execute(["gc", "supervisor", "stop", "--wait"], undefined, 15).pipe(Effect.result)
    const failedStops = [cityStop, supervisorStop].filter(Result.isFailure)
    if (failedStops.length > 0)
      return yield* new BoundaryFailure({ message: failedStops.map((stop) => stop.failure.message).join("; ") })
    // Flush version history only after task writers and the supervisor stopped.
    yield* execute(["gc", "--city", city, "--rig", "fixture", "bd", "dolt", "commit"], undefined, 10)
  }).pipe(
    Effect.ensuring(
      Effect.gen(function* () {
        const stops = yield* Effect.all(
          [
            execute(["gc", "--city", city, "--rig", "fixture", "bd", "dolt", "stop"], undefined, 10).pipe(
              Effect.result
            ),
            execute(["gc", "--city", city, "bd", "dolt", "stop"], undefined, 10).pipe(Effect.result)
          ],
          { concurrency: 2 }
        )
        const failures = stops.filter(Result.isFailure)
        if (failures.length > 0)
          return yield* new BoundaryFailure({ message: failures.map((stop) => stop.failure.message).join("; ") })
      }).pipe(Effect.orDie)
    )
  )
})

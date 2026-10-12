import { Effect, Schedule, Schema } from "effect"
import { BoundaryFailure, type BeadId } from "../domain/shared.ts"
import type { Commands } from "../delivery/tracker.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import { NativeSessionPending } from "./contract.ts"
import { ephemeralPoolSession } from "./pool-policy.ts"
import { nativeSession } from "./session-observation.ts"

/** GC owns retirement; the pack may only close a terminal ephemeral pool row. */
export const retiredPoolSession = Effect.fn("Native.retiredPoolSession")(function* (
  config: RuntimeConfig,
  commands: Commands,
  id: BeadId
) {
  const current = yield* nativeSession(config, commands, id)
  if (!ephemeralPoolSession(current))
    return yield* new BoundaryFailure({
      message: "native writer retirement requires an ephemeral unnamed pool session"
    })
  if (current.status !== "closed")
    return yield* new NativeSessionPending({
      message: "native pool producer retirement is pending; retain its attempt"
    })
  return current
})

/** A bounded observation only; timeout retains the attempt for public resume. */
export const waitForNativeRetirement = <A, E, R>(observation: Effect.Effect<A, E, R>) =>
  observation.pipe(
    Effect.retry({ schedule: Schedule.spaced("1 second"), while: Schema.is(NativeSessionPending) }),
    Effect.timeout("45 seconds"),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail(
        new NativeSessionPending({ message: "native retirement observation deadline expired; retain its attempt" })
      )
    )
  )

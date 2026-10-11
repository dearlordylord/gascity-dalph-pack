import { Effect, Ref, Schema } from "effect"
import { Plan } from "../domain/attempt.ts"
import { BirthTicks, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands } from "../delivery/tracker.ts"
import { markedProcesses } from "../delivery/process-observation.ts"
import { nativeRows } from "./identity.ts"
import { NativeAttempt } from "./contract.ts"

/** A released runtime lock does not release an escaped native integration writer. */
export const integrationCustody = Effect.fn("Native.integrationCustody")(function* (
  config: RuntimeConfig,
  commands: Commands
) {
  const rows = yield* nativeRows(config, commands)
  for (const row of rows) {
    for (const field of ["dalph.candidate_plan", "dalph.native_attempt"]) {
      const raw = row.metadata?.[field]
      if (!raw) continue
      const plan =
        field === "dalph.candidate_plan"
          ? yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Plan))(raw)
          : (yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeAttempt))(raw)).plan
      yield* Ref.set(commands.current, plan.attempt)
      yield* commands.reconcile(config.root, plan.attempt)
      if ((yield* markedProcesses(`DALPH_ATTEMPT=${plan.attempt}`, BirthTicks.make(1), commands.owner)).length)
        return yield* new BoundaryFailure({ message: "retained native writers occupy integration custody" })
    }
  }
  return yield* Effect.void
})

import { Effect, Ref, Schema } from "effect"
import { Plan } from "../domain/attempt.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands } from "../delivery/tracker.ts"
import { nativeRows } from "./identity.ts"
import { NativeAttempt } from "./contract.ts"

/** Reconcile retained command outcomes before acquiring the serialized integration boundary. */
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
    }
  }
  return yield* Effect.void
})

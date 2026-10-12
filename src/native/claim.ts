import { Effect, FileSystem, Schema } from "effect"
import { Plan } from "../domain/attempt.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands, makeTracker } from "../delivery/tracker.ts"

const Quiescent = Schema.Struct({ action: Schema.Literals(["idle", "drain"]), reason: Schema.String })
const Hook = Schema.Union([Schema.Struct({ action: Schema.Literal("work"), bead_id: Plan.fields.bead }), Quiescent])
export const nativeClaim = Effect.fn("Native.claim")(function* (
  config: RuntimeConfig,
  commands: Commands,
  tracker: ReturnType<typeof makeTracker>
) {
  const current = yield* commands.execute(config.root, [...tracker.gc, "hook", "current", "--id-only"]).pipe(
    Effect.map((bead_id) => ({ action: "work", bead_id })),
    Effect.catchTag("CommandRejected", () =>
      commands.execute(config.root, [...tracker.gc, "hook", "--claim", "--drain-ack", "--json"]).pipe(
        Effect.catchTag("CommandRejected", (error) =>
          Effect.gen(function* () {
            if (error.exit !== 1) return yield* Effect.fail(error)
            const fs = yield* FileSystem.FileSystem
            const source = yield* fs.readFileString(error.receipt.replace(/\.json$/, ".stdout"))
            yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Quiescent))(source)
            return source
          })
        ),
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Hook)))
      )
    )
  )
  if (current.action !== "work") return null
  return { action: "work" as const, bead_id: yield* Schema.decodeUnknownEffect(Plan.fields.bead)(current.bead_id) }
})

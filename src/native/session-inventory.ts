import { Effect, Schema } from "effect"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands } from "../delivery/tracker.ts"
import { nativeSession } from "./session-observation.ts"

const Inventory = Schema.Struct({
  sessions: Schema.Array(Schema.Struct({ id: BeadId, template: Schema.String, closed: Schema.Boolean }))
})

/** Bounds independent native observations/reconciliation, never project attempts. */
export const NativeSessionBoundaryConcurrency = 4

export const nativeWriterInventory = Effect.fn("Native.writerInventory")(function* (
  config: RuntimeConfig,
  commands: Commands,
  required: ReadonlyArray<BeadId>
) {
  const inventory = yield* commands
    .execute(config.root, ["gc", "--city", config.city, "session", "list", "--state", "all", "--json"])
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Inventory))))
  const entries = new Map<typeof BeadId.Type, (typeof Inventory.Type)["sessions"][number]>()
  for (const entry of inventory.sessions) {
    const prior = entries.get(entry.id)
    if (prior && (prior.template !== entry.template || prior.closed !== entry.closed))
      return yield* new BoundaryFailure({ message: "native writer inventory has contradictory duplicate identities" })
    entries.set(entry.id, entry)
  }
  // Stock listing omits closed sessions. Read known writers by exact public ID.
  const missing = yield* Effect.forEach(
    [...new Set(required)].filter((id) => !entries.has(id)),
    (id) =>
      Effect.gen(function* () {
        const session = yield* nativeSession(config, commands, id)
        if (session.status !== "closed")
          return yield* new BoundaryFailure({ message: "native writer inventory is incomplete; open writer omitted" })
        return { id, template: session.metadata.template ?? "", closed: true }
      }),
    { concurrency: NativeSessionBoundaryConcurrency }
  )
  return [...entries.values(), ...missing]
})

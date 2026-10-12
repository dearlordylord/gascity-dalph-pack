import { Effect, Schema } from "effect"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands } from "../delivery/tracker.ts"
import { nativeSession } from "./session-observation.ts"

const Inventory = Schema.Struct({
  sessions: Schema.Array(Schema.Struct({ id: BeadId, template: Schema.String, closed: Schema.Boolean }))
})

export const nativeWriterInventory = Effect.fn("Native.writerInventory")(function* (
  config: RuntimeConfig,
  commands: Commands,
  required: ReadonlyArray<BeadId>
) {
  const inventory = yield* commands
    .execute(config.root, ["gc", "--city", config.city, "session", "list", "--state", "all", "--json"])
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Inventory))))
  const entries = [...inventory.sessions]
  // Stock listing omits closed sessions. Read known writers by exact public ID.
  for (const id of new Set(required)) {
    if (entries.some((entry) => entry.id === id)) continue
    const session = yield* nativeSession(config, commands, id)
    if (session.status !== "closed")
      return yield* new BoundaryFailure({ message: "native writer inventory is incomplete; open writer omitted" })
    entries.push({ id, template: session.metadata.template ?? "", closed: true })
  }
  return entries
})

import { Effect, Schema } from "effect"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands } from "../delivery/tracker.ts"
import { nativeSession } from "./session-observation.ts"

const Inventory = Schema.Struct({
  sessions: Schema.Array(Schema.Struct({ id: BeadId, template: Schema.String, closed: Schema.Boolean }))
})
/** Listing membership and omitted required identity are distinct observations, not custody proof. */
export type NativeWriterCandidate =
  | ((typeof Inventory.Type)["sessions"][number] & { readonly _tag: "Listed" })
  | { readonly _tag: "RequiredMissing"; readonly id: typeof BeadId.Type }

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
  // Stock listing omits closed sessions. The consumer resolves each exact ID
  // once at its correlation boundary, including the omitted-open refusal.
  const missing = [...new Set(required)].filter((id) => !entries.has(id))
  return [
    ...[...entries.values()].map((entry) => ({ ...entry, _tag: "Listed" as const })),
    ...missing.map((id) => ({ id, _tag: "RequiredMissing" as const }))
  ]
})

/** Fresh exact resolution, never a retained listing snapshot. */
export const resolveNativeWriter = Effect.fn("Native.resolveWriter")(function* (
  config: RuntimeConfig,
  commands: Commands,
  entry: NativeWriterCandidate
) {
  const session = yield* nativeSession(config, commands, entry.id)
  if (entry._tag === "RequiredMissing" && session.status !== "closed")
    return yield* new BoundaryFailure({ message: "native writer inventory is incomplete; open writer omitted" })
  return session
})

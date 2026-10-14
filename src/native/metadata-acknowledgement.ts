import { Effect, Schema } from "effect"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"

/** Gas City's durable response to the exact value-CAS invocation. */
const MetadataAcknowledgement = Schema.Struct({
  schema_version: Schema.Literal("1"),
  ok: Schema.Literal(true),
  bead_id: BeadId,
  store_ref: Schema.String,
  key: Schema.String,
  outcome: Schema.Literals(["swapped", "already_next", "conflict"])
})

export const acknowledgeNativeMetadataOutcome = Effect.fn("Native.acknowledgeMetadataOutcome")(function* (
  response: string,
  bead: BeadId,
  store: string,
  key: string
) {
  const receipt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(MetadataAcknowledgement))(response)
  if (receipt.bead_id !== bead || receipt.store_ref !== store || receipt.key !== key)
    return yield* new BoundaryFailure({ message: "native metadata acknowledgement names another bead, store or key" })
  if (receipt.outcome === "conflict")
    return yield* new BoundaryFailure({ message: `contradictory durable metadata: ${key}` })
  return receipt.outcome
})

export const acknowledgeNativeMetadata = Effect.fn("Native.acknowledgeMetadata")(
  (response: string, bead: BeadId, store: string, key: string) =>
    acknowledgeNativeMetadataOutcome(response, bead, store, key).pipe(Effect.asVoid)
)

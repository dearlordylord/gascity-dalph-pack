import { Effect, Schema } from "effect"
import type { Bead } from "../delivery/tracker.ts"

/** Decode an immutable CAS fact from the exact row of this invocation's fresh native group. */
export const retainedFact = <A>(row: Bead, key: string, schema: Schema.ConstraintDecoder<A, never>) => {
  const encoded = row.metadata?.[`dalph.${key}`]
  return encoded ? Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(encoded) : Effect.succeed(null)
}

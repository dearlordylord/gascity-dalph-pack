import { Duration, Effect, Schema } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as Request from "effect/http/HttpClientRequest"
import * as Response from "effect/http/HttpClientResponse"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "./config.ts"
import { canonical } from "./files.ts"
import type { makeCommands } from "./command.ts"

export const Bead = Schema.Struct({
  id: BeadId,
  status: Schema.String,
  description: Schema.optionalKey(Schema.String),
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.String))
})
export type Bead = typeof Bead.Type
export type Commands = Effect.Success<typeof makeCommands>
const BOUNDARY_SECONDS = 60
const Status = Schema.Struct({ status: Schema.String })

export const makeTracker = (config: RuntimeConfig, commands: Commands) => {
  const gc = ["gc", "--city", config.city, "--rig", config.rig]
  const bead = Effect.fn("Tracker.readBead")(function* (id: BeadId) {
    const rows = yield* commands
      .execute(config.root, ["bd", "-C", config.repo, "show", id, "--json"])
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Bead)))))
    const current = rows[0]
    if (rows.length !== 1 || current?.id !== id)
      return yield* new BoundaryFailure({ message: "tracker did not return the exact bead" })
    return current
  })
  const fact = <A>(id: BeadId, key: string, schema: Schema.ConstraintDecoder<A, never>) =>
    Effect.gen(function* () {
      const encoded = (yield* bead(id)).metadata?.[`dalph.${key}`]
      return encoded ? yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(encoded) : null
    })
  const record = Effect.fn("Tracker.recordFact")(function* (id: BeadId, key: string, value: Schema.JsonObject) {
    const encoded = canonical(value)
    const current = (yield* bead(id)).metadata?.[`dalph.${key}`]
    if (current) {
      if (current !== encoded) return yield* new BoundaryFailure({ message: `contradictory durable fact: ${key}` })
      return
    }
    yield* commands.execute(
      config.root,
      [
        ...gc,
        "beads",
        "metadata-cas",
        id,
        `--store-ref=rig:${config.rig}`,
        `--key=dalph.${key}`,
        "--expected=",
        `--next=${encoded}`,
        "--json"
      ],
      undefined,
      Duration.seconds(BOUNDARY_SECONDS)
    )
    if ((yield* bead(id)).metadata?.[`dalph.${key}`] !== encoded)
      return yield* new BoundaryFailure({ message: `durable fact not acknowledged: ${key}` })
  })
  const close = Effect.fn("Tracker.close")(function* (id: BeadId, reason: string) {
    yield* record(id, "close_intent", { reason })
    if ((yield* bead(id)).status !== "closed") {
      const client = yield* HttpClient.HttpClient
      const url = `${config.endpoint}/v0/city/${encodeURIComponent(config.cityName)}/bead/${encodeURIComponent(id)}/close`
      yield* Request.post(url).pipe(
        Request.setHeader("X-GC-Request", "1"),
        Request.bodyJson({ reason }),
        Effect.flatMap(client.execute),
        Effect.flatMap(Response.filterStatusOk),
        Effect.flatMap(Response.schemaBodyJson(Status)),
        Effect.timeout(`${BOUNDARY_SECONDS} seconds`),
        Effect.catch((error) =>
          Effect.gen(function* () {
            if ((yield* bead(id)).status !== "closed") return yield* Effect.fail(error)
          })
        )
      )
    }
    if ((yield* bead(id)).status !== "closed")
      return yield* new BoundaryFailure({ message: "tracker completion not observed" })
  })
  return { gc, bead, fact, record, close }
}

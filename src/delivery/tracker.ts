import { Duration, Effect, Schema } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as Request from "effect/http/HttpClientRequest"
import * as Response from "effect/http/HttpClientResponse"
import { type BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "./config.ts"
import { canonical } from "./files.ts"
import { Bead, Claim, verifyCity } from "./tracker-observation.ts"
import type { makeCommands } from "./command.ts"

export { Bead } from "./tracker-observation.ts"
export type Commands = Effect.Success<typeof makeCommands>
const BOUNDARY_SECONDS = 60
const CLAIM_SECONDS = 120
const Status = Schema.Struct({ status: Schema.String })

export const makeTracker = (config: RuntimeConfig, commands: Commands) => {
  const gc = ["gc", "--city", config.city, "--rig", config.rig]
  const bead = Effect.fn("Tracker.readBead")(function* (id: BeadId) {
    const snapshots = yield* Effect.forEach(
      ["open", "in_progress", "blocked", "closed"],
      (status) =>
        commands
          .execute(
            config.root,
            [...gc, "ready", "--status", status, "--limit", "0", "--json"],
            undefined,
            Duration.seconds(BOUNDARY_SECONDS)
          )
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Bead))))),
      { concurrency: 4 }
    )
    const rows = snapshots.flat()
    const matches = rows.filter((row) => row.id === id)
    const current = matches[0]
    if (matches.length !== 1 || !current || (current._cache_age_s ?? 0) > 0)
      return yield* new BoundaryFailure({ message: "tracker did not return one fresh exact bead" })
    if (current.metadata?.["gc.root_store_ref"] !== `rig:${config.rig}`)
      return yield* new BoundaryFailure({ message: "tracker task has foreign or missing native store scope" })
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
    const reconciled = yield* commands
      .execute(
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
      .pipe(
        Effect.as(false),
        Effect.catch((error) =>
          Effect.gen(function* () {
            const observed = yield* bead(id)
            if (error._tag !== "CommandRejected" || observed.metadata?.[`dalph.${key}`] !== encoded)
              return yield* Effect.fail(error)
            return true
          })
        )
      )
    if (reconciled) return
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
  const claim = Effect.fn("Tracker.claim")(function* () {
    yield* commands
      .execute(config.root, [...gc, "config", "show"])
      .pipe(Effect.flatMap((text) => verifyCity(config, text)))
    return yield* commands
      .execute(
        config.root,
        [...gc, "hook", "--claim", "--drain-ack", "--json"],
        undefined,
        Duration.seconds(CLAIM_SECONDS)
      )
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Claim))))
  })
  return { gc, bead, fact, record, close, claim }
}

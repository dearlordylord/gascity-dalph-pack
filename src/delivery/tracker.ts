import { Duration, Effect, Schedule, Schema } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as Request from "effect/http/HttpClientRequest"
import * as Response from "effect/http/HttpClientResponse"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "./config.ts"
import { nativeTrackerArgs } from "../native/tracker-command.ts"
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
const ACK_OBSERVATIONS = 10
const Status = Schema.Struct({ status: Schema.String })

export const makeTracker = (config: RuntimeConfig, commands: Commands, nativeClient?: HttpClient.HttpClient) => {
  const gc = ["gc", "--city", config.city, "--rig", config.rig]
  const trackerArgs = (args: ReadonlyArray<string>) =>
    config.executionVersion === "native-v1" ? nativeTrackerArgs(args) : args
  const bead = Effect.fn("Tracker.readBead")(function* (id: BeadId) {
    if (config.executionVersion === "native-v1") {
      if (!nativeClient)
        return yield* new BoundaryFailure({ message: "native tracker requires its scoped HTTP client" })
      // Bypass the native supervisor's derived cache for immutable custody and acceptance facts.
      const current = yield* commands
        .execute(config.root, trackerArgs(["env", "GC_NO_API=1", ...gc, "beads", "show", id, "--format=json"]))
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Bead))))
      if (current.id !== id) return yield* new BoundaryFailure({ message: "tracker did not return the exact bead" })
      return current
    }
    const rows = yield* commands
      .execute(config.root, ["bd", "-C", config.repo, "show", id, "--json"])
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Bead)))))
    const current = rows[0]
    if (rows.length !== 1 || current?.id !== id)
      return yield* new BoundaryFailure({ message: "tracker did not return the exact bead" })
    return current
  })
  const acknowledgedBead = Effect.fn("Tracker.acknowledgedBead")(function* (id: BeadId) {
    if (config.executionVersion !== "native-v1") return yield* bead(id)
    const current = yield* commands
      .execute(config.root, trackerArgs(["env", "GC_NO_API=1", ...gc, "beads", "show", id, "--format=json"]))
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Bead))))
    if (current.id !== id)
      return yield* new BoundaryFailure({ message: "tracker acknowledgement returned another bead" })
    return current
  })
  const acknowledge = Effect.fn("Tracker.acknowledge")(function* (id: BeadId, key: string, value: string) {
    const message = `durable metadata not acknowledged: ${key}`
    const observe = acknowledgedBead(id).pipe(
      Effect.flatMap((current) =>
        current.metadata?.[key] === value ? Effect.void : Effect.fail(new BoundaryFailure({ message }))
      )
    )
    yield* config.executionVersion === "native-v1"
      ? observe.pipe(
          Effect.retry({
            schedule: Schedule.recurs(ACK_OBSERVATIONS),
            while: (error) => error._tag === "BoundaryFailure" && error.message === message
          })
        )
      : observe
  })
  const metadata = Effect.fn("Tracker.metadata")(function* (id: BeadId, key: string, value: string) {
    const current = (yield* bead(id)).metadata?.[key]
    if (current === value) return
    if (current !== undefined) return yield* new BoundaryFailure({ message: `contradictory durable metadata: ${key}` })
    yield* commands.execute(
      config.root,
      trackerArgs([
        ...gc,
        "beads",
        "metadata-cas",
        id,
        `--store-ref=rig:${config.rig}`,
        `--key=${key}`,
        "--expected=",
        `--next=${value}`,
        "--json"
      ])
    )
    yield* acknowledge(id, key, value)
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
      trackerArgs([
        ...gc,
        "beads",
        "metadata-cas",
        id,
        `--store-ref=rig:${config.rig}`,
        `--key=dalph.${key}`,
        "--expected=",
        `--next=${encoded}`,
        "--json"
      ]),
      undefined,
      Duration.seconds(BOUNDARY_SECONDS)
    )
    yield* acknowledge(id, `dalph.${key}`, encoded)
  })
  const close = Effect.fn("Tracker.close")(function* (id: BeadId, reason: string) {
    yield* record(id, "close_intent", { reason })
    if ((yield* bead(id)).status !== "closed") {
      const client = nativeClient ?? (yield* HttpClient.HttpClient)
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
  return { gc, bead, fact, record, close, metadata }
}

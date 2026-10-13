import { Effect, Schema } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as Request from "effect/http/HttpClientRequest"
import * as Response from "effect/http/HttpClientResponse"
import { type BeadId, BoundaryFailure } from "../domain/shared.ts"
import { NativeLocalStoreLocator } from "./store-locator.ts"
import { Bead } from "../delivery/tracker-observation.ts"
import type { RuntimeConfig } from "../delivery/config.ts"

/** Opaque signed backend revision; equality only, never JSON-number conversion. */
const NativeBeadRevision = Schema.String.check(Schema.isPattern(/^-?[1-9][0-9]*$/)).pipe(
  Schema.brand("NativeBeadRevision")
)
const scoped = { schema_version: Schema.Literal("1"), ok: Schema.Literal(true), store_ref: NativeLocalStoreLocator }
const Point = Schema.Struct({ ...scoped, bead: Bead, revision: NativeBeadRevision })
const Rows = Schema.Struct({ ...scoped, beads: Schema.Array(Bead) })
const Capability = Schema.Struct({
  ...scoped,
  capability: Schema.Literal("exact-live-beads-v1"),
  supported: Schema.Literal(true)
})
const url = (config: RuntimeConfig, path: string) =>
  `${config.endpoint}/v0/city/${encodeURIComponent(config.cityName)}/${path}`
const exactScope = Effect.fn("Native.exactReadScope")(function* (config: RuntimeConfig, store: string) {
  if (store !== `rig:${config.rig}`)
    return yield* new BoundaryFailure({ message: "native live read names another store" })
})
const get = (config: RuntimeConfig, client: HttpClient.HttpClient, path: string) =>
  Request.get(url(config, path)).pipe(
    Request.setUrlParam("store_ref", `rig:${config.rig}`),
    client.execute,
    Effect.flatMap(Response.filterStatusOk)
  )
export const nativeScopedReadCapability = Effect.fn("Native.scopedReadCapability")(function* (config: RuntimeConfig) {
  const client = yield* HttpClient.HttpClient
  const receipt = yield* get(config, client, "scoped-read-capability").pipe(
    Effect.flatMap(Response.schemaBodyJson(Capability)),
    Effect.timeout("30 seconds"),
    Effect.mapError(
      (error) => new BoundaryFailure({ message: `native exact-store read capability unavailable: ${String(error)}` })
    )
  )
  yield* exactScope(config, receipt.store_ref)
})
export const nativeLiveBead = Effect.fn("Native.liveBead")(function* (
  config: RuntimeConfig,
  client: HttpClient.HttpClient,
  id: BeadId
) {
  const receipt = yield* get(config, client, `bead/${encodeURIComponent(id)}/read-exact`).pipe(
    Effect.flatMap(Response.schemaBodyJson(Point)),
    Effect.timeout("30 seconds")
  )
  yield* exactScope(config, receipt.store_ref)
  if (receipt.bead.id !== id || (receipt.bead._cache_age_s ?? 0) > 0)
    return yield* new BoundaryFailure({ message: "native live read did not return the fresh exact bead" })
  return receipt.bead
})
export const nativeLiveRows = Effect.fn("Native.liveRows")(function* (config: RuntimeConfig) {
  const client = yield* HttpClient.HttpClient
  const receipt = yield* get(config, client, "beads/read-exact").pipe(
    Effect.flatMap(Response.schemaBodyJson(Rows)),
    Effect.timeout("30 seconds")
  )
  yield* exactScope(config, receipt.store_ref)
  if (receipt.beads.some((bead) => (bead._cache_age_s ?? 0) > 0))
    return yield* new BoundaryFailure({ message: "native live list returned cached rows" })
  return receipt.beads
})

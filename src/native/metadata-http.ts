import { Effect, Schema } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as Request from "effect/http/HttpClientRequest"
import * as Response from "effect/http/HttpClientResponse"
import { type BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"

/** An exact local CITY/RIG locator, never a cross-store search request. */
const StoreLocator = Schema.String.check(Schema.isPattern(/^(city|rig):[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/)).pipe(
  Schema.brand("MetadataStoreLocator")
)
/** Native metadata keys follow the public Beads grammar. */
const MetadataKey = Schema.String.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9_.]{0,255}$/)).pipe(
  Schema.brand("NativeMetadataKey")
)
export const MetadataCASRequest = Schema.Struct({
  store_ref: StoreLocator,
  key: MetadataKey,
  expected: Schema.String,
  next: Schema.String
})
/** Transport or server failure can follow an applied write; it never grants retry. */
export class NativeMetadataRequestFailed extends Schema.TaggedError<NativeMetadataRequestFailed>()(
  "NativeMetadataRequestFailed",
  { message: Schema.String }
) {}
const Capability = Schema.Struct({
  schema_version: Schema.Literal("1"),
  ok: Schema.Literal(true),
  store_ref: StoreLocator,
  capability: Schema.Literal("metadata-value-cas-v1"),
  supported: Schema.Literal(true)
})
const SERVER_ERROR = 500
const NOT_IMPLEMENTED = 501
const cityUrl = (config: RuntimeConfig) => `${config.endpoint}/v0/city/${encodeURIComponent(config.cityName)}`
export const nativeMetadataCapability = Effect.fn("Native.metadataCapability")(function* (config: RuntimeConfig) {
  const client = yield* HttpClient.HttpClient
  const response = yield* Request.get(`${cityUrl(config)}/metadata-cas-capability`).pipe(
    Request.setUrlParam("store_ref", `rig:${config.rig}`),
    client.execute,
    Effect.flatMap(Response.filterStatusOk),
    Effect.flatMap(Response.schemaBodyJson(Capability)),
    Effect.timeout("30 seconds")
  )
  if (response.store_ref !== `rig:${config.rig}`)
    return yield* new BoundaryFailure({ message: "native metadata capability names another store" })
})
export const nativeMetadataCAS = Effect.fn("Native.metadataCAS")(function* (
  config: RuntimeConfig,
  client: HttpClient.HttpClient,
  id: BeadId,
  key: string,
  next: string
) {
  const body = yield* Schema.decodeUnknownEffect(MetadataCASRequest)({
    store_ref: `rig:${config.rig}`,
    key,
    expected: "",
    next
  })
  const request = yield* Request.post(`${cityUrl(config)}/bead/${encodeURIComponent(id)}/metadata-cas`).pipe(
    Request.setHeader("X-GC-Request", "1"),
    Request.schemaBodyJson(MetadataCASRequest)(body)
  )
  return yield* Effect.gen(function* () {
    const response = yield* client
      .execute(request)
      .pipe(Effect.mapError((error) => new NativeMetadataRequestFailed({ message: String(error) })))
    // Unsupported and throttled operations remain refusals; other server errors
    // may follow a committed mutation and require exact-value reconciliation.
    if (response.status >= SERVER_ERROR && response.status !== NOT_IMPLEMENTED) {
      const detail = yield* response.text.pipe(Effect.catch(() => Effect.succeed("response body unavailable")))
      return yield* new NativeMetadataRequestFailed({
        message: `metadata CAS returned HTTP ${response.status}: ${detail}`
      })
    }
    yield* Response.filterStatusOk(response)
    return yield* response.text.pipe(
      Effect.mapError((error) => new NativeMetadataRequestFailed({ message: String(error) }))
    )
  }).pipe(
    Effect.timeout("60 seconds"),
    Effect.catchTag("TimeoutError", (error) => Effect.fail(new NativeMetadataRequestFailed({ message: String(error) })))
  )
})

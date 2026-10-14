import { Effect } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as Request from "effect/http/HttpClientRequest"
import * as Response from "effect/http/HttpClientResponse"
import { BoundaryFailure } from "../domain/shared.ts"
import { RunDetail } from "./run.ts"
import { ProductBeadsResponse, productFrame } from "./product.ts"

/** Both authoritative reads must succeed before publishing a new UI frame. */
export const readProductDetail = Effect.fn("Dashboard.readProductDetail")(function* (upstream: string, path: string) {
  const url = new URL(path, upstream)
  const segments = url.pathname.split("/")
  const city = segments[3]
  const scope = url.searchParams.get("scope_ref")
  if (!city || !scope || url.searchParams.get("scope_kind") !== "rig")
    return yield* new BoundaryFailure({ message: "dashboard detail requires an explicit native RIG scope" })
  const client = yield* HttpClient.HttpClient
  const detail = yield* client
    .get(url.href)
    .pipe(Effect.flatMap(Response.filterStatusOk), Effect.flatMap(Response.schemaBodyJson(RunDetail)))
  const observed = yield* client
    .execute(
      Request.get(`${upstream}/v0/city/${city}/beads/read-exact`).pipe(Request.setUrlParam("store_ref", `rig:${scope}`))
    )
    .pipe(Effect.flatMap(Response.filterStatusOk), Effect.flatMap(Response.schemaBodyJson(ProductBeadsResponse)))
  if (observed.store_ref !== `rig:${scope}`)
    return yield* new BoundaryFailure({ message: "dashboard product metadata returned another native store" })
  const productTasks = yield* Effect.try({
    try: () => productFrame(detail, observed.beads),
    catch: (error) => new BoundaryFailure({ message: `incomplete product frame: ${String(error)}` })
  })
  return productTasks ? { ...detail, productTasks } : detail
})

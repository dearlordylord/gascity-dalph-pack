import { Clock, Effect, Schedule } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as Request from "effect/http/HttpClientRequest"
import * as Response from "effect/http/HttpClientResponse"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import { registerDeliveryGraph } from "./vendor/delivery-graph-renderer.ts"
import { RunDetail } from "../src/dashboard/run.ts"
import { mountDashboard } from "./view.ts"
import type { DeliveryGraphElement } from "./vendor/delivery-graph-element.ts"

registerDeliveryGraph()
const graph = document.querySelector<DeliveryGraphElement>("dalph-delivery-graph")
if (!graph) throw new Error("Graph element is missing")
const view = mountDashboard(document, graph, location)
const { city, run, scope } = view
const read = Effect.fn("PackDashboard.readRun")(function* () {
  yield* Effect.sync(() => {
    view.refreshing()
  })
  const client = yield* HttpClient.HttpClient
  const response = yield* client.execute(
    Request.get(
      `${location.origin}/api/city/${encodeURIComponent(city)}/runs/${encodeURIComponent(run)}/detail?scope_kind=rig&scope_ref=${encodeURIComponent(scope)}`
    )
  )
  const ok = yield* Response.filterStatusOk(response)
  return yield* Response.schemaBodyJson(RunDetail)(ok)
})
const pass = read().pipe(
  Effect.timeout("60 seconds"),
  Effect.tap((value) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      yield* Effect.sync(() => {
        view.observe(value, new Date(now).toLocaleTimeString())
      })
    })
  ),
  Effect.catch((error) =>
    Effect.sync(() => {
      view.failed(error)
    })
  )
)
Effect.runFork(pass.pipe(Effect.repeat(Schedule.spaced("15 seconds")), Effect.provide(FetchHttpClient.layer)))

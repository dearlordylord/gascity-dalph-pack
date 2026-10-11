import { readFile } from "node:fs/promises"
import { Effect, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeHttpClient, NodeHttpServer } from "@effect/platform-node"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpServer from "effect/http/HttpServer"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as ClientResponse from "effect/http/HttpClientResponse"
import { project } from "../src/dashboard/projection.ts"
import { GraphNode, Identity, RunDetail } from "../src/dashboard/run.ts"
import { dashboard } from "../src/dashboard/server.ts"

it.effect("preserves fork/join blocking edges and grouping separately", () =>
  Effect.gen(function* () {
    const fixture = yield* Effect.tryPromise(() => readFile("dashboard/fixtures/fork-join.json", "utf8"))
    const detail = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(RunDetail))(fixture)
    const projection = project(detail)
    expect(projection.edges).toHaveLength(9)
    expect(project(detail, true).edges).toHaveLength(18)
    expect(projection.tasks.some((task) => task.display?.classes?.includes("frontier"))).toBe(true)
  })
)

it.effect("projects every visible status without inventing readiness", () =>
  Effect.sync(() => {
    const node = (status: string) =>
      GraphNode.make({
        id: Identity.make(status),
        title: status,
        status,
        currentBeadId: status,
        constructKind: "step",
        visibleInGraph: true,
        executionInstances: []
      })
    const nodes = ["completed", "done", "running", "active", "ready", "failed", "pending"].map(node)
    const detail = RunDetail.make({
      runId: Identity.make("run"),
      title: "trial",
      nodes,
      edges: [],
      progress: { terminal: true },
      completeness: { kind: "complete" }
    })
    const projection = project(detail)
    expect(projection.status).toBe("Run finished")
    expect(projection.tasks.map((task) => task.display?.tone)).toEqual([
      "settled",
      "settled",
      "running",
      "running",
      "desired",
      "paused",
      "blocked"
    ])
    const deliver = node("active")
    expect(project({ ...detail, nodes: [{ ...deliver, title: "task: deliver" }] }).tasks[0]?.display?.tone).toBe(
      "integrating"
    )
    expect(project({ ...detail, nodes: [{ ...deliver, visibleInGraph: false }] }).tasks).toEqual([])
  })
)

it.live("serves static files and refuses writes and unknown paths", () =>
  Effect.gen(function* () {
    yield* HttpServer.serveEffect(
      dashboard("dashboard", "http://127.0.0.1:1").pipe(Effect.provide(NodeHttpClient.layerUndici))
    )
    const client = yield* HttpClient.HttpClient
    expect((yield* client.get("/")).status).toBe(200)
    expect((yield* client.get("/style.css")).status).toBe(200)
    expect((yield* client.get("/unknown")).status).toBe(404)
    expect((yield* client.post("/api/city/trial")).status).toBe(405)
    expect((yield* client.get("/api/city/trial")).status).toBe(502)
  }).pipe(Effect.provide(NodeHttpServer.layerTest), Effect.scoped)
)

it.live("forwards only same-origin API reads and preserves upstream status", () =>
  Effect.gen(function* () {
    const request = HttpServerRequest.fromWeb(new Request("http://local/api/city/trial?scope=rig"))
    const paths: string[] = []
    const client = HttpClient.make((request) => {
      paths.push(request.url)
      return Effect.succeed(ClientResponse.fromWeb(request, new Response('{"error":"fixture"}', { status: 418 })))
    })
    const result = yield* dashboard("dashboard", "http://127.0.0.1:8372").pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      Effect.provideService(HttpClient.HttpClient, client)
    )
    expect(result.status).toBe(418)
    expect(paths).toEqual(["http://127.0.0.1:8372/api/city/trial?scope=rig"])
  }).pipe(Effect.provide(NodeHttpServer.layerTest), Effect.scoped)
)

import { Config, Effect, Layer } from "effect"
import { NodeHttpClient, NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import * as HttpServer from "effect/http/HttpServer"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { dashboard } from "../src/dashboard/server.ts"
import { BoundaryFailure } from "../src/domain/shared.ts"

const DEFAULT_PORT = 43597
const main = Effect.gen(function* () {
  const port = yield* Config.Port("DALPH_DASHBOARD_PORT").pipe(Config.withDefault(DEFAULT_PORT))
  const upstream = yield* Config.String("DALPH_TRACKER_ENDPOINT").pipe(Config.withDefault("http://127.0.0.1:8372"))
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(upstream)) {
    return yield* new BoundaryFailure({ message: "Dashboard upstream must be a loopback HTTP endpoint" })
  }
  const root = fileURLToPath(new URL("../dashboard", import.meta.url))
  const server = NodeHttpServer.layer(createServer, { port, host: "0.0.0.0" })
  return yield* Layer.launch(
    HttpServer.serve(dashboard(root, upstream)).pipe(
      HttpServer.withLogAddress,
      Layer.provide(NodeHttpClient.layerUndici),
      Layer.provide(server)
    )
  )
})
NodeRuntime.runMain(main)

import { Effect } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as Request from "effect/http/HttpClientRequest"
import * as ServerRequest from "effect/http/HttpServerRequest"
import * as Response from "effect/http/HttpServerResponse"
import { join } from "node:path"

const staticFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/app.bundle.js", "app.bundle.js"],
  ["/style.css", "style.css"]
])

export const dashboard = (root: string, upstream: string) =>
  Effect.gen(function* () {
    const request = yield* ServerRequest.HttpServerRequest
    if (request.method !== "GET") return Response.empty({ status: 405, headers: { Allow: "GET" } })
    const path = request.url.split("?")[0] ?? "/"
    if (!path.startsWith("/api/city/")) {
      const file = staticFiles.get(path)
      return file ? yield* Response.file(join(root, file)) : Response.empty({ status: 404 })
    }
    const client = yield* HttpClient.HttpClient
    return yield* client.execute(Request.get(`${upstream}${request.url}`)).pipe(
      Effect.flatMap((response) =>
        Effect.map(response.arrayBuffer, (body) =>
          Response.uint8Array(new Uint8Array(body), {
            status: response.status,
            contentType: "application/json",
            headers: { "Cache-Control": "no-store" }
          })
        )
      ),
      Effect.timeout("65 seconds"),
      Effect.catch(() => Effect.succeed(Response.text("Gas City API unavailable", { status: 502 })))
    )
  })

import { Console, Effect, Logger, Schema } from "effect"
import { NodeHttpClient, NodeRuntime } from "@effect/platform-node"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"

// Narrow transport adapter. The native supervisor remains the tracker writer.
// The trial's tracker locator accepts only the local supervisor, without paths
// or credentials. These brands distinguish the three boundary identities.
const Endpoint = Schema.String.check(Schema.isPattern(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/)).pipe(
  Schema.brand("TrackerEndpoint")
)
const CityName = Schema.String.check(Schema.isMinLength(1)).pipe(Schema.brand("CityName"))
const BeadId = Schema.String.check(Schema.isMinLength(1)).pipe(Schema.brand("BeadId"))
const Input = Schema.Struct({
  endpoint: Endpoint,
  city: CityName,
  id: BeadId,
  action: Schema.Literals(["show", "update", "close"]),
  body: Schema.JsonObject
})
const Response = Schema.Struct({ status: Schema.String })
const Bead = Schema.Struct({
  id: BeadId,
  status: Schema.String,
  title: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  assignee: Schema.optionalKey(Schema.String),
  issue_type: Schema.optionalKey(Schema.String),
  type: Schema.optionalKey(Schema.String),
  ref: Schema.optionalKey(Schema.String),
  priority: Schema.optionalKey(Schema.Number),
  needs: Schema.optionalKey(Schema.Array(BeadId)),
  labels: Schema.optionalKey(Schema.Array(Schema.String)),
  ephemeral: Schema.optionalKey(Schema.Boolean),
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.String))
})
class TrackerRejected extends Schema.TaggedError<TrackerRejected>()("TrackerRejected", {
  action: Schema.Literals(["show", "update", "close"]),
  status: Schema.Number,
  detail: Schema.String,
  message: Schema.String
}) {}

const HTTP_OK = 200
const HTTP_REDIRECT = 300
const request = Effect.fn("DalphTracker.request")(function* (input: typeof Input.Type) {
  const client = yield* HttpClient.HttpClient
  const url = `${input.endpoint}/v0/city/${encodeURIComponent(input.city)}/bead/${encodeURIComponent(input.id)}`
  const response =
    input.action === "show"
      ? yield* client.execute(HttpClientRequest.get(url))
      : yield* HttpClientRequest.post(`${url}/${input.action}`).pipe(
          HttpClientRequest.setHeader("X-GC-Request", "1"),
          HttpClientRequest.bodyJson(input.body),
          Effect.flatMap(client.execute)
        )
  if (response.status < HTTP_OK || response.status >= HTTP_REDIRECT) {
    const detail = yield* response.text
    return yield* new TrackerRejected({
      action: input.action,
      status: response.status,
      detail,
      message: `Tracker ${input.action} rejected (${response.status}): ${detail}`
    })
  }
  return yield* HttpClientResponse.schemaBodyJson(input.action === "show" ? Bead : Response)(response)
})

const main = Effect.gen(function* () {
  const argument = yield* Effect.sync(() => process.argv[2])
  const input = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Input))(argument)
  const result = yield* request(input).pipe(Effect.timeout("60 seconds"))
  const output = JSON.stringify(result)
  yield* Console.log(output)
})

NodeRuntime.runMain(
  main.pipe(
    Effect.tapCause(Effect.logError),
    Effect.provideService(Logger.LogToStderr, true),
    Effect.provide(NodeHttpClient.layerUndici)
  ),
  { disableErrorReporting: true }
)

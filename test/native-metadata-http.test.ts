import { Effect, Fiber, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { TestClock } from "effect/testing"
import * as HttpError from "effect/http/HttpClientError"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpResponse from "effect/http/HttpClientResponse"
import { BeadId } from "../src/domain/shared.ts"
import { MetadataCASRequest, nativeMetadataCAS, nativeMetadataCapability } from "../src/native/metadata-http.ts"
import { nativeFixture } from "./helpers/native-fixture.ts"

it.effect("metadata CAS uses the public scoped HTTP request with an explicit empty expected value", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    let calls = 0
    const client = HttpClient.make((request) =>
      Effect.sync(() => {
        calls++
        expect(request.method).toBe("POST")
        expect(request.url).toBe(`${f.config.endpoint}/v0/city/${f.config.cityName}/bead/work/metadata-cas`)
        expect(request.headers["x-gc-request"]).toBe("1")
        expect(request.body._tag).toBe("Uint8Array")
        if (request.body._tag === "Uint8Array")
          expect(JSON.parse(new TextDecoder().decode(request.body.body))).toEqual({
            store_ref: "rig:fixture",
            key: "dalph.proof",
            expected: "",
            next: "value"
          })
        return HttpResponse.fromWeb(request, new Response("receipt"))
      })
    )
    expect(yield* nativeMetadataCAS(f.config, client, BeadId.make("work"), "dalph.proof", "value")).toBe("receipt")
    expect(calls).toBe(1)
    yield* Effect.flip(nativeMetadataCAS(f.config, client, BeadId.make("work"), "invalid key", "value"))
    expect(calls).toBe(1)
  })
)

for (const status of [429, 501, 500])
  it.effect(`metadata HTTP ${status} remains one request and preserves ambiguity classification`, () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      let calls = 0
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          calls++
          return HttpResponse.fromWeb(request, new Response("refused", { status }))
        })
      )
      const error = yield* Effect.flip(nativeMetadataCAS(f.config, client, BeadId.make("work"), "dalph.proof", "value"))
      expect(error._tag).toBe(status === 500 ? "NativeMetadataRequestFailed" : "HttpClientError")
      expect(calls).toBe(1)
    })
  )

for (const store of ["rig:fixture", "rig:foreign"])
  it.effect(`metadata capability validates exact store ${store}`, () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          expect(request.method).toBe("GET")
          expect(request.urlParams).toContainEqual(["store_ref", "rig:fixture"])
          return HttpResponse.fromWeb(
            request,
            new Response(
              JSON.stringify({
                schema_version: "1",
                ok: true,
                store_ref: store,
                capability: "metadata-value-cas-v1",
                supported: true
              })
            )
          )
        })
      )
      const check = nativeMetadataCapability(f.config).pipe(Effect.provideService(HttpClient.HttpClient, client))
      if (store === "rig:fixture") yield* check
      else expect((yield* Effect.flip(check))._tag).toBe("BoundaryFailure")
    })
  )

for (const failure of ["transport", "body", "server-body", "timeout"])
  it.effect(`ambiguous metadata ${failure} failure never retries`, () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      let calls = 0
      const client = HttpClient.make((request) =>
        Effect.gen(function* () {
          calls++
          if (failure === "transport")
            return yield* new HttpError.HttpClientError({
              reason: new HttpError.TransportError({ request, description: "lost response" })
            })
          if (failure === "timeout") return yield* Effect.never
          return HttpResponse.fromWeb(
            request,
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.error(new Error("truncated body"))
                }
              }),
              { status: failure === "server-body" ? 500 : 200 }
            )
          )
        })
      )
      const operation = nativeMetadataCAS(f.config, client, BeadId.make("work"), "dalph.proof", "value").pipe(
        Effect.flip
      )
      const pending = yield* operation.pipe(Effect.forkChild)
      if (failure === "timeout") yield* TestClock.adjust("60 seconds")
      expect((yield* Fiber.join(pending))._tag).toBe("NativeMetadataRequestFailed")
      expect(calls).toBe(1)
    })
  )

it.effect("metadata request grammar matches exact SDK tokens and bounds", () =>
  Effect.gen(function* () {
    for (const store_ref of ["city:native-acceptance", "rig:fixture"])
      for (const key of ["proof_9", "dalph.proof"])
        yield* Schema.decodeUnknownEffect(MetadataCASRequest)({ store_ref, key, expected: "", next: "value" })
    for (const [store_ref, key] of [
      ["city", "proof"],
      ["rig:fixture", "with/slash"],
      ["rig:fixture", "_leading"],
      ["rig:fixture", "9-proof"],
      ["rig:fixture", "with-hyphen"],
      [`rig:${"a".repeat(256)}`, "proof"],
      ["rig:fixture", "a".repeat(257)]
    ])
      yield* Effect.flip(
        Schema.decodeUnknownEffect(MetadataCASRequest)({ store_ref, key, expected: "", next: "value" })
      )
  })
)

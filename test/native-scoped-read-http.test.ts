import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { expect, it } from "@effect/vitest"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpResponse from "effect/http/HttpClientResponse"
import { nativeLiveBead, nativeLiveRows, nativeScopedReadCapability } from "../src/native/scoped-read.ts"
import { BeadId } from "../src/domain/shared.ts"
import { makeTracker } from "../src/delivery/tracker.ts"
import { nativeFixture } from "./helpers/native-fixture.ts"

const scoped = { schema_version: "1", ok: true, store_ref: "rig:fixture" }
const bead = { id: "work", status: "open", metadata: { claim: "new" } }
const point = { ...scoped, bead, revision: "-7151513277199971023" }
const responder = (body: unknown, status = 200) =>
  HttpClient.make((request) =>
    Effect.succeed(HttpResponse.fromWeb(request, new Response(JSON.stringify(body), { status })))
  )

it.effect("native point reads use the exact HTTP scope and fresh backend result without a CLI launch", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    let calls = 0
    f.commands.execute = () => Effect.die("native point read launched a CLI")
    const client = HttpClient.make((request) =>
      Effect.sync(() => {
        calls++
        expect(request.method).toBe("GET")
        expect(request.url).toBe(`${f.config.endpoint}/v0/city/${f.config.cityName}/bead/work/read-exact`)
        expect(request.urlParams).toContainEqual(["store_ref", "rig:fixture"])
        return HttpResponse.fromWeb(
          request,
          new Response(JSON.stringify({ ...point, bead: { ...bead, metadata: { claim: String(calls) } } }))
        )
      })
    )
    const tracker = makeTracker(f.config, f.commands, client)
    expect((yield* tracker.bead(BeadId.make("work")).pipe(Effect.provide(f.layer))).metadata?.claim).toBe("1")
    expect((yield* tracker.bead(BeadId.make("work")).pipe(Effect.provide(f.layer))).metadata?.claim).toBe("2")
    expect(calls).toBe(2)
  })
)

for (const invalid of [
  { ...point, store_ref: "rig:foreign" },
  { ...point, bead: { ...bead, id: "foreign" } },
  { ...point, bead: { ...bead, _cache_age_s: 1 } },
  { ...point, revision: Number(point.revision) },
  { ...point, revision: "0" }
])
  it.effect(`exact point refuses a foreign, cached or lossy receipt: ${JSON.stringify(invalid)}`, () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      yield* Effect.flip(nativeLiveBead(f.config, responder(invalid), BeadId.make("work")))
    })
  )

it.effect("live list preserves both tiers and every lifecycle state without pagination", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    const beads = ["open", "in_progress", "blocked", "closed"].map((status, index) => ({
      id: index % 2 ? `fi-wisp-${index}` : `fi-${index}`,
      status
    }))
    const client = HttpClient.make((request) =>
      Effect.sync(() => {
        expect(request.url).toBe(`${f.config.endpoint}/v0/city/${f.config.cityName}/beads/read-exact`)
        expect(Array.from(request.urlParams)).toEqual([["store_ref", "rig:fixture"]])
        return HttpResponse.fromWeb(request, new Response(JSON.stringify({ ...scoped, beads })))
      })
    )
    expect(yield* nativeLiveRows(f.config).pipe(Effect.provideService(HttpClient.HttpClient, client))).toEqual(beads)
  })
)

for (const invalid of [
  { ...scoped, store_ref: "rig:foreign", beads: [bead] },
  { ...scoped, beads: [{ ...bead, _cache_age_s: 1 }] }
])
  it.effect("live list refuses foreign scope or cached rows", () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      expect(
        (yield* Effect.flip(
          nativeLiveRows(f.config).pipe(Effect.provideService(HttpClient.HttpClient, responder(invalid)))
        ))._tag
      ).toBe("BoundaryFailure")
    })
  )

for (const body of [
  { ...scoped, capability: "exact-live-beads-v1", supported: true },
  { ...scoped, capability: "exact-live-beads-v1", supported: false },
  { ...scoped, store_ref: "rig:foreign", capability: "exact-live-beads-v1", supported: true }
])
  it.effect("live-read capability is explicit and exact before workflow effects", () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      const check = nativeScopedReadCapability(f.config).pipe(
        Effect.provideService(HttpClient.HttpClient, responder(body))
      )
      if (body.supported && body.store_ref === "rig:fixture") yield* check
      else expect((yield* Effect.flip(check))._tag).toBe("BoundaryFailure")
    })
  )

for (const status of [404, 500])
  it.effect(`HTTP ${status} read remains a failure without a fallback`, () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      let calls = 0
      const client = HttpClient.make((request) =>
        Effect.sync(() => {
          calls++
          return HttpResponse.fromWeb(request, new Response("unavailable", { status }))
        })
      )
      expect((yield* Effect.flip(nativeLiveBead(f.config, client, BeadId.make("work"))))._tag).toBe("HttpClientError")
      expect(calls).toBe(1)
    })
  )

it.effect("point-read deadline covers a body that never finishes", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    const client = HttpClient.make((request) =>
      Effect.succeed(HttpResponse.fromWeb(request, new Response(new ReadableStream())))
    )
    const pending = yield* nativeLiveBead(f.config, client, BeadId.make("work")).pipe(Effect.flip, Effect.forkChild)
    yield* TestClock.adjust("30 seconds")
    expect((yield* Fiber.join(pending))._tag).toBe("TimeoutError")
  })
)

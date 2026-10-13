import { Effect, Schema, ConfigProvider, Layer } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeServices, NodeHttpClient } from "@effect/platform-node"
import * as HttpClient from "effect/http/HttpClient"
import { nativeCity } from "./helpers/native-city.ts"
import { configuration } from "../src/delivery/config.ts"
import { BeadId } from "../src/domain/shared.ts"
import { nativeMetadataCapability, nativeMetadataCAS } from "../src/native/metadata-http.ts"

it.live(
  "S9/S11: public HTTP CAS reuses one held store and preserves replay/conflict",
  () =>
    Effect.gen(function* () {
      const city = yield* nativeCity
      const config = yield* configuration.pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env: city.env }))
      )
      const cooked = yield* city.gc("bd", "create", "--title", "HTTP CAS exact proof", "--type", "task", "--json")
      const root = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ id: BeadId })))(cooked)
      const client = yield* HttpClient.HttpClient
      yield* nativeMetadataCapability(config)
      const before = yield* city.fs.readFileString(`${city.root}/native-beads-trace.jsonl`)
      const Receipt = Schema.Struct({
        schema_version: Schema.Literal("1"),
        ok: Schema.Literal(true),
        bead_id: BeadId,
        store_ref: Schema.String,
        key: Schema.String,
        outcome: Schema.Literals(["swapped", "already_next", "conflict"])
      })
      for (const { next, outcome } of [
        { next: "first", outcome: "swapped" },
        { next: "first", outcome: "already_next" },
        { next: "different", outcome: "conflict" }
      ]) {
        const encoded = yield* nativeMetadataCAS(config, client, root.id, "dalph.http_proof", next)
        const receipt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Receipt))(encoded)
        expect(receipt).toEqual({
          schema_version: "1",
          ok: true,
          bead_id: root.id,
          store_ref: "rig:fixture",
          key: "dalph.http_proof",
          outcome
        })
      }
      const after = yield* city.fs.readFileString(`${city.root}/native-beads-trace.jsonl`)
      const traces = after
        .slice(before.length)
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
      expect(traces.filter((row) => JSON.stringify(row).includes("--help"))).toHaveLength(0)
      const bead = yield* city.gc("beads", "show", root.id, "--store-ref=rig:fixture", "--format=json")
      expect(JSON.parse(bead).metadata["dalph.http_proof"]).toBe("first")
    }).pipe(Effect.scoped, Effect.provide(Layer.merge(NodeServices.layer, NodeHttpClient.layerUndici))),
  180_000
)

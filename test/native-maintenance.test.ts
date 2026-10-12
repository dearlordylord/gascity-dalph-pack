import { Effect, FileSystem, Schema } from "effect"
import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { parse } from "smol-toml"

const CityMaintenance = Schema.Struct({
  beads: Schema.Struct({ native_transport: Schema.optionalKey(Schema.String) }),
  daemon: Schema.Struct({
    wisp_gc_interval: Schema.optionalKey(Schema.String),
    wisp_ttl: Schema.optionalKey(Schema.String)
  }),
  orders: Schema.Struct({ skip: Schema.Array(Schema.String) }),
  patches: Schema.Struct({ agent: Schema.Array(Schema.Struct({ name: Schema.String })) }),
  events: Schema.Struct({
    rotation: Schema.Struct({
      enabled: Schema.Boolean,
      max_size_bytes: Schema.Number,
      archive_retain_age: Schema.String
    })
  })
})

it.effect("native installation restores health while retaining recovery records and bounding diagnostics", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const city = yield* Schema.decodeUnknownEffect(CityMaintenance)(parse(yield* fs.readFileString("trial/city.toml")))
    expect(city.beads.native_transport).toBeUndefined()
    expect(city.daemon.wisp_gc_interval).toBeUndefined()
    expect(city.daemon.wisp_ttl).toBeUndefined()
    expect(city.patches.agent.some((agent) => agent.name === "bd.dog")).toBe(false)
    expect(city.orders.skip).toEqual([
      "dolt-remotes-patrol",
      "jsonl-export",
      "mol-dog-backup",
      "mol-dog-compactor",
      "mol-dog-stale-db",
      "prune-branches",
      "reaper",
      "wisp-compact"
    ])
    expect(city.events.rotation).toEqual({ enabled: true, max_size_bytes: 268435456, archive_retain_age: "720h" })
  }).pipe(Effect.provide(NodeServices.layer))
)

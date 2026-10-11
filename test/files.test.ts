import { Effect, FileSystem, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { join } from "node:path"
import { canonical, persistReceipt } from "../src/delivery/files.ts"

it.effect("canonicalizes every JSON shape and nested key order", () =>
  Effect.sync(() => {
    expect(canonical({ z: [true, false, null, 2, "x"], a: { y: 1, a: 0 } })).toBe(
      '{"a":{"a":0,"y":1},"z":[true,false,null,2,"x"]}'
    )
    expect(canonical([])).toBe("[]")
    expect(canonical({})).toBe("{}")
  })
)
it.live("concurrent atomic receipt writers never collide on staging files", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const directory = yield* fs.makeTempDirectoryScoped()
    const path = join(directory, "receipt.json")
    yield* Effect.forEach(["one", "two"], (owner) => persistReceipt(path, { owner }), { concurrency: "unbounded" })
    const receipt = yield* fs
      .readFileString(path)
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ owner: Schema.String })))))
    expect(["one", "two"]).toContain(receipt.owner)
    expect(yield* fs.readDirectory(directory)).toEqual(["receipt.json"])
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped)
)
it.live("failed durable write remains an explicit failure", () =>
  Effect.gen(function* () {
    const result = yield* Effect.flip(persistReceipt("/missing/parent/receipt.json", {}))
    expect(result.message).toContain("durably persist")
  })
)

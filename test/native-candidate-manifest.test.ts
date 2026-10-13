import { createHash } from "node:crypto"
import { Effect, FileSystem, Schema } from "effect"
import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"

const Manifest = Schema.Struct({
  qualification: Schema.Literal("candidate"),
  gc: Schema.Struct({
    revision: Schema.String,
    version: Schema.String,
    patch: Schema.String,
    patchSha256: Schema.String,
    beadsModule: Schema.String,
    beadsModuleVersion: Schema.String,
    beadsModuleSum: Schema.String,
    schema: Schema.Struct({ main: Schema.Number, ignored: Schema.Number })
  }),
  bd: Schema.Struct({ revision: Schema.String })
})

it.live("candidate setup pins the CLI to the linked library and the complete patch", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const manifest = yield* fs
      .readFileString("patches/native-candidate.json")
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Manifest))))
    const patch = yield* fs.readFileString(`patches/${manifest.gc.patch}`)
    expect(createHash("sha256").update(patch).digest("hex")).toBe(manifest.gc.patchSha256)
    expect(manifest.bd.revision).toMatch(/^[0-9a-f]{40}$/)
    expect(manifest.gc.beadsModuleVersion).toMatch(new RegExp(`${manifest.bd.revision.slice(0, 12)}$`))
    expect(patch).toContain(`+\t${manifest.gc.beadsModule} ${manifest.gc.beadsModuleVersion}`)
    expect(patch).toContain(
      `+${manifest.gc.beadsModule} ${manifest.gc.beadsModuleVersion} ${manifest.gc.beadsModuleSum}`
    )
    expect(patch).toContain("+++ b/schemas/runtime/heartbeat/result.schema.json")
    expect(patch).toContain("+++ b/cmd/gc/dispatch_control_ready_proxied_integration_test.go")
    expect(patch).toContain("+++ b/cmd/gc/cmd_beads_scoped_show.go")
    expect(patch).toContain("+++ b/cmd/gc/cmd_beads_scoped_show_test.go")
    expect(patch).toContain("+++ b/cmd/gc/testdata/beads-scoped-show.txtar")
    expect(patch).toContain("+++ b/internal/molecule/graph_apply.go")
    expect(patch).toContain("TestAttachFencedGraphLostResponseRecoversOneSurvivor")
    expect(patch).toContain("TestAttachFencedGraphConcurrentAttachesConvergeOnOneSubDAG")
    expect(manifest.gc.version).toBe("dev-dalph-native-v6-attach-candidate")
    expect(manifest.gc.schema).toEqual({ main: 69, ignored: 27 })
  }).pipe(Effect.provide(NodeServices.layer))
)

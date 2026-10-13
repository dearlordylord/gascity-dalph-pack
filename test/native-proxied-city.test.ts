import { Effect, Schema } from "effect"
import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { makeNativeCity } from "./helpers/native-city.ts"
import { Bead } from "../src/delivery/tracker.ts"
import { BeadId } from "../src/domain/shared.ts"

const Created = Schema.Struct({ id: BeadId })
/** Opaque native row revisions are compared for equality across backend restart. */
const RawRows = Schema.Array(
  Schema.Struct({ id: BeadId, revision: Schema.NonEmptyString, ephemeral: Schema.optionalKey(Schema.Boolean) })
)
const ManagedBackend = Schema.Struct({
  mode: Schema.Literal("proxied-server"),
  backend_managed: Schema.Literal(true),
  backend_running: Schema.Literal(true),
  running: Schema.Literal(true),
  root: Schema.String
})
const Receipt = Schema.Struct({
  schema_version: Schema.Literal("1"),
  ok: Schema.Literal(true),
  bead_id: BeadId,
  store_ref: Schema.String,
  key: Schema.String,
  outcome: Schema.Literals(["swapped", "already_next", "conflict"])
})
const Doctor = Schema.Struct({
  ok: Schema.Boolean,
  results: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      payload: Schema.optionalKey(
        Schema.Struct({
          store: Schema.String,
          proxied: Schema.optionalKey(
            Schema.Struct({ cursors: Schema.Struct({ main: Schema.Number, ignored: Schema.Number }) })
          )
        })
      )
    })
  )
})

it.live(
  "S11 native proxied reader admits the matched schema and observes conditional writes",
  () =>
    Effect.gen(function* () {
      const city = yield* makeNativeCity()
      const diagnostic = yield* city
        .gc("doctor", "--check", "beads-store", "--json")
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Doctor))))
      expect(diagnostic.ok).toBe(true)
      const store = diagnostic.results.find((row) => row.name === "beads-store")?.payload
      expect(store?.store).toBe("NativeDoltStore")
      expect(store?.proxied?.cursors).toEqual({ main: 69, ignored: 27 })
      for (const ephemeral of [false, true]) {
        const created = yield* city
          .gc(
            "bd",
            "create",
            "--title",
            "Native read proof",
            "--type",
            "task",
            ...(ephemeral ? ["--ephemeral"] : []),
            "--json"
          )
          .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Created))))
        const read = () =>
          city
            .execute([
              "env",
              "GC_NO_API=1",
              "gc",
              "--city",
              city.env.DALPH_CITY_ROOT,
              "--rig",
              "fixture",
              "beads",
              "show",
              created.id,
              "--format=json"
            ])
            .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Bead))))
        expect((yield* read()).id).toBe(created.id)
        const cas = (next: string) =>
          city.gc(
            "beads",
            "metadata-cas",
            created.id,
            "--store-ref=rig:fixture",
            "--key=dalph.native_read_probe",
            "--expected=",
            `--next=${next}`,
            "--json"
          )
        const raw = () =>
          city
            .gc("bd", "show", created.id, "--json")
            .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(RawRows))))
        let acknowledgedRevision: string | undefined
        for (const [value, outcome] of [
          ["retained", "swapped"],
          ["retained", "already_next"],
          ["contradictory", "conflict"]
        ]) {
          const receipt = yield* cas(value ?? "").pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Receipt)))
          )
          expect(receipt).toEqual({
            schema_version: "1",
            ok: true,
            bead_id: created.id,
            store_ref: "rig:fixture",
            key: "dalph.native_read_probe",
            outcome
          })
          const snapshot = yield* raw()
          expect(snapshot).toHaveLength(1)
          expect(snapshot[0]?.id).toBe(created.id)
          expect(snapshot[0]?.ephemeral ?? false).toBe(ephemeral)
          if (outcome === "swapped") {
            acknowledgedRevision = snapshot[0]?.revision
            const backend = yield* city
              .gc("bd", "dolt", "status", "--json")
              .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(ManagedBackend))))
            expect(backend.root).toBe(`${city.env.DALPH_TARGET_REPO}/.beads/dolt`)
            // Pinned proxied stop verifies owned processes and SIGKILLs them
            // without a working-set flush. The next request starts it on demand.
            yield* city.gc("bd", "dolt", "stop")
            expect((yield* read()).metadata?.["dalph.native_read_probe"]).toBe("retained")
            expect((yield* raw())[0]?.revision).toBe(acknowledgedRevision)
          } else {
            expect(snapshot[0]?.revision).toBe(acknowledgedRevision)
          }
        }
        expect((yield* read()).metadata?.["dalph.native_read_probe"]).toBe("retained")
        yield* city.gc("bd", "close", created.id, "--json")
        expect((yield* read()).status).toBe("closed")
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  120000
)

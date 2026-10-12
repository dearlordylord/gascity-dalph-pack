import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { BeadId } from "../src/domain/shared.ts"
import { CommandRejected } from "../src/delivery/command.ts"
import { nativeFixture } from "./helpers/native-fixture.ts"

const receipt = {
  schema_version: "1",
  ok: true,
  bead_id: "work",
  store_ref: "rig:fixture",
  key: "dalph.proof",
  outcome: "swapped"
}

it.effect("native fact CAS owns replay, empty keys, conflict and missing-bead refusal", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      const id = BeadId.make("work")
      yield* f.tracker.record(id, "proof", { exact: true })
      yield* f.tracker.record(id, "proof", { exact: true })
      yield* Effect.flip(f.tracker.record(id, "proof", { exact: false }))
      expect(f.raw("work").metadata["dalph.proof"]).toBe('{"exact":true}')
      f.raw("work").metadata["dalph.empty"] = ""
      yield* f.tracker.record(id, "empty", { exact: true })
      expect(f.raw("work").metadata["dalph.empty"]).toBe('{"exact":true}')
      yield* Effect.flip(f.tracker.record(BeadId.make("missing"), "proof", { exact: true }))
      f.raw("work").metadata.raw_empty = ""
      yield* Effect.flip(f.tracker.metadata(id, "raw_empty", "value"))
      expect(f.raw("work").metadata.raw_empty).toBe("")
    }).pipe(Effect.provide(f.layer))
  })
)

for (const outcome of ["swapped", "already_next"])
  it.effect(`native ${outcome} receipt acknowledges the exact fact without a second read`, () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      const execute = f.commands.execute
      let reads = 0
      let writes = 0
      f.commands.execute = (root, args, cwd, timeout, logs) => {
        if (args.includes("show") && args.includes("beads")) reads++
        if (args.includes("metadata-cas")) {
          writes++
          return Effect.succeed(JSON.stringify({ ...receipt, outcome }))
        }
        return execute(root, args, cwd, timeout, logs)
      }
      yield* f.tracker.record(BeadId.make("work"), "proof", { exact: true }).pipe(Effect.provide(f.layer))
      expect(reads).toBe(0)
      expect(writes).toBe(1)
    })
  )

for (const response of [
  "{",
  JSON.stringify({ ...receipt, schema_version: "2" }),
  JSON.stringify({ ...receipt, ok: false }),
  JSON.stringify({ ...receipt, bead_id: "foreign" }),
  JSON.stringify({ ...receipt, store_ref: "rig:foreign" }),
  JSON.stringify({ ...receipt, key: "dalph.foreign" }),
  JSON.stringify({ ...receipt, outcome: "conflict" }),
  JSON.stringify({ ...receipt, outcome: "unknown" })
])
  it.effect(`invalid native acknowledgement refuses applied facts: ${response}`, () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      const execute = f.commands.execute
      let reads = 0
      f.commands.execute = (root, args, cwd, timeout, logs) => {
        if (args.includes("show") && args.includes("beads")) reads++
        return execute(root, args, cwd, timeout, logs).pipe(
          Effect.map((current) => (args.includes("metadata-cas") ? response : current))
        )
      }
      const error = yield* Effect.flip(
        f.tracker.record(BeadId.make("work"), "proof", { exact: true }).pipe(Effect.provide(f.layer))
      )
      expect(error._tag).not.toBe("CommandRejected")
      expect(f.raw("work").metadata["dalph.proof"]).toBe('{"exact":true}')
      expect(reads).toBe(0)
      expect(f.state.pushCalls).toBe(0)
    })
  )

for (const applied of [true, false])
  it.effect(`ambiguous native write reconciles exact value only: applied=${applied}`, () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      const execute = f.commands.execute
      let writes = 0
      let reads = 0
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        Effect.gen(function* () {
          if (args.includes("show") && args.includes("beads")) reads++
          if (args.includes("metadata-cas")) {
            writes++
            if (applied) yield* execute(root, args, cwd, timeout, logs)
            return yield* new CommandRejected({ message: "response lost", receipt: "fixture" })
          }
          return yield* execute(root, args, cwd, timeout, logs)
        })
      const operation = f.tracker.record(BeadId.make("work"), "proof", { exact: true }).pipe(Effect.provide(f.layer))
      if (applied) yield* operation
      else expect((yield* Effect.flip(operation))._tag).toBe("CommandRejected")
      expect(writes).toBe(1)
      expect(reads).toBe(1)
    })
  )

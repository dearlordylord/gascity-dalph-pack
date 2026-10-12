import { Effect, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { NativeAttempt } from "../src/native/contract.ts"
import { makeNativeController } from "../src/native/controller.ts"
import { settleNative } from "../src/native/settlement.ts"
import { bindNativeAttempt, nativeGroup } from "../src/native/identity.ts"
import { BeadId } from "../src/domain/shared.ts"
import { RESULT } from "./helpers/workflow-fixture.ts"

it.effect("closed native delivery reconciles settlement only from exact durable proofs", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      yield* f.workflow.prepare(yield* f.row("prepare"))
      const attempt = yield* f.tracker.fact(BeadId.make("work"), "native_attempt", NativeAttempt)
      if (!attempt) throw new Error("missing attempt")
      expect(yield* settleNative(f.tracker, yield* f.row("delivery"), attempt)).toBe(false)
      f.state.workHead = RESULT
      f.branches.set("dalph/work/work", RESULT)
      yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
      yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
      yield* f.workflow.check(yield* f.row("work"))
      yield* f.workflow.integrate(yield* f.row("delivery"))
      delete f.raw("work").metadata["dalph.native_settled"]
      const resume = () =>
        makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath).resume(BeadId.make("root"))
      const metadata = f.raw("delivery").metadata
      for (const key of ["candidate", "published", "promoted", "work_cleaned", "candidate_plan", "candidate_cleaned"]) {
        const field = `dalph.${key}`
        const original = metadata[field]
        if (!original) throw new Error("missing settlement proof")
        delete metadata[field]
        yield* Effect.flip(resume())
        metadata[field] = original
      }
      for (const key of ["published", "promoted"]) {
        const field = `dalph.${key}`
        const original = metadata[field] ?? ""
        metadata[field] = JSON.stringify({ commit: "f".repeat(40) })
        yield* Effect.flip(resume())
        metadata[field] = original
      }
      for (const key of ["work_cleaned", "candidate_cleaned"]) {
        const field = `dalph.${key}`
        const original = metadata[field] ?? ""
        const proof = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))(original)
        for (const patch of [{ attempt: "foreign" }, { path: "/foreign" }]) {
          metadata[field] = JSON.stringify({ ...proof, ...patch })
          yield* Effect.flip(resume())
        }
        metadata[field] = original
      }
      for (const [key, patch] of [
        ["candidate", { result: "f".repeat(40) }],
        ["candidate_plan", { bead: "foreign" }],
        ["candidate_plan", { base: "f".repeat(40) }]
      ] as const) {
        const field = `dalph.${key}`
        const original = metadata[field] ?? ""
        const proof = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))(original)
        metadata[field] = JSON.stringify({ ...proof, ...patch })
        yield* Effect.flip(resume())
        metadata[field] = original
      }
      const source = f.raw("work").metadata
      for (const key of ["result", "native_proposal"]) {
        const field = `dalph.${key}`
        const original = source[field] ?? ""
        delete source[field]
        yield* Effect.flip(resume())
        const proof = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))(original)
        for (const patch of [{ attempt: "foreign" }, { commit: "f".repeat(40) }]) {
          source[field] = JSON.stringify({ ...proof, ...patch })
          yield* Effect.flip(resume())
        }
        source[field] = original
      }
      f.paths.add(attempt.plan.path)
      yield* Effect.flip(resume())
      f.paths.clear()
      expect(yield* settleNative(f.tracker, yield* f.row("delivery"), attempt)).toBe(true)
      expect(f.raw("work").metadata["dalph.native_settled"]).toContain(attempt.plan.attempt)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("native admission rejects wrong branch, stale or dirty target and contradictory retained contract", () =>
  Effect.gen(function* () {
    for (const fault of ["branch", "stale", "dirty", "contract", "group"] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        if (fault === "contract") {
          yield* f.workflow.prepare(yield* f.row("prepare"))
          yield* Effect.flip(
            bindNativeAttempt(
              f.config,
              { ...f.contract, harnessVersion: "changed" },
              f.commands,
              f.tracker,
              f.git,
              yield* f.row("work")
            )
          )
        } else if (fault === "group") {
          f.rows.delete("work")
          yield* Effect.flip(nativeGroup(f.config, f.commands, yield* f.row("prepare")))
        } else {
          f.state.wrongBranch = fault === "branch"
          f.state.remote = fault === "stale" ? RESULT : f.state.remote
          f.state.targetDirty = fault === "dirty"
          yield* Effect.flip(f.workflow.prepare(yield* f.row("prepare")))
          expect(f.paths.size).toBe(0)
        }
      }).pipe(Effect.provide(f.layer))
    }
  })
)

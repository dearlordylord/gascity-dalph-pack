import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeReviewFixture } from "./helpers/native-review-fixture.ts"
import { canonical } from "../src/delivery/files.ts"
import { NativeAttempt } from "../src/native/contract.ts"
import { NativeReviewVerdict } from "../src/native/review-contract.ts"
import { makeNativeController } from "../src/native/controller.ts"
import { settleNative } from "../src/native/settlement.ts"
import { BeadId } from "../src/domain/shared.ts"
import { RESULT } from "./helpers/workflow-fixture.ts"

for (const fault of ["none", "missing-outcome", "missing", "commit", "attempt", "task", "base", "blocking"] as const) {
  it.effect(
    `settlement recovery ${fault} requires the exact clean review after delivery but before its final acknowledgement`,
    () =>
      Effect.gen(function* () {
        const f = yield* nativeReviewFixture
        yield* Effect.gen(function* () {
          yield* f.start
          f.branches.set("dalph/work/work", RESULT)
          yield* f.review.prepare(yield* f.row("review-prepare"))
          yield* f.review.submit(yield* f.row("review"), yield* f.verdict)
          yield* f.review.gate(yield* f.row("review-control"))
          f.raw("work").metadata["dalph.review_required"] = "true"
          yield* f.workflow.check(yield* f.row("review-control"))
          yield* f.workflow.integrate(yield* f.row("delivery"))
          delete f.raw("work").metadata["dalph.native_settled"]
          if (fault === "missing-outcome") delete f.raw("delivery").metadata["gc.outcome"]
          const approved = yield* f.tracker.fact(BeadId.make("work"), "native_approved_initial_1", NativeReviewVerdict)
          const attempt = yield* f.tracker.fact(BeadId.make("work"), "native_attempt", NativeAttempt)
          if (!approved || !attempt) throw new Error("missing retained review or attempt")
          const metadata = f.raw("work").metadata
          if (fault === "missing") delete metadata["dalph.native_approved_initial_1"]
          else if (fault !== "none" && fault !== "missing-outcome")
            metadata["dalph.native_approved_initial_1"] = canonical({
              ...approved,
              ...(fault === "commit" ? { commit: "e".repeat(40) } : {}),
              ...(fault === "attempt" ? { attempt: "foreign-attempt" } : {}),
              ...(fault === "task" ? { task: "foreign-task" } : {}),
              ...(fault === "base" ? { base: "e".repeat(40) } : {}),
              ...(fault === "blocking"
                ? { findings: [{ id: "block", message: "Unresolved requirement", disposition: "blocking" }] }
                : {})
            })
          const settle = settleNative(f.tracker, yield* f.row("delivery"), attempt)
          if (fault === "none" || fault === "missing-outcome") expect(yield* settle).toBe(true)
          else {
            expect(String(yield* Effect.flip(settle))).toContain("exact clean review")
            expect(metadata["dalph.native_settled"]).toBeUndefined()
          }
          expect(f.state.pushCalls).toBe(1)
          expect(f.paths.size).toBe(0)
        }).pipe(Effect.provide(f.layer))
      })
  )
}

it.effect("original batch recovery accepts exact successful continuation settlement after owned cleanup", () =>
  Effect.gen(function* () {
    const f = yield* nativeReviewFixture
    yield* Effect.gen(function* () {
      yield* f.start
      f.branches.set("dalph/work/work", RESULT)
      yield* f.review.prepare(yield* f.row("review-prepare"))
      yield* f.review.submit(yield* f.row("review"), yield* f.verdict)
      yield* f.review.gate(yield* f.row("review-control"))
      f.raw("work").metadata["dalph.review_required"] = "true"
      yield* f.workflow.check(yield* f.row("review-control"))
      yield* f.workflow.integrate(yield* f.row("delivery"))
      f.raw("delivery").metadata["gc.root_bead_id"] = "continued-root"
      f.raw("delivery").metadata["dalph.product_root"] = "root"
      f.rows.set("original-skipped", {
        id: BeadId.make("original-skipped"),
        status: "closed",
        metadata: { "gc.root_bead_id": "root", "dalph.task": "task", "dalph.phase": "deliver", "gc.outcome": "skipped" }
      })
      delete f.raw("work").metadata["dalph.native_settled"]
      const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
      yield* controller.reconcile(BeadId.make("root"))
      expect(f.raw("work").metadata["dalph.native_settled"]).toBeDefined()
      expect(f.paths.size).toBe(0)
      expect(f.state.pushCalls).toBe(1)
      expect(f.raw("original-skipped").metadata["gc.outcome"]).toBe("skipped")
    }).pipe(Effect.provide(f.layer))
  })
)

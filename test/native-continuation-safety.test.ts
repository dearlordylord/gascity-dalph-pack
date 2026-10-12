import { Effect, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeReviewFixture } from "./helpers/native-review-fixture.ts"
import { makeNativeContinuation, continuationBatch } from "../src/native/continuation.ts"
import { BeadId } from "../src/domain/shared.ts"
import { NativeReviewVerdict } from "../src/native/review-contract.ts"

it.effect("human continuation preserves exhausted review when recovery prerequisites are unavailable", () =>
  Effect.gen(function* () {
    for (const fault of [
      "contract",
      "pending",
      "accepted",
      "findings",
      "early",
      "hard",
      "open",
      "budget",
      "control"
    ] as const) {
      const f = yield* nativeReviewFixture
      let launches = 0
      const execute = f.commands.execute
      f.commands.execute = (root, args, cwd, timeout, logs) => {
        if (args.includes("cook")) launches++
        return execute(root, args, cwd, timeout, logs)
      }
      yield* Effect.gen(function* () {
        yield* f.start
        for (let round = 1; round <= 4; round++) {
          f.round(round)
          yield* f.review.prepare(yield* f.row("review-prepare"))
          if (round > 1) yield* f.review.finishFix(yield* f.row("fix"), BeadId.make("fix-session"))
          yield* f.review.submit(yield* f.row("review"), {
            ...(yield* f.verdict),
            findings: [{ id: "block", message: "Retained repair", disposition: "blocking" }]
          })
          yield* Effect.flip(f.review.gate(yield* f.row("review-control")))
        }
        f.raw("review-control").metadata["gc.outcome"] = "fail"
        f.raw("review-control").status = "closed"
        f.raw("review-control").metadata["gc.failed_attempt"] = "4"
        f.raw("review-control").metadata["dalph.phase"] = "review"
        delete f.raw("review-control").metadata["gc.iteration"]
        if (fault === "early") f.raw("review-control").metadata["gc.failed_attempt"] = "3"
        if (fault === "hard") f.raw("review-control").metadata["gc.final_disposition"] = "hard_fail"
        if (fault === "open") f.raw("review-control").status = "open"
        if (fault === "budget") f.raw("review-control").metadata["gc.max_attempts"] = "5"
        if (fault === "control") {
          delete f.raw("review-control").metadata["gc.step_ref"]
          f.raw("review-control").metadata["gc.iteration"] = "4"
        }
        if (fault === "pending")
          f.rows.set("pending", {
            id: BeadId.make("pending"),
            status: "open",
            metadata: {
              "dalph.product_root": "root",
              "dalph.phase": "fix",
              "gc.kind": "ralph",
              "gc.step_id": "review",
              "gc.step_ref": "native-review-continuation.review"
            }
          })
        if (fault === "accepted") f.raw("work").metadata["dalph.result"] = "retained-result"
        if (fault === "findings") delete f.raw("work").metadata["dalph.native_review_initial_4"]
        const contract = fault === "contract" ? { ...f.contract, harnessVersion: "changed-version" } : f.contract
        const continuation = makeNativeContinuation(f.config, contract, f.commands, f.tracker, f.git, process.execPath)
        const failure = yield* Effect.flip(continuation.continuation(yield* f.row("review-control"), `guard-${fault}`))
        expect(String(failure)).toContain(
          fault === "contract"
            ? "original attempt contract"
            : fault === "findings"
              ? "fourth-round blocking findings"
              : ["early", "hard", "open", "budget", "control"].includes(fault)
                ? "exhausted native review control"
                : "pending batch or accepted result"
        )
        expect(launches).toBe(0)
        expect(f.raw("review-control").metadata["gc.outcome"]).toBe("fail")
        expect(f.paths.size).toBeGreaterThan(0)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("a new human batch starts with retained fourth-round findings and keeps the original workspace", () =>
  Effect.gen(function* () {
    const f = yield* nativeReviewFixture
    yield* Effect.gen(function* () {
      yield* f.start
      f.branches.set("dalph/work/work", f.state.workHead)
      for (let round = 1; round <= 4; round++) {
        f.round(round)
        yield* f.review.prepare(yield* f.row("review-prepare"))
        if (round > 1) yield* f.review.finishFix(yield* f.row("fix"), BeadId.make("fix-session"))
        yield* f.review.submit(yield* f.row("review"), {
          ...(yield* f.verdict),
          findings: [{ id: "block", message: "Retained repair", disposition: "blocking" }]
        })
        yield* Effect.flip(f.review.gate(yield* f.row("review-control")))
      }
      const original = f.raw("work").metadata["dalph.native_attempt"]
      const batch = continuationBatch("root", "native-acceptance-human-batch")
      f.round(1)
      for (const id of ["review", "fix", "review-control", "review-prepare"])
        Object.assign(f.raw(id).metadata, {
          "dalph.review_batch": batch,
          "dalph.previous_review_batch": "initial",
          "dalph.product_root": "root",
          "gc.root_bead_id": "human-root"
        })
      f.raw("review-control").metadata["gc.step_ref"] = "native-review-continuation.review"
      Object.assign(f.raw("delivery").metadata, {
        "dalph.review_batch": batch,
        "dalph.product_root": "root",
        "gc.root_bead_id": "human-root"
      })
      f.rows.set("human-root", { id: BeadId.make("human-root"), status: "open", metadata: {} })
      f.raw("review-prepare").metadata["dalph.previous_review_batch"] = "initial"
      const context = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ previous: Schema.NullOr(NativeReviewVerdict) })
      )(yield* f.review.context(yield* f.row("fix")))
      expect(context.previous?.round).toBe(4)
      expect(context.previous?.batch).toBe("initial")
      expect(context.previous?.findings[0]?.message).toBe("Retained repair")
      yield* f.review.prepare(yield* f.row("review-prepare"))
      expect(f.raw("fix").status).toBe("open")
      expect(f.raw("fix").metadata["gc.outcome"]).toBeUndefined()
      expect(f.raw("fix").metadata["gc.pack_workspace"]).toBe("work-work")
      yield* f.review.finishFix(yield* f.row("fix"), BeadId.make("fix-session"))
      yield* f.review.submit(yield* f.row("review"), yield* f.verdict)
      yield* f.review.gate(yield* f.row("review-control"))
      const approvals = Object.entries(f.raw("work").metadata).filter(([key]) =>
        key.startsWith("dalph.native_approved_")
      )
      expect(approvals).toHaveLength(1)
      const approved = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeReviewVerdict))(
        approvals[0]?.[1] ?? ""
      )
      expect(approved.batch).toBe(batch)
      expect(f.raw("work").metadata["dalph.native_attempt"]).toBe(original)
      expect(f.paths.has("/fixture/worktrees/work-work")).toBe(true)
      expect(f.state.qualificationCalls).toBe(1)
      yield* f.workflow.check(yield* f.row("review-control"))
      yield* f.workflow.integrate(yield* f.row("delivery"))
      expect(f.raw("delivery").status).toBe("closed")
      expect(f.raw("work").metadata["dalph.native_settled"]).toBeDefined()
      expect(f.raw("work").metadata["dalph.native_attempt"]).toBe(original)
      expect(f.state.pushCalls).toBe(1)
      expect(f.paths.size).toBe(0)
    }).pipe(Effect.provide(f.layer))
  })
)

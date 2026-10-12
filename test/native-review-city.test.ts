import { Effect, Schema, Schedule } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { makeNativeCity } from "./helpers/native-city.ts"
import { BoundaryFailure, BeadId } from "../src/domain/shared.ts"
import { isExecutionMetadata } from "../src/native/nodes.ts"
import { observeHumanContinuation } from "./helpers/native-continuation-city.ts"

for (const fault of ["converge", "blocking", "transport", "malformed"]) {
  it.live(
    `S3/S4 public native review ${fault}`,
    () =>
      Effect.gen(function* () {
        const city = yield* makeNativeCity(fault)
        const launch = yield* city
          .native("launch")
          .pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ workflow_id: BeadId }))))
          )
        const observed = yield* Effect.gen(function* () {
          const rows = (yield* city.rows()).filter((row) => row.metadata?.["gc.root_bead_id"] === launch.workflow_id)
          const control = rows.find(
            (row) => row.metadata?.["gc.kind"] === "ralph" && row.metadata["gc.step_ref"] === "native-one-task.review"
          )
          const work = rows.find((row) => row.metadata?.["dalph.phase"] === "work")
          const settled = !!work?.metadata?.["dalph.native_settled"]
          const scope = rows.find((row) => row.metadata?.["gc.scope_name"] === "delivery")
          if (fault === "converge" ? !settled : control?.status !== "closed" || scope?.status !== "closed")
            return yield* new BoundaryFailure({ message: `${fault} native review pending` })
          return { rows, work, control }
        }).pipe(Effect.retry({ schedule: Schedule.spaced("1 second").pipe(Schedule.upTo({ duration: "15 minutes" })) }))
        const reviews = observed.rows.filter(
          (row) => row.metadata?.["dalph.phase"] === "review" && isExecutionMetadata(row.metadata)
        )
        const rounds = [...new Set(reviews.map((row) => row.metadata?.["gc.iteration"]))].sort((left, right) =>
          (left ?? "").localeCompare(right ?? "")
        )
        if (fault === "converge") {
          expect(rounds).toEqual(["1", "2"])
          expect(observed.work?.metadata?.["dalph.native_approved_initial_2"]).toBeDefined()
          expect(yield* city.fs.readFileString(`${city.env.DALPH_TARGET_REPO}/native-review-fixed.ts`)).toContain("2")
        } else {
          const downstream = observed.rows.filter(
            (row) =>
              ["qualify", "deliver"].includes(row.metadata?.["dalph.phase"] ?? "") &&
              isExecutionMetadata(row.metadata ?? {})
          )
          expect(downstream).toHaveLength(2)
          expect(downstream.every((row) => row.status === "closed" && row.metadata?.["gc.outcome"] === "skipped")).toBe(
            true
          )
          expect(observed.work?.metadata?.["dalph.result"]).toBeUndefined()
          expect(observed.control?.metadata?.["gc.outcome"]).toBe("fail")
          expect(yield* city.worktreeEntries()).toHaveLength(1)
          expect((yield* city.git("worktree", "list", "--porcelain")).match(/^worktree /gm)).toHaveLength(2)
          if (fault === "blocking") {
            expect(rounds).toEqual(["1", "2", "3", "4"])
            expect(observed.work?.metadata?.["dalph.native_review_initial_4"]).toBeDefined()
          } else {
            expect(rounds).toEqual(["1"])
            expect(observed.work?.metadata?.["dalph.native_review_initial_1"]).toBeUndefined()
            expect(reviews.length).toBeLessThanOrEqual(3)
          }
        }
        expect(reviews.some((row) => row.metadata?.["gc.iteration"] === "5")).toBe(false)
        const attempt = observed.work?.metadata?.["dalph.native_attempt"]
        yield* city.native("resume", launch.workflow_id)
        const resumed = (yield* city.rows()).find((row) => row.id === observed.work?.id)
        expect(resumed?.metadata?.["dalph.native_attempt"]).toBe(attempt)
        if (fault === "blocking") {
          if (!observed.control || !observed.work || !attempt)
            return yield* new BoundaryFailure({ message: "missing exhausted native continuation identity" })
          yield* observeHumanContinuation(city, observed.control.id, observed.work.id, attempt)
        }
        yield* Effect.log(`Observed native review ${fault}: ${rounds.join(",")} (${reviews.length} reviewer attempts)`)
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    fault === "blocking" ? 3060000 : 1020000
  )
}

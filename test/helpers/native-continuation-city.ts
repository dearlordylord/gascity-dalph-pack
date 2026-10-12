import { Effect, Schema, Schedule } from "effect"
import { expect } from "@effect/vitest"
import { BeadId, BoundaryFailure } from "../../src/domain/shared.ts"
import { isExecutionMetadata } from "../../src/native/nodes.ts"
import type { makeNativeCity } from "./native-city.ts"
import { assertContinuationEvidence } from "./native-continuation-evidence.ts"
import { observeCleanHumanContinuation } from "./native-clean-continuation-city.ts"

export const observeHumanContinuation = Effect.fn("NativeTrial.humanContinuation")(function* (
  city: Effect.Success<ReturnType<typeof makeNativeCity>>,
  control: BeadId,
  work: BeadId,
  attempt: string
) {
  const launch = () =>
    city
      .native("continue", control, "native-acceptance-human-batch")
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ workflow_id: BeadId })))))
  const first = yield* launch()
  expect(yield* launch()).toEqual(first)
  const rows = yield* city.rows().pipe(
    Effect.flatMap((all) => {
      const batch = all.filter((row) => row.metadata?.["gc.root_bead_id"] === first.workflow_id)
      const scope = batch.find((row) => row.metadata?.["gc.scope_name"] === "delivery")
      return scope?.status === "closed"
        ? Effect.succeed(all)
        : Effect.fail(new BoundaryFailure({ message: "human continuation pending" }))
    }),
    Effect.retry({ schedule: Schedule.spaced("1 second").pipe(Schedule.upTo({ duration: "15 minutes" })) })
  )
  const batch = rows.filter((row) => row.metadata?.["gc.root_bead_id"] === first.workflow_id)
  yield* assertContinuationEvidence(rows, first.workflow_id, work, attempt)
  const reviews = batch.filter((row) => row.metadata?.["dalph.phase"] === "review" && isExecutionMetadata(row.metadata))
  expect(
    reviews.map((row) => row.metadata?.["gc.iteration"]).sort((left, right) => (left ?? "").localeCompare(right ?? ""))
  ).toEqual(["1", "2", "3", "4"])
  const downstream = batch.filter(
    (row) =>
      ["qualify", "deliver"].includes(row.metadata?.["dalph.phase"] ?? "") && isExecutionMetadata(row.metadata ?? {})
  )
  expect(downstream).toHaveLength(2)
  expect(downstream.every((row) => row.status === "closed" && row.metadata?.["gc.outcome"] === "skipped")).toBe(true)
  yield* city.native("resume", first.workflow_id)
  const retained = (yield* city.rows()).find((row) => row.id === work)
  expect(retained?.metadata?.["dalph.native_attempt"]).toBe(attempt)
  expect(retained?.metadata?.["dalph.result"]).toBeUndefined()
  expect(yield* city.worktreeEntries()).toHaveLength(1)
  expect((yield* city.git("worktree", "list", "--porcelain")).match(/^worktree /gm)).toHaveLength(2)
  expect(yield* launch()).toEqual(first)
  yield* Effect.log("Observed finite deduplicated human continuation on the original retained attempt")
  yield* observeCleanHumanContinuation(city, first.workflow_id, work, attempt)
})

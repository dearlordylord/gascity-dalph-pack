import { Effect, Schema, Schedule } from "effect"
import { expect } from "@effect/vitest"
import { BeadId, BoundaryFailure } from "../../src/domain/shared.ts"
import { NativeAttempt } from "../../src/native/contract.ts"
import { Result } from "../../src/domain/attempt.ts"
import { isExecutionMetadata } from "../../src/native/nodes.ts"
import { reviewFactKey } from "../../src/native/review-fact-key.ts"
import { NativeReviewVerdict } from "../../src/native/review-contract.ts"
import { assertContinuationWriters } from "./native-continuation-evidence.ts"
import type { makeNativeCity } from "./native-city.ts"

/** The same retained attempt can deliver after a later human batch receives a clean verdict. */
export const observeCleanHumanContinuation = Effect.fn("NativeTrial.cleanHumanContinuation")(function* (
  city: Pick<
    Effect.Success<ReturnType<typeof makeNativeCity>>,
    "root" | "fs" | "native" | "rows" | "git" | "execute" | "worktreeEntries"
  >,
  previousRoot: BeadId,
  work: BeadId,
  encodedAttempt: string
) {
  const prior = (yield* city.rows()).find(
    (row) => row.metadata?.["gc.root_bead_id"] === previousRoot && row.metadata["gc.kind"] === "ralph"
  )
  if (!prior) return yield* new BoundaryFailure({ message: "missing exhausted human control" })
  yield* city.fs.writeFileString(`${city.root}/native-human-clean`, "clean review for subsequent human batches")
  const launch = () =>
    city
      .native("continue", prior.id, "native-acceptance-human-clean")
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ workflow_id: BeadId })))))
  const started = yield* launch()
  expect(yield* launch()).toEqual(started)
  yield* city.native("resume", started.workflow_id)
  const rows = yield* city.rows().pipe(
    Effect.flatMap((all) =>
      all.some((row) => row.id === work && row.metadata?.["dalph.native_settled"]) &&
      all.some(
        (row) =>
          row.metadata?.["gc.root_bead_id"] === started.workflow_id &&
          row.metadata?.["gc.scope_name"] === "delivery" &&
          row.status === "closed"
      )
        ? Effect.succeed(all)
        : Effect.fail(new BoundaryFailure({ message: "clean human delivery pending" }))
    ),
    Effect.retry({ schedule: Schedule.spaced("1 second").pipe(Schedule.upTo({ duration: "15 minutes" })) })
  )
  const retained = rows.find((row) => row.id === work)
  const attempt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeAttempt))(encodedAttempt)
  const result = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Result))(
    retained?.metadata?.["dalph.result"] ?? ""
  )
  expect(retained?.metadata?.["dalph.native_attempt"]).toBe(encodedAttempt)
  expect(result.attempt).toBe(attempt.plan.attempt)
  const batch = rows.filter((row) => row.metadata?.["gc.root_bead_id"] === started.workflow_id)
  const reviews = batch.filter((row) => row.metadata?.["dalph.phase"] === "review" && isExecutionMetadata(row.metadata))
  expect(reviews).toHaveLength(1)
  expect(reviews[0]?.metadata?.["gc.iteration"]).toBe("1")
  const reviewer = reviews[0]
  if (!reviewer) return yield* new BoundaryFailure({ message: "missing clean human reviewer" })
  const approved = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeReviewVerdict))(
    retained?.metadata?.[
      `dalph.${reviewFactKey("native_approved", reviewer.metadata?.["dalph.review_batch"] ?? "", 1)}`
    ] ?? ""
  )
  expect(approved.node).toBe(reviewer.id)
  expect(approved.session).toBe(reviewer.metadata?.["gc.session_id"])
  expect(approved.batch).toBe(reviewer.metadata?.["dalph.review_batch"])
  expect(approved.task).toBe(attempt.task)
  expect(approved.base).toBe(attempt.plan.base)
  expect(approved.attempt).toBe(attempt.plan.attempt)
  expect(approved.commit).toBe(result.commit)
  expect(approved.findings.some((finding) => finding.disposition === "blocking")).toBe(false)
  expect(yield* assertContinuationWriters(rows, started.workflow_id, attempt)).toHaveLength(2)
  expect(batch.find((row) => row.metadata?.["dalph.phase"] === "deliver")?.metadata?.["gc.outcome"]).toBe("pass")
  yield* city.native("resume", started.workflow_id)
  expect(yield* city.worktreeEntries()).toEqual([])
  expect((yield* city.git("worktree", "list", "--porcelain")).match(/^worktree /gm)).toHaveLength(1)
  expect(yield* city.git("status", "--porcelain")).toBe("")
  const remote = yield* city.execute(["git", "--git-dir", `${city.root}/remote.git`, "rev-parse", "refs/heads/master"])
  expect(yield* city.git("rev-parse", "HEAD")).toBe(remote)
  yield* city.git("merge-base", "--is-ancestor", approved.commit, remote)
  yield* Effect.log("Observed clean human continuation delivering the original attempt and cleaning exact resources")
})

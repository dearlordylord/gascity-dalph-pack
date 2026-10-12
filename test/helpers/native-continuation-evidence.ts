import { Effect, Schema } from "effect"
import { expect } from "@effect/vitest"
import type { Bead } from "../../src/delivery/tracker.ts"
import type { BeadId } from "../../src/domain/shared.ts"
import { NativeAttempt, NativeSession } from "../../src/native/contract.ts"
import { NativeReviewVerdict } from "../../src/native/review-contract.ts"
import { isExecutionMetadata } from "../../src/native/nodes.ts"
import { reviewFactKey } from "../../src/native/review-fact-key.ts"

export const assertContinuationWriters = Effect.fn("NativeTrial.continuationWriters")(function* (
  rows: ReadonlyArray<Bead>,
  root: BeadId,
  attempt: typeof NativeAttempt.Type
) {
  const writers = rows.filter(
    (row) =>
      row.metadata?.["gc.root_bead_id"] === root &&
      ["review", "fix"].includes(row.metadata?.["dalph.phase"] ?? "") &&
      isExecutionMetadata(row.metadata ?? {})
  )
  for (const writer of writers) {
    const retained = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeAttempt))(
      writer.metadata?.["dalph.native_attempt"] ?? ""
    )
    expect(retained).toEqual(attempt)
    const sessions = rows.filter((row) => row.metadata?.["gc.trigger_bead_id"] === writer.id)
    expect(sessions.length).toBeGreaterThan(0)
    for (const row of sessions) {
      const session = yield* Schema.decodeUnknownEffect(NativeSession)(row)
      expect(session.metadata.work_dir).toBe(attempt.plan.path)
      expect(session.metadata.template).toBe(writer.metadata?.["gc.run_target"])
    }
  }
  return writers
})

export const assertContinuationEvidence = Effect.fn("NativeTrial.continuationEvidence")(function* (
  rows: ReadonlyArray<Bead>,
  root: BeadId,
  work: BeadId,
  encodedAttempt: string
) {
  const attempt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeAttempt))(encodedAttempt)
  const batch = rows.filter((row) => row.metadata?.["gc.root_bead_id"] === root)
  const control = batch.find((row) => row.metadata?.["gc.kind"] === "ralph")
  expect(control?.status).toBe("closed")
  expect(control?.metadata?.["gc.outcome"]).toBe("fail")
  expect(control?.metadata?.["gc.failed_attempt"]).toBe("4")
  expect(control?.metadata?.["gc.max_attempts"]).toBe("4")
  expect(control?.metadata?.["gc.final_disposition"]).not.toBe("hard_fail")
  const writers = yield* assertContinuationWriters(rows, root, attempt)
  expect(writers).toHaveLength(8)
  const fourth = writers.find(
    (row) => row.metadata?.["dalph.phase"] === "review" && row.metadata["gc.iteration"] === "4"
  )
  const batchId = fourth?.metadata?.["dalph.review_batch"]
  const verdict = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeReviewVerdict))(
    rows.find((row) => row.id === work)?.metadata?.[`dalph.${reviewFactKey("native_review", batchId ?? "", 4)}`] ?? ""
  )
  expect(verdict.node).toBe(fourth?.id)
  expect(verdict.round).toBe(4)
  expect(verdict.batch).toBe(batchId)
  expect(verdict.attempt).toBe(attempt.plan.attempt)
  expect(verdict.findings.some((finding) => finding.disposition === "blocking")).toBe(true)
})

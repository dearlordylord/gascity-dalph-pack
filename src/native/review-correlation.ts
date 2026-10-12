import { canonical } from "../delivery/files.ts"
import type { Bead } from "../delivery/tracker.ts"
import type { NativeReviewVerdict } from "./review-contract.ts"
import type { NativeAttempt, NativeSession } from "./contract.ts"
import { isExecutionMetadata } from "./nodes.ts"

export function reviewSessionMatches(session: typeof NativeSession.Type, current: Bead, path: string) {
  return (
    session.metadata["gc.trigger_bead_id"] === current.id &&
    session.metadata.work_dir === path &&
    session.metadata.template === current.metadata?.["gc.run_target"]
  )
}

export const reviewBatch = (row: Bead) => row.metadata?.["dalph.review_batch"] ?? "initial"
/** Transport retry ordinal is distinct from the enclosing semantic review round. */
const retryOrdinal = (row: Bead) => Number(row.metadata?.["gc.retry_attempt"] ?? row.metadata?.["gc.attempt"] ?? 1)
export function reviewNodes(rows: ReadonlyArray<Bead>, round: number, batch: string) {
  const candidates = rows.filter(
    (row) =>
      row.metadata?.["dalph.phase"] === "review" &&
      isExecutionMetadata(row.metadata) &&
      row.metadata["gc.iteration"] === String(round) &&
      reviewBatch(row) === batch
  )
  if (candidates.some((row) => !Number.isSafeInteger(retryOrdinal(row)) || retryOrdinal(row) < 1)) return []
  const latest = Math.max(1, ...candidates.map(retryOrdinal))
  return candidates.filter((row) => retryOrdinal(row) === latest)
}
export function reviewIdentityMatches(
  verdict: NativeReviewVerdict,
  expected: Omit<NativeReviewVerdict, "version" | "session" | "basis" | "findings">
) {
  const observed = {
    node: verdict.node,
    round: verdict.round,
    batch: verdict.batch,
    attempt: verdict.attempt,
    task: verdict.task,
    base: verdict.base,
    commit: verdict.commit
  }
  return canonical(observed) === canonical(expected)
}

export function nativeWriterNode(
  rows: ReadonlyArray<Bead>,
  session: typeof NativeSession.Type,
  phases: ReadonlyArray<string>
) {
  const node = rows.find((row) => row.id === session.metadata["gc.trigger_bead_id"])
  return node && phases.includes(node.metadata?.["dalph.phase"] ?? "") && isExecutionMetadata(node.metadata ?? {})
    ? node
    : undefined
}

export function cleanReviewOf(verdict: NativeReviewVerdict, attempt: typeof NativeAttempt.Type, commit: string) {
  return (
    verdict.commit === commit &&
    verdict.attempt === attempt.plan.attempt &&
    verdict.task === attempt.task &&
    verdict.base === attempt.plan.base &&
    !verdict.findings.some((finding) => finding.disposition === "blocking")
  )
}

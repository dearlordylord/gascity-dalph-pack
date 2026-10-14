import { Effect } from "effect"
import type { Bead } from "../delivery/tracker.ts"
import { BoundaryFailure } from "../domain/shared.ts"
import { isExecutionMetadata, isReviewControlMetadata } from "./nodes.ts"

const blockers = (row: Bead): ReadonlyArray<string> => [
  ...(row.needs ?? []),
  ...(row.dependencies ?? []).filter((dep) => dep.type === "blocks").map((dep) => dep.depends_on_id)
]
const reaches = (rows: ReadonlyArray<Bead>, from: string, target: string): boolean => {
  const visited = new Set<string>()
  const pending = [from]
  while (pending.length) {
    const next = pending.pop()
    if (next === target) return true
    if (!next || visited.has(next)) continue
    visited.add(next)
    const row = rows.find((row) => row.id === next)
    if (row) pending.push(...blockers(row))
  }
  return false
}
const requiredPhase = Effect.fn("Product.requiredPhase")(function* (rows: ReadonlyArray<Bead>, name: string) {
  const matches = rows.filter((row) => row.metadata?.["dalph.phase"] === name && isExecutionMetadata(row.metadata))
  if (matches.length !== 1 || !matches[0])
    return yield* new BoundaryFailure({
      message: "product batch is missing its activation/review/delivery dependency chain"
    })
  return matches[0]
})
const reviewOwner = Effect.fn("Product.reviewOwner")(function* (rows: ReadonlyArray<Bead>) {
  const controls = rows.filter((row) => isReviewControlMetadata(row.metadata ?? {}))
  if (controls.length !== 1 || !controls[0])
    return yield* new BoundaryFailure({ message: "product batch has no exact four-round review owner" })
  if (controls[0].metadata?.["gc.max_attempts"] !== "4")
    return yield* new BoundaryFailure({ message: "product batch has no exact four-round review owner" })
  return controls[0]
})
/** Later Ralph rounds are admitted by the logical owner, not a repeated work edge on each leaf. */
const ownedIteration = (rows: ReadonlyArray<Bead>, review: Bead, control: Bead) => {
  const parents = (review.dependencies ?? [])
    .filter((dep) => dep.type === "tracks")
    .map((dep) => rows.find((row) => row.id === dep.depends_on_id))
  const exact = parents.filter(
    (parent) => parent?.metadata?.["gc.kind"] === "scope" && parent.metadata["gc.logical_bead_id"] === control.id
  )
  if (exact.length !== 1 || !exact[0]) return false
  return blockers(control).includes(exact[0].id) && reaches(rows, exact[0].id, review.id)
}
const verifyReviewChain = Effect.fn("Product.verifyReviewChain")(function* (
  rows: ReadonlyArray<Bead>,
  work: Bead,
  control: Bead
) {
  const review = rows.filter((row) => row.metadata?.["dalph.phase"] === "review" && isExecutionMetadata(row.metadata))
  if (!reaches(rows, control.id, work.id))
    return yield* new BoundaryFailure({ message: "product review owner does not depend on its implementation" })
  if (!review.length || review.some((row) => !reaches(rows, row.id, work.id) && !ownedIteration(rows, row, control)))
    return yield* new BoundaryFailure({ message: "product review does not depend on its implementation" })
})
/** Native dependency observations must retain review and the complete delivery chain. */
export const verifyProductChain = Effect.fn("Product.verifyChain")(function* (
  rows: ReadonlyArray<Bead>,
  activation: string
) {
  const control = yield* reviewOwner(rows)
  const prepare = yield* requiredPhase(rows, "prepare")
  const work = yield* requiredPhase(rows, "work")
  const qualify = yield* requiredPhase(rows, "qualify")
  const deliver = yield* requiredPhase(rows, "deliver")
  yield* verifyReviewChain(rows, work, control)
  const chain: ReadonlyArray<readonly [string, string]> = [
    [prepare.id, activation],
    [work.id, prepare.id],
    [qualify.id, control.id],
    [deliver.id, qualify.id]
  ]
  if (chain.some(([from, to]) => !reaches(rows, from, to)))
    return yield* new BoundaryFailure({
      message: "product batch is missing its activation/review/delivery dependency chain"
    })
})

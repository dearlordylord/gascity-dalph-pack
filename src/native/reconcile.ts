import { Effect, Schema } from "effect"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { Bead, Commands, makeTracker } from "../delivery/tracker.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { NativeSession, NativeAttempt, NativeProposal } from "./contract.ts"
import { stopNativeWriter } from "./session-stop.ts"
import { nativeSession } from "./session.ts"
import { nativeWriterNode, reviewSessionMatches } from "./review-correlation.ts"
import { isExecutionMetadata } from "./nodes.ts"
import { nativeWriterInventory, NativeSessionBoundaryConcurrency } from "./session-inventory.ts"
import { historicalWritersStopped } from "./historical-writers.ts"
import { completedReassignedProducer } from "./completed-producer.ts"

const observedSession = Effect.fn("Native.observedSession")(function* (
  seen: ReadonlyArray<string>,
  proposal?: typeof NativeProposal.Type | null
) {
  if (!seen.length || (proposal && !seen.includes(proposal.session)))
    return yield* new BoundaryFailure({ message: "retained native writer inventory is missing; resume blocked" })
})
const proposalSessions = (proposal: typeof NativeProposal.Type | null) => (proposal ? [proposal.session] : [])
type ScopedBead = Bead & { readonly metadata: NonNullable<Bead["metadata"]> }
const ownsProduct = (row: Bead, attempt: typeof NativeAttempt.Type): row is ScopedBead => {
  const metadata = row.metadata
  if (!metadata) return false
  return (
    (metadata["dalph.product_root"] || metadata["gc.root_bead_id"]) === attempt.root &&
    metadata["dalph.task"] === attempt.task
  )
}
const intrudesWorkspace = (session: typeof NativeSession.Type, attempt: typeof NativeAttempt.Type) =>
  session.status !== "closed" &&
  session.metadata.work_dir === attempt.plan.path &&
  session.metadata.current_claim_bead_id !== attempt.plan.bead
const reassignedProposal = (proposal: typeof NativeProposal.Type | null, session: typeof NativeSession.Type) =>
  proposal?.session === session.id ? proposal : null
/** Retained publications do not occupy the attempt when their pool session moved away. */
type ReconciliationObservation =
  | { readonly _tag: "RetainedWriter"; readonly session: typeof BeadId.Type }
  | { readonly _tag: "ActiveOwnedWriter"; readonly session: typeof BeadId.Type }
  | { readonly _tag: "Unrelated" }
const producerSessionMatches = Effect.fn("Native.producerSessionMatches")(function* (
  tracker: ReturnType<typeof makeTracker>,
  attempt: typeof NativeAttempt.Type,
  session: typeof NativeSession.Type
) {
  const claim = session.metadata.current_claim_bead_id
  const original = yield* tracker.bead(attempt.plan.bead)
  if (claim) {
    if (claim !== attempt.plan.bead) return false
    if (original.metadata?.["gc.session_id"] !== session.id)
      return yield* new BoundaryFailure({ message: "native claim has a contradictory task-to-session binding" })
    return true
  }
  if (original.metadata?.["gc.session_id"] !== session.id) return false
  if (session.status !== "closed")
    return yield* new BoundaryFailure({ message: "retained native session has no proven current claim" })
  return true
})
export const reconcileNativeAttempt = Effect.fn("Native.reconcileAttempt")(function* (
  config: RuntimeConfig,
  commands: Commands,
  attempt: typeof NativeAttempt.Type,
  proposal: typeof NativeProposal.Type | null,
  tracker: ReturnType<typeof makeTracker>
) {
  const inventory = yield* nativeWriterInventory(config, commands, proposalSessions(proposal))
  const observed = yield* Effect.forEach(
    inventory.filter((row) => row.template === attempt.contract.agent),
    (row) =>
      Effect.gen(function* () {
        const session = yield* nativeSession(config, commands, row.id)
        if (!(yield* producerSessionMatches(tracker, attempt, session))) {
          const historical = reassignedProposal(proposal, session)
          if (historical) {
            yield* completedReassignedProducer(config, commands, tracker, attempt, historical, session)
            return { _tag: "RetainedWriter", session: session.id } satisfies ReconciliationObservation
          }
          return { _tag: "Unrelated" } satisfies ReconciliationObservation
        }
        if (session.metadata.work_dir !== attempt.plan.path || session.metadata.template !== attempt.contract.agent)
          return yield* new BoundaryFailure({
            message: "retained native session has contradictory worktree correlation"
          })
        if (session.status !== "closed") {
          return { _tag: "ActiveOwnedWriter", session: session.id } satisfies ReconciliationObservation
        }
        yield* stopNativeWriter(config, commands, tracker, session, attempt.plan.bead, { _tag: "RetainedRecovery" })
        return { _tag: "RetainedWriter", session: session.id } satisfies ReconciliationObservation
      }),
    { concurrency: NativeSessionBoundaryConcurrency }
  )
  const seen = observed.filter((row) => row._tag !== "Unrelated").map((row) => row.session)
  const occupied = observed.filter((row) => row._tag === "ActiveOwnedWriter").length
  yield* observedSession(seen, proposal)
  if (occupied > 1)
    return yield* new BoundaryFailure({
      message: "multiple retained native writers; resume refused without freeing capacity"
    })
})

const missingReviewSession = (rows: ReadonlyArray<ScopedBead>, seen: ReadonlySet<string>) =>
  rows.some((row) => {
    const metadata = row.metadata
    return (
      ["review", "fix"].includes(metadata["dalph.phase"] ?? "") &&
      isExecutionMetadata(metadata) &&
      !!metadata["gc.session_id"] &&
      !seen.has(metadata["gc.session_id"])
    )
  })
const observeHistoricalReview = Effect.fn("Native.observeHistoricalReview")(function* (
  config: RuntimeConfig,
  commands: Commands,
  tracker: ReturnType<typeof makeTracker>,
  owned: ReadonlyArray<ScopedBead>,
  attempt: typeof NativeAttempt.Type,
  session: typeof NativeSession.Type
) {
  const writers = owned.filter((row) => ["review", "fix"].includes(row.metadata["dalph.phase"] ?? ""))
  if (yield* historicalWritersStopped(config, commands, tracker, writers, attempt.plan.path, session)) {
    return true
  }
  if (intrudesWorkspace(session, attempt))
    return yield* new BoundaryFailure({ message: "unrelated native writer shares the retained attempt workspace" })
  return false
})
export const reconcileNativeReviews = Effect.fn("Native.reconcileReviews")(function* (
  config: RuntimeConfig,
  commands: Commands,
  attempt: typeof NativeAttempt.Type,
  rows: ReadonlyArray<Bead>,
  tracker: ReturnType<typeof makeTracker>
) {
  const owned = rows.filter((row) => ownsProduct(row, attempt))
  const requiredIds = owned
    .filter(
      (row) =>
        ["review", "fix"].includes(row.metadata["dalph.phase"] ?? "") &&
        isExecutionMetadata(row.metadata) &&
        row.metadata["gc.session_id"]
    )
    .map((row) => row.metadata?.["gc.session_id"])
  const required = yield* Effect.forEach(requiredIds, (id) => Schema.decodeUnknownEffect(BeadId)(id))
  const inventory = yield* nativeWriterInventory(config, commands, required)
  const observed = yield* Effect.forEach(
    inventory,
    (entry) =>
      Effect.gen(function* () {
        const session = yield* nativeSession(config, commands, entry.id)
        const node = nativeWriterNode(owned, session, ["review", "fix"])
        if (!node) {
          if (yield* observeHistoricalReview(config, commands, tracker, owned, attempt, session))
            return { _tag: "RetainedWriter", session: session.id } satisfies ReconciliationObservation
          return { _tag: "Unrelated" } satisfies ReconciliationObservation
        }
        if (!reviewSessionMatches(session, node, attempt.plan.path))
          return yield* new BoundaryFailure({ message: "retained review/fix session correlation is contradictory" })
        if (session.status !== "closed") {
          return { _tag: "ActiveOwnedWriter", session: session.id } satisfies ReconciliationObservation
        }
        yield* stopNativeWriter(config, commands, tracker, session, node.id, { _tag: "RetainedRecovery" })
        return { _tag: "RetainedWriter", session: session.id } satisfies ReconciliationObservation
      }),
    { concurrency: NativeSessionBoundaryConcurrency }
  )
  const seen = new Set(observed.filter((row) => row._tag !== "Unrelated").map((row) => row.session))
  const occupied = observed.filter((row) => row._tag === "ActiveOwnedWriter").length
  if (missingReviewSession(owned, seen))
    return yield* new BoundaryFailure({ message: "retained review/fix session inventory is missing; resume blocked" })
  if (occupied > 1)
    return yield* new BoundaryFailure({ message: "multiple retained review/fix sessions; resume refused" })
})

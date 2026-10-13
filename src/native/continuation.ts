import { createHash } from "node:crypto"
import { basename } from "node:path"
import { Effect, Schema } from "effect"
import { canonical } from "../delivery/files.ts"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Bead, Commands, makeTracker } from "../delivery/tracker.ts"
import type { Git } from "../delivery/git.ts"
import { NativeCookResponse, type NativeContract } from "./contract.ts"
import { nativeRows } from "./identity.ts"
import { nativePreflight } from "./preflight.ts"
import { nativeCheckLauncher } from "./launcher.ts"
import { makeNativeReview } from "./review.ts"
import { reviewBatch } from "./review-correlation.ts"
import { NativeReviewVerdict, REVIEW_ROUNDS } from "./review-contract.ts"
import { isReviewControlMetadata } from "./nodes.ts"
import { WorkspaceSlug } from "./shared-workspace.ts"
import { reviewFactKey } from "./review-fact-key.ts"

type Tracker = ReturnType<typeof makeTracker>
const HumanKey = Schema.String.check(Schema.isMinLength(1))
export const continuationBatch = (root: string, key: string) =>
  `human-${createHash("sha256")
    .update(JSON.stringify([root, key]))
    .digest("hex")}`
const pendingBatch = (rows: ReadonlyArray<Bead>, root: BeadId) =>
  rows.some(
    (row) =>
      row.metadata?.["dalph.product_root"] === root && isReviewControlMetadata(row.metadata) && row.status !== "closed"
  )

const unavailableAttempt = (rows: ReadonlyArray<Bead>, root: BeadId, work: Bead) =>
  pendingBatch(rows, root) || !!work.metadata?.["dalph.result"]
const exhaustedBudget = (metadata: Readonly<Record<string, string>>) =>
  metadata["gc.max_attempts"] === String(REVIEW_ROUNDS) &&
  metadata["gc.failed_attempt"] === String(REVIEW_ROUNDS) &&
  metadata["gc.final_disposition"] !== "hard_fail"
const exhaustedReviewNode = (current: Bead, round: number) =>
  isReviewControlMetadata(current.metadata ?? {}) &&
  current.status === "closed" &&
  exhaustedBudget(current.metadata ?? {}) &&
  current.metadata?.["gc.outcome"] === "fail" &&
  round === REVIEW_ROUNDS
const blockingVerdict = (verdict: NativeReviewVerdict | null) =>
  !!verdict && verdict.findings.some((finding) => finding.disposition === "blocking")
const submittedBatch = (rows: ReadonlyArray<Bead>, root: BeadId, batch: string) =>
  rows.find((row) => row.metadata?.["dalph.product_root"] === root && reviewBatch(row) === batch)

export const makeNativeContinuation = (
  config: RuntimeConfig,
  contract: NativeContract,
  commands: Commands,
  tracker: Tracker,
  git: Git,
  nodeExecutable: string
) => {
  const review = makeNativeReview(config, commands, tracker, git)
  const reviewer = contract.reviewer ?? `${config.rig}/dalph.native-reviewer`
  const continuation = Effect.fn("Native.continueReview")(function* (current: Bead, input: string) {
    const key = yield* Schema.decodeUnknownEffect(HumanKey)(input)
    return yield* git.guarded(
      Effect.gen(function* () {
        const facts = yield* review.context(current)
        if (canonical(contract) !== canonical(facts.attempt.contract))
          return yield* new BoundaryFailure({ message: "continuation requires the original attempt contract" })
        const batch = continuationBatch(facts.attempt.root, key)
        const rows = yield* nativeRows(config)
        const existing = submittedBatch(rows, facts.attempt.root, batch)
        if (existing) {
          const root = yield* Schema.decodeUnknownEffect(BeadId)(existing.metadata?.["gc.root_bead_id"])
          yield* tracker.record(root, "native_launch", { version: "native-v1", contract })
          return { workflow_id: root }
        }
        if (!exhaustedReviewNode(current, facts.round))
          return yield* new BoundaryFailure({
            message: "human continuation requires an exhausted native review control"
          })
        if (unavailableAttempt(rows, facts.attempt.root, facts.group.work))
          return yield* new BoundaryFailure({ message: "retained task already has a pending batch or accepted result" })
        const verdict = yield* tracker.fact(
          facts.group.work.id,
          reviewFactKey("native_review", facts.batch, REVIEW_ROUNDS),
          NativeReviewVerdict
        )
        if (!blockingVerdict(verdict))
          return yield* new BoundaryFailure({ message: "continuation has no retained fourth-round blocking findings" })
        yield* review.gate(current).pipe(Effect.catchTag("ReviewBlocking", () => Effect.void))
        yield* nativePreflight(config, contract, commands)
        const check = yield* nativeCheckLauncher(config, commands, nodeExecutable, "review-gate")
        const workspace = yield* Schema.decodeUnknownEffect(WorkspaceSlug)(basename(facts.attempt.plan.path))
        const response = yield* commands.execute(config.root, [
          ...tracker.gc,
          "formula",
          "cook",
          "native-review-continuation",
          "--json",
          "--var",
          `agent=${contract.agent}`,
          "--var",
          `workspace=${workspace}`,
          "--var",
          `reviewer=${reviewer}`,
          "--var",
          `review_check=${check}`,
          "--var",
          `batch=${batch}`,
          "--var",
          `product_root=${facts.attempt.root}`,
          "--var",
          `previous_batch=${facts.batch}`
        ])
        const cooked = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeCookResponse))(response)
        const launch = { workflow_id: cooked.root_id }
        yield* tracker.record(launch.workflow_id, "native_launch", { version: "native-v1", contract })
        return launch
      })
    )
  })
  return { continuation }
}

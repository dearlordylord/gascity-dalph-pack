import { Effect, FileSystem, Schema } from "effect"
import { randomUUID } from "node:crypto"
import { Prepared } from "../domain/attempt.ts"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import { Bead as BeadSchema, type Bead, type Commands, type makeTracker } from "../delivery/tracker.ts"
import { canonical } from "../delivery/files.ts"
import { NativeAttempt, NativeContract, NativeCookResponse, NativeProposal } from "./contract.ts"
import { nativePreflight } from "./preflight.ts"
import { nativeRows } from "./identity.ts"
import { isExecutionMetadata, isImplementationMetadata } from "./nodes.ts"
import { reconcileNativeAttempt, reconcileNativeReviews } from "./reconcile.ts"
import { nativeCheckLauncher } from "./launcher.ts"
import { settleNative } from "./settlement.ts"
import { WorkspaceSlug } from "./shared-workspace.ts"
import { cleanupMayResume } from "./cleanup-resumption.ts"

type Tracker = ReturnType<typeof makeTracker>
export const makeNativeController = (
  config: RuntimeConfig,
  contract: NativeContract,
  commands: Commands,
  tracker: Tracker,
  nodeExecutable: string
) => {
  const launch = Effect.fn("Native.launch")(function* (instruction: string) {
    yield* nativePreflight(config, contract, commands)
    const check = yield* nativeCheckLauncher(config, commands, nodeExecutable)
    const reviewCheck = yield* nativeCheckLauncher(config, commands, nodeExecutable, "review-gate")
    const workspace = WorkspaceSlug.make(`work-${randomUUID()}`)
    const response = yield* commands.execute(config.root, [
      ...tracker.gc,
      "formula",
      "cook",
      "native-one-task",
      "--json",
      "--var",
      `instruction=${instruction}`,
      "--var",
      `workspace=${workspace}`,
      "--var",
      `agent=${contract.agent}`,
      "--var",
      `pack=${config.pack}`,
      "--var",
      `check=${check}`,
      "--var",
      `review_check=${reviewCheck}`,
      "--var",
      `reviewer=${contract.reviewer ?? `${config.rig}/dalph.native-reviewer`}`
    ])
    const cooked = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeCookResponse))(response)
    const result = { workflow_id: cooked.root_id }
    yield* tracker.record(result.workflow_id, "native_launch", { version: "native-v1", contract })
    return result
  })
  const resourceMissing = Effect.fn("Native.resourceMissing")(function* (
    delivery: Bead,
    attempt: typeof NativeAttempt.Type,
    prepared: typeof Prepared.Type
  ) {
    const fs = yield* FileSystem.FileSystem
    if (yield* fs.exists(attempt.plan.path)) return false
    return !(yield* cleanupMayResume(tracker, delivery, attempt, prepared))
  })
  const retainedResource = Effect.fn("Native.retainedResource")(function* (
    row: Bead,
    rows: ReadonlyArray<Bead>,
    root: BeadId,
    workflowRoot: BeadId
  ) {
    const attempt = yield* tracker.fact(row.id, "native_attempt", NativeAttempt)
    const prepared = yield* tracker.fact(row.id, "work_prepared", Prepared)
    if (!attempt || !prepared) return
    if (attempt.root !== root || attempt.plan.bead !== row.id)
      return yield* new BoundaryFailure({ message: "native resume attempt identity is contradictory" })
    const deliveries = rows.filter(
      (node) =>
        node.metadata?.["gc.root_bead_id"] === workflowRoot &&
        node.metadata?.["dalph.task"] === attempt.task &&
        node.metadata?.["dalph.phase"] === "deliver" &&
        isExecutionMetadata(node.metadata)
    )
    if (deliveries.length !== 1)
      return yield* new BoundaryFailure({ message: "native resume has no exact delivery identity" })
    const delivery = yield* Schema.decodeUnknownEffect(BeadSchema)(deliveries[0])
    if (yield* settleNative(tracker, delivery, attempt)) return
    yield* reconcileNativeAttempt(
      config,
      commands,
      attempt,
      yield* tracker.fact(row.id, "native_proposal", NativeProposal),
      tracker
    )
    yield* reconcileNativeReviews(config, commands, attempt, rows, tracker)
    if (yield* resourceMissing(delivery, attempt, prepared)) {
      return yield* new BoundaryFailure({
        message: "prepared native worktree is lost; no recreation or resume authorized"
      })
    }
  })
  const retainedResources = Effect.fn("Native.retainedResources")(function* (root: BeadId) {
    const rows = yield* nativeRows(config)
    const continuation = rows.find(
      (row) => row.metadata?.["gc.root_bead_id"] === root && row.metadata["dalph.product_root"]
    )
    const productRoot = yield* Schema.decodeUnknownEffect(BeadId)(
      continuation?.metadata?.["dalph.product_root"] || root
    )
    const work = rows.filter(
      (row) => isImplementationMetadata(row.metadata ?? {}) && row.metadata?.["gc.root_bead_id"] === productRoot
    )
    for (const row of work) yield* retainedResource(row, rows, productRoot, root)
  })
  const resume = Effect.fn("Native.resume")(function* (root: BeadId) {
    const launch = yield* tracker.fact(
      root,
      "native_launch",
      Schema.Struct({ version: Schema.Literal("native-v1"), contract: NativeContract })
    )
    if (!launch)
      return yield* new BoundaryFailure({
        message: "legacy workflow has no native-v1 launch; resume refused before mutation"
      })
    if (canonical(contract) !== canonical(launch.contract))
      return yield* new BoundaryFailure({ message: "native resume requires the original launch contract" })
    yield* nativePreflight(config, launch.contract, commands)
    yield* retainedResources(root)
    yield* commands.execute(config.root, ["gc", "--city", config.city, "resume"])
  })
  return { launch, resume }
}

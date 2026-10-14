import { randomUUID } from "node:crypto"
import { Effect, Schema } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import type { RuntimeConfig } from "../delivery/config.ts"
import { canonical } from "../delivery/files.ts"
import type { Bead, Commands, makeTracker } from "../delivery/tracker.ts"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import { NativeAttachResponse, type NativeContract } from "./contract.ts"
import { nativeRows } from "./identity.ts"
import { nativeCheckLauncher } from "./launcher.ts"
import { acknowledgeNativeMetadataOutcome } from "./metadata-acknowledgement.ts"
import { nativeMetadataCAS } from "./metadata-http.ts"
import { ProductBatchObservation, ProductLaunchIntent, ProductTask } from "./product-contract.ts"
import { WorkspaceSlug } from "./shared-workspace.ts"
import { observeProductBatch } from "./product-observation.ts"

type Tracker = ReturnType<typeof makeTracker>
const validateIntent = Effect.fn("Product.validateIntent")(function* (
  intent: typeof ProductLaunchIntent.Type,
  root: BeadId,
  completion: Bead,
  current: Bead,
  task: typeof ProductTask.Type,
  contract: NativeContract
) {
  if (
    intent.workflow !== root ||
    intent.completion !== completion.id ||
    intent.launch !== current.id ||
    intent.task !== task ||
    intent.instruction !== current.description ||
    canonical(intent.contract) !== canonical(contract)
  )
    return yield* new BoundaryFailure({ message: "product launch no longer matches its immutable intent" })
})
const requireOne = Effect.fn("Product.requireOne")(function* (rows: ReadonlyArray<Bead>, boundary: string) {
  if (rows.length !== 1 || !rows[0])
    return yield* new BoundaryFailure({ message: `product ${boundary} requires one exact native bead` })
  return rows[0]
})
export const makeProductLaunch = (
  config: RuntimeConfig,
  contract: NativeContract,
  commands: Commands,
  tracker: Tracker,
  nodeExecutable: string
) => {
  const observeBatch = (intent: typeof ProductLaunchIntent.Type) => observeProductBatch(config, intent)
  const cook = Effect.fn("Product.cookBatch")(function* (intent: typeof ProductLaunchIntent.Type) {
    const variables = {
      instruction: intent.instruction,
      workspace: intent.workspace,
      agent: contract.agent,
      reviewer: contract.reviewer ?? `${config.rig}/dalph.native-reviewer`,
      pack: config.pack,
      check: intent.check,
      review_check: intent.reviewCheck,
      product_workflow: intent.workflow,
      product_completion: intent.completion,
      product_launch: intent.launch
    }
    const response = yield* commands.execute(config.root, [
      ...tracker.gc,
      "formula",
      "cook",
      "native-product-task",
      "--attach",
      intent.completion,
      "--json",
      ...Object.entries(variables).flatMap(([key, value]) => ["--var", `${key}=${value}`])
    ])
    const cooked = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeAttachResponse))(response)
    const observed = yield* observeBatch(intent)
    if (observed.root !== cooked.root_id)
      return yield* new BoundaryFailure({ message: "product cook returned a different correlated root" })
    return observed
  })
  const launch = Effect.fn("Product.launchTask")(function* (current: Bead) {
    const task = yield* Schema.decodeUnknownEffect(ProductTask)(current.metadata?.["dalph.product_task"])
    const root = yield* Schema.decodeUnknownEffect(BeadId)(current.metadata?.["gc.root_bead_id"])
    const completion = yield* requireOne(
      (yield* nativeRows(config)).filter(
        (row) =>
          row.metadata?.["gc.root_bead_id"] === root &&
          row.metadata["dalph.product_task"] === task &&
          row.metadata["dalph.phase"] === "product-completion"
      ),
      "completion"
    )
    let intent = yield* tracker.fact(current.id, "product_launch_intent", ProductLaunchIntent)
    let firstWrite = false
    if (!intent) {
      intent = yield* Schema.decodeUnknownEffect(ProductLaunchIntent)({
        version: 1,
        workflow: root,
        completion: completion.id,
        launch: current.id,
        task,
        instruction: current.description,
        workspace: WorkspaceSlug.make(`work-${randomUUID()}`),
        check: yield* nativeCheckLauncher(config, commands, nodeExecutable),
        reviewCheck: yield* nativeCheckLauncher(config, commands, nodeExecutable, "review-gate"),
        contract
      })
      const response = yield* nativeMetadataCAS(
        config,
        yield* HttpClient.HttpClient,
        current.id,
        "dalph.product_launch_intent",
        canonical(intent)
      )
      firstWrite =
        (yield* acknowledgeNativeMetadataOutcome(
          response,
          current.id,
          `rig:${config.rig}`,
          "dalph.product_launch_intent"
        )) === "swapped"
    }
    yield* validateIntent(intent, root, completion, current, task, contract)
    let observed = yield* tracker.fact(current.id, "product_batch", ProductBatchObservation)
    if (!observed) {
      observed = firstWrite ? yield* cook(intent) : yield* observeBatch(intent)
      yield* tracker.record(current.id, "product_batch", observed)
    }
    const exact = yield* observeBatch(intent)
    if (canonical(exact) !== canonical(observed))
      return yield* new BoundaryFailure({ message: "retained product batch identity changed" })
    yield* tracker.record(observed.root, "native_launch", { version: "native-v1", contract: intent.contract })
    const activation = yield* tracker.bead(observed.activation)
    if (activation.status !== "closed") yield* tracker.close(activation.id, "Durably observed exact product batch")
    yield* tracker.metadata(current.id, "gc.outcome", "pass")
    yield* tracker.close(current.id, "Native product task batch activated")
  })
  return { launch }
}

import { Effect, Schema } from "effect"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Bead, Commands, makeTracker } from "../delivery/tracker.ts"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import { NativeCookResponse, type NativeContract } from "./contract.ts"
import { makeNativeController } from "./controller.ts"
import { nativeRows } from "./identity.ts"
import { nativePreflight } from "./preflight.ts"
import { observeProductBatch } from "./product-observation.ts"
import { ProductBatchObservation, ProductInstructions, ProductLaunchIntent, ProductTask } from "./product-contract.ts"
const PRODUCT_TASK_COUNT = 4
const validateCompletion = Effect.fn("Product.validateRecoveryCompletion")(function* (
  root: BeadId,
  launcher: Bead,
  intent: typeof ProductLaunchIntent.Type,
  rows: ReadonlyArray<Bead>
) {
  const task = yield* Schema.decodeUnknownEffect(ProductTask)(launcher.metadata?.["dalph.product_task"])
  const completions = rows.filter(
    (row) =>
      row.metadata?.["gc.root_bead_id"] === root &&
      row.metadata["dalph.phase"] === "product-completion" &&
      row.metadata["dalph.product_task"] === task
  )
  if (completions.length !== 1 || completions[0]?.id !== intent.completion || intent.task !== task)
    return yield* new BoundaryFailure({ message: "product recovery has contradictory completion correlation" })
})
export const validateRetainedLaunch = Effect.fn("Product.validateRetainedLaunch")(function* (
  root: BeadId,
  launcher: Bead,
  intent: typeof ProductLaunchIntent.Type | null,
  batch: typeof ProductBatchObservation.Type | null,
  rows: ReadonlyArray<Bead>
) {
  if (!intent) {
    if (batch) return yield* new BoundaryFailure({ message: "product batch has no retained launch intent" })
    return
  }
  if (intent.workflow !== root || intent.launch !== launcher.id || intent.instruction !== launcher.description)
    return yield* new BoundaryFailure({ message: "product recovery has contradictory launch correlation" })
  yield* validateCompletion(root, launcher, intent, rows)
})

export const makeProductController = (
  config: RuntimeConfig,
  contract: NativeContract,
  commands: Commands,
  tracker: ReturnType<typeof makeTracker>,
  nodeExecutable: string
) => {
  const controller = makeNativeController(config, contract, commands, tracker, nodeExecutable)
  const reconcileLauncher = Effect.fn("Product.reconcileLauncher")(function* (
    root: BeadId,
    launcher: Bead,
    rows: ReadonlyArray<Bead>
  ) {
    const intent = yield* tracker.fact(launcher.id, "product_launch_intent", ProductLaunchIntent)
    const batch = yield* tracker.fact(launcher.id, "product_batch", ProductBatchObservation)
    yield* validateRetainedLaunch(root, launcher, intent, batch, rows)
    if (!intent) return
    const observed = yield* observeProductBatch(config, intent)
    if (batch && (batch.root !== observed.root || batch.activation !== observed.activation))
      return yield* new BoundaryFailure({ message: "product recovery names a foreign retained batch" })
    if (!batch) yield* tracker.record(launcher.id, "product_batch", observed)
    yield* tracker.record(observed.root, "native_launch", { version: "native-v1", contract: intent.contract })
    yield* controller.reconcile(observed.root)
  })
  const launch = Effect.fn("Product.launchGraph")(function* (instructions: typeof ProductInstructions.Type) {
    yield* nativePreflight(config, contract, commands)
    const response = yield* commands.execute(config.root, [
      ...tracker.gc,
      "formula",
      "cook",
      "native-product-diamond",
      "--json",
      ...Object.entries(instructions).flatMap(([key, instruction]) => ["--var", `${key}_instruction=${instruction}`])
    ])
    const cooked = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeCookResponse))(response)
    yield* tracker.record(cooked.root_id, "native_launch", { version: "native-v1", contract })
    yield* tracker.record(cooked.root_id, "product_graph", { version: 1, instructions })
    return { workflow_id: cooked.root_id }
  })
  const resume = Effect.fn("Product.resumeGraph")(function* (root: BeadId) {
    const retained = yield* tracker.fact(
      root,
      "product_graph",
      Schema.Struct({ version: Schema.Literal(1), instructions: ProductInstructions })
    )
    if (!retained) return yield* new BoundaryFailure({ message: "product graph has no retained authored instructions" })
    yield* controller.reconcile(root)
    const rows = yield* nativeRows(config)
    const launchers = rows.filter(
      (row) => row.metadata?.["gc.root_bead_id"] === root && row.metadata["dalph.phase"] === "product-launch"
    )
    if (launchers.length !== PRODUCT_TASK_COUNT)
      return yield* new BoundaryFailure({ message: "product recovery requires four exact native launch leaves" })
    for (const launcher of launchers) yield* reconcileLauncher(root, launcher, rows)
    const continuations = new Set(
      rows
        .filter((row) => row.metadata?.["dalph.product_workflow"] === root && !!row.metadata["dalph.product_root"])
        .map((row) => row.metadata?.["gc.root_bead_id"])
    )
    for (const continuation of continuations)
      yield* controller.reconcile(yield* Schema.decodeUnknownEffect(BeadId)(continuation))
    yield* commands.execute(config.root, ["gc", "--city", config.city, "resume"])
  })
  return { launch, resume }
}

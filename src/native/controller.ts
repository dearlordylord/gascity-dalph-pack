import { Effect, FileSystem, Schema } from "effect"
import { Prepared } from "../domain/attempt.ts"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import { Bead as BeadSchema, type Bead, type Commands, type makeTracker } from "../delivery/tracker.ts"
import { canonical } from "../delivery/files.ts"
import { NativeAttempt, NativeContract, NativeProposal } from "./contract.ts"
import { nativePreflight } from "./preflight.ts"
import { nativeRows } from "./identity.ts"
import { isImplementationMetadata } from "./nodes.ts"
import { reconcileNativeAttempt } from "./reconcile.ts"
import { nativeCheckLauncher } from "./launcher.ts"
import { settleNative } from "./settlement.ts"

type Tracker = ReturnType<typeof makeTracker>
export const makeNativeController = (
  config: RuntimeConfig,
  contract: NativeContract,
  commands: Commands,
  tracker: Tracker
) => {
  const launch = Effect.fn("Native.launch")(function* (instruction: string) {
    yield* nativePreflight(config, contract, commands)
    const check = yield* nativeCheckLauncher(config, commands)
    const response = yield* commands.execute(config.root, [
      ...tracker.gc,
      "sling",
      `${config.rig}/dalph.native-prepare`,
      "native-one-task",
      "--formula",
      "--json",
      "--var",
      `instruction=${instruction}`,
      "--var",
      `agent=${contract.agent}`,
      "--var",
      `pack=${config.pack}`,
      "--var",
      `check=${check}`
    ])
    const result = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ workflow_id: BeadId })))(
      response
    )
    yield* tracker.record(result.workflow_id, "native_launch", { version: "native-v1", contract })
    return result
  })
  const retainedResource = Effect.fn("Native.retainedResource")(function* (
    row: Bead,
    rows: ReadonlyArray<Bead>,
    root: BeadId
  ) {
    const attempt = yield* tracker.fact(row.id, "native_attempt", NativeAttempt)
    const prepared = yield* tracker.fact(row.id, "work_prepared", Prepared)
    if (!attempt || !prepared) return
    if (attempt.root !== root || attempt.plan.bead !== row.id)
      return yield* new BoundaryFailure({ message: "native resume attempt identity is contradictory" })
    const deliveries = rows.filter(
      (node) =>
        node.metadata?.["gc.root_bead_id"] === root &&
        node.metadata?.["dalph.task"] === attempt.task &&
        node.metadata?.["dalph.phase"] === "deliver"
    )
    if (deliveries.length !== 1)
      return yield* new BoundaryFailure({ message: "native resume has no exact delivery identity" })
    const delivery = yield* Schema.decodeUnknownEffect(BeadSchema)(deliveries[0])
    if (yield* settleNative(tracker, delivery, attempt)) return
    yield* reconcileNativeAttempt(
      config,
      commands,
      attempt,
      yield* tracker.fact(row.id, "native_proposal", NativeProposal)
    )
    const fs = yield* FileSystem.FileSystem
    if (!(yield* fs.exists(attempt.plan.path)))
      return yield* new BoundaryFailure({
        message: "prepared native worktree is lost; no recreation or resume authorized"
      })
  })
  const retainedResources = Effect.fn("Native.retainedResources")(function* (root: BeadId) {
    const rows = yield* nativeRows(config, commands)
    const work = rows.filter(
      (row) => isImplementationMetadata(row.metadata ?? {}) && row.metadata?.["gc.root_bead_id"] === root
    )
    for (const row of work) yield* retainedResource(row, rows, root)
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

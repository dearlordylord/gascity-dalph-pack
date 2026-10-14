import { Effect, Schema } from "effect"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Bead, Commands, makeTracker } from "../delivery/tracker.ts"
import { BoundaryFailure } from "../domain/shared.ts"
import { NativeAttempt } from "./contract.ts"
import { nativeGroup } from "./identity.ts"
import { isExecutionMetadata } from "./nodes.ts"
import { ProductCompletionId, ProductWorkflowId } from "./product-contract.ts"
import { settleNative } from "./settlement.ts"
type Tracker = ReturnType<typeof makeTracker>
const meta = (row: Bead) => row.metadata ?? {}
const deliveryFor = Effect.fn("Product.deliveryFor")(function* (current: Bead, rows: ReadonlyArray<Bead>) {
  const deliveries = rows.filter(
    (row) =>
      meta(row)["dalph.phase"] === "deliver" &&
      meta(row)["gc.root_bead_id"] === meta(current)["gc.root_bead_id"] &&
      isExecutionMetadata(row.metadata ?? {})
  )
  if (deliveries.length !== 1 || !deliveries[0])
    return yield* new BoundaryFailure({ message: "product settlement has no exact implementation and delivery" })
  return deliveries[0]
})
const verifyCompletion = Effect.fn("Product.verifyCompletion")(function* (
  completion: Bead,
  work: Bead,
  workflow: string
) {
  const barrier = meta(completion),
    implementation = meta(work)
  if (
    barrier["gc.root_bead_id"] !== workflow ||
    barrier["dalph.phase"] !== "product-completion" ||
    implementation["dalph.product_completion"] !== completion.id ||
    implementation["dalph.product_workflow"] !== workflow
  )
    return yield* new BoundaryFailure({ message: "product settlement names another completion barrier" })
})
const recordCompletion = Effect.fn("Product.recordCompletion")(function* (
  tracker: Tracker,
  current: Bead,
  completion: Bead,
  work: Bead,
  delivery: Bead,
  attempt: typeof NativeAttempt.Type,
  workflow: string
) {
  yield* tracker.record(completion.id, "product_delivery", {
    batch: meta(current)["gc.root_bead_id"] ?? attempt.root,
    implementation: work.id,
    delivery: delivery.id,
    attempt: attempt.plan.attempt,
    workflow
  })
  if (completion.status !== "closed") yield* tracker.close(completion.id, "Exact delivery and owned cleanup settled")
  yield* tracker.metadata(current.id, "gc.outcome", "pass")
  yield* tracker.close(current.id, "Product completion observed")
})
export const completeProductTask = Effect.fn("Product.completeTask")(function* (
  config: RuntimeConfig,
  commands: Commands,
  tracker: Tracker,
  current: Bead
) {
  const completionId = yield* Schema.decodeUnknownEffect(ProductCompletionId)(meta(current)["dalph.product_completion"])
  const workflow = yield* Schema.decodeUnknownEffect(ProductWorkflowId)(meta(current)["dalph.product_workflow"])
  const group = yield* nativeGroup(config, commands, current)
  const attempt = yield* tracker.fact(group.work.id, "native_attempt", NativeAttempt)
  if (!attempt)
    return yield* new BoundaryFailure({ message: "product settlement has no exact implementation and delivery" })
  const delivery = yield* deliveryFor(current, group.rows)
  const completion = yield* tracker.bead(completionId)
  yield* verifyCompletion(completion, group.work, workflow)
  const delivered = yield* settleNative(tracker, yield* tracker.bead(delivery.id), attempt)
  if (!delivered) {
    yield* tracker.metadata(current.id, "gc.outcome", "fail")
    yield* tracker.close(current.id, "Finite batch failed; product completion remains open")
    return
  }
  yield* recordCompletion(tracker, current, completion, group.work, delivery, attempt, workflow)
})

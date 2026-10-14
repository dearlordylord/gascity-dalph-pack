import { Effect } from "effect"
import type { Bead } from "../delivery/tracker.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import { BoundaryFailure } from "../domain/shared.ts"
import type { ProductLaunchIntent } from "./product-contract.ts"
const meta = (row: Bead) => row.metadata ?? {}
export const verifyProductRoot = Effect.fn("Product.verifyRoot")(function* (
  config: RuntimeConfig,
  root: Bead,
  intent: typeof ProductLaunchIntent.Type
) {
  const variables = {
    instruction: intent.instruction,
    workspace: intent.workspace,
    agent: intent.contract.agent,
    reviewer: intent.contract.reviewer ?? `${config.rig}/dalph.native-reviewer`,
    pack: config.pack,
    check: intent.check,
    review_check: intent.reviewCheck,
    product_workflow: intent.workflow,
    product_completion: intent.completion,
    product_launch: intent.launch
  }
  const metadata = meta(root)
  if (
    metadata["gc.formula_name"] !== "native-product-task" ||
    Object.entries(variables).some(([key, value]) => metadata[`gc.var.${key}`] !== value)
  )
    return yield* new BoundaryFailure({ message: "product root differs from its authored launch variables" })
})
export const verifyProductInstantiation = Effect.fn("Product.verifyInstantiation")(function* (
  rows: ReadonlyArray<Bead>
) {
  if (rows.some((row) => meta(row).molecule_failed === "true" || meta(row)["gc.instantiating"] === "true"))
    return yield* new BoundaryFailure({ message: "product batch is failed or incompletely instantiated" })
})
export const verifyProductMember = Effect.fn("Product.verifyMember")(function* (
  member: Bead,
  phase: string,
  intent: typeof ProductLaunchIntent.Type
) {
  const metadata = meta(member)
  if (
    metadata["dalph.product_completion"] !== intent.completion ||
    metadata["dalph.product_workflow"] !== intent.workflow ||
    metadata["dalph.product_launch"] !== intent.launch
  )
    return yield* new BoundaryFailure({ message: `product ${phase} has foreign completion identity` })
})
export const verifyProductImplementation = Effect.fn("Product.verifyImplementation")(function* (
  member: Bead,
  intent: typeof ProductLaunchIntent.Type
) {
  const metadata = meta(member)
  if (
    member.description !== intent.instruction ||
    metadata["gc.pack_workspace"] !== intent.workspace ||
    metadata["gc.run_target"] !== intent.contract.agent
  )
    return yield* new BoundaryFailure({
      message: "product implementation differs from its instruction/workspace/route"
    })
})
export const verifyProductActivation = Effect.fn("Product.verifyActivation")(function* (
  prepare: Bead,
  activation: Bead
) {
  const dependency = prepare.dependencies?.some((dep) => dep.type === "blocks" && dep.depends_on_id === activation.id)
  if (!dependency && !prepare.needs?.includes(activation.id))
    return yield* new BoundaryFailure({ message: "product preparation is not blocked by its activation latch" })
})

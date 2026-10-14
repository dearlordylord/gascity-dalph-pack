import { Schema } from "effect"
import { BeadId } from "../domain/shared.ts"
import { NativeContract } from "./contract.ts"
import { WorkspaceSlug } from "./shared-workspace.ts"

/** The outer workflow is distinct from an implementation/review batch root. */
export const ProductWorkflowId = BeadId.pipe(Schema.brand("ProductWorkflowId"))
/** This tracker barrier closes only after the task's exact delivery settles. */
export const ProductCompletionId = BeadId.pipe(Schema.brand("ProductCompletionId"))
export const ProductTask = Schema.Literals(["a", "b", "c", "d"])
export const ProductBinding = Schema.Struct({
  workflow: ProductWorkflowId,
  completion: ProductCompletionId,
  launch: BeadId
})
const Instruction = Schema.String.check(Schema.isMinLength(1))
export const ProductInstructions = Schema.Struct({ a: Instruction, b: Instruction, c: Instruction, d: Instruction })
/** Persist before cook; the correlation survives missing cook acknowledgements. */
export const ProductLaunchIntent = Schema.Struct({
  version: Schema.Literal(1),
  workflow: ProductWorkflowId,
  completion: ProductCompletionId,
  launch: BeadId,
  task: ProductTask,
  instruction: Schema.String.check(Schema.isMinLength(1)),
  workspace: WorkspaceSlug,
  check: Schema.String.check(Schema.isMinLength(1)),
  reviewCheck: Schema.String.check(Schema.isMinLength(1)),
  contract: NativeContract
})
export const ProductBatchObservation = Schema.Struct({ root: BeadId, activation: BeadId })

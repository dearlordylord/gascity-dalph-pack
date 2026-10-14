import { Effect } from "effect"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Bead } from "../delivery/tracker.ts"
import { BoundaryFailure } from "../domain/shared.ts"
import { nativeRows } from "./identity.ts"
import { isExecutionMetadata } from "./nodes.ts"
import type { ProductLaunchIntent } from "./product-contract.ts"
import {
  verifyProductRoot,
  verifyProductInstantiation,
  verifyProductMember,
  verifyProductImplementation,
  verifyProductActivation
} from "./product-observation-checks.ts"
import { verifyProductChain } from "./product-chain.ts"

const one = Effect.fn("Product.exactMember")(function* (rows: ReadonlyArray<Bead>, boundary: string) {
  if (rows.length !== 1 || !rows[0])
    return yield* new BoundaryFailure({ message: `product ${boundary} requires one exact native bead` })
  return rows[0]
})
/** Observe the complete authored batch before activation or recovery; no ready-only discovery. */
export const observeProductBatch = Effect.fn("Product.observeBatch")(function* (
  config: RuntimeConfig,
  intent: typeof ProductLaunchIntent.Type
) {
  const rows = yield* nativeRows(config)
  const root = yield* one(
    rows.filter(
      (row) => row.metadata?.["gc.kind"] === "workflow" && row.metadata["gc.var.product_launch"] === intent.launch
    ),
    "cook reconciliation"
  )
  yield* verifyProductRoot(config, root, intent)
  const members = rows.filter((row) => row.metadata?.["gc.root_bead_id"] === root.id)
  yield* verifyProductInstantiation([root, ...members])
  const activation = yield* one(
    members.filter(
      (row) =>
        row.metadata?.["dalph.phase"] === "product-activation" && row.metadata["dalph.product_launch"] === intent.launch
    ),
    "activation"
  )
  for (const phase of ["prepare", "work", "qualify", "deliver", "product-settlement"]) {
    const member = yield* one(
      members.filter((row) => row.metadata?.["dalph.phase"] === phase && isExecutionMetadata(row.metadata)),
      phase
    )
    yield* verifyProductMember(member, phase, intent)
    if (phase === "work") yield* verifyProductImplementation(member, intent)
    if (phase === "prepare") yield* verifyProductActivation(member, activation)
  }
  const scope = yield* one(
    members.filter((row) => row.metadata?.["gc.kind"] === "scope" && row.metadata["gc.scope_name"] === "delivery"),
    "delivery scope"
  )
  if (scope.metadata?.["dalph.product_completion"] !== intent.completion)
    return yield* new BoundaryFailure({ message: "product delivery scope has foreign completion identity" })
  yield* verifyProductChain(members, activation.id)
  return { root: root.id, activation: activation.id }
})

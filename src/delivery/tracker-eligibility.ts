import { Effect, Schema } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"
import type { Bead, makeTracker } from "./tracker.ts"

const verifyEdges = Effect.fn("Tracker.verifyEdges")(function* (current: Bead) {
  for (const dependency of current.dependencies ?? []) {
    if (dependency.issue_id !== current.id || !["blocks", "parent-child", "tracks"].includes(dependency.type))
      return yield* new BoundaryFailure({ message: "contradictory or unsupported native dependency" })
  }
})
const prerequisiteIds = (current: Bead) => {
  const ids = new Set(current.needs ?? [])
  for (const dependency of current.dependencies ?? []) {
    if (dependency.type === "blocks") ids.add(dependency.depends_on_id)
  }
  return ids
}
export const verifyDependencies = Effect.fn("Tracker.verifyDependencies")(function* (current: Bead) {
  const refs = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Schema.NonEmptyString)))(
    current.metadata?.["gc.native_step_dependencies.v1"]
  )
  const needs = current.needs ?? []
  if (
    refs.length !== prerequisiteIds(current).size ||
    new Set(refs).size !== refs.length ||
    new Set(needs).size !== needs.length ||
    prerequisiteIds(current).has(current.id)
  )
    return yield* new BoundaryFailure({ message: "incomplete or contradictory native dependencies" })
  yield* verifyEdges(current)
})
const prerequisiteReference = Effect.fn("Tracker.prerequisiteReference")(function* (
  scope: Record<string, string>,
  prerequisite: Bead
) {
  const metadata = prerequisite.metadata ?? {}
  const ref = yield* Schema.decodeUnknownEffect(Schema.NonEmptyString)(metadata["gc.step_ref"])
  if (
    prerequisite.status !== "closed" ||
    metadata["gc.root_bead_id"] !== scope["gc.root_bead_id"] ||
    metadata["gc.root_store_ref"] !== scope["gc.root_store_ref"]
  )
    return yield* new BoundaryFailure({ message: "native prerequisite identity or delivery is not observed" })
  return ref
})
export const observePrerequisites = Effect.fn("Tracker.observePrerequisites")(function* (
  current: Bead,
  read: ReturnType<typeof makeTracker>["bead"]
) {
  const scope = yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.String))(current.metadata)
  const refs = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Schema.NonEmptyString)))(
    scope["gc.native_step_dependencies.v1"]
  )
  const observed = new Set<string>()
  for (const id of prerequisiteIds(current)) {
    const ref = yield* prerequisiteReference(scope, yield* read(id))
    if (!refs.includes(ref) || observed.has(ref))
      return yield* new BoundaryFailure({ message: "contradictory native prerequisite reference" })
    observed.add(ref)
  }
  if (observed.size !== refs.length)
    return yield* new BoundaryFailure({ message: "native prerequisite observations are incomplete" })
})

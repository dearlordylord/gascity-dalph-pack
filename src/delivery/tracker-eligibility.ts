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
export const observePrerequisites = Effect.fn("Tracker.observePrerequisites")(function* (
  current: Bead,
  read: ReturnType<typeof makeTracker>["bead"]
) {
  const ids = prerequisiteIds(current)
  for (const id of ids) {
    if ((yield* read(id)).status !== "closed")
      return yield* new BoundaryFailure({ message: "native prerequisite delivery is not observed" })
  }
})

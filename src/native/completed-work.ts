import { Effect, Schema } from "effect"
import { AbsolutePath } from "../domain/attempt.ts"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import type { Bead, Commands, makeTracker } from "../delivery/tracker.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { NativeSession } from "./contract.ts"
import { ephemeralPoolSession } from "./pool-policy.ts"
import { nativeWriterInventory } from "./session-inventory.ts"
import { nativeSession } from "./session-observation.ts"
import { nodeWorkspaceMatches } from "./node-workspace.ts"

/** Historical native node ownership remains distinct from a pool session's current owner. */
const CompletedBinding = Schema.Struct({ node: BeadId, path: AbsolutePath, template: Schema.NonEmptyString })
const originalMatches = (original: Bead, session: typeof NativeSession.Type, binding: typeof CompletedBinding.Type) => {
  const metadata = original.metadata ?? {}
  return (
    original.status === "closed" &&
    metadata["gc.session_id"] === session.id &&
    metadata["gc.run_target"] === binding.template
  )
}
const ownerSessionMatches = (owner: Bead, session: typeof NativeSession.Type) =>
  owner.metadata?.["gc.session_id"] === session.id || (owner.status === "closed" && session.status === "closed")
const ownerMatches = (owner: Bead, original: Bead, session: typeof NativeSession.Type) => {
  const metadata = owner.metadata ?? {}
  return (
    owner.id !== original.id &&
    ownerSessionMatches(owner, session) &&
    metadata["gc.run_target"] === session.metadata.template &&
    !!session.metadata.work_dir
  )
}
const currentSessionMatches = (session: typeof NativeSession.Type, binding: typeof CompletedBinding.Type) =>
  ephemeralPoolSession(session) &&
  session.metadata.template === binding.template &&
  session.metadata["gc.trigger_bead_id"] !== binding.node
const occupiesWorkspace = (session: typeof NativeSession.Type, path: string) =>
  session.status !== "closed" && session.metadata.work_dir === path

/** Positively prove native reassignment; never mutate or close the new owner's session. */
export const completedReassignedWork = Effect.fn("Native.completedReassignedWork")(function* (
  config: RuntimeConfig,
  commands: Commands,
  tracker: ReturnType<typeof makeTracker>,
  bindingInput: unknown,
  session: typeof NativeSession.Type
) {
  const binding = yield* Schema.decodeUnknownEffect(CompletedBinding)(bindingInput)
  const original = yield* tracker.bead(binding.node)
  if (
    !originalMatches(original, session, binding) ||
    !currentSessionMatches(session, binding) ||
    !(yield* nodeWorkspaceMatches(tracker, original, binding.path))
  )
    return yield* new BoundaryFailure({ message: "completed native work/session binding is unproven" })
  const ownerId = yield* Schema.decodeUnknownEffect(BeadId)(session.metadata["gc.trigger_bead_id"])
  const owner = yield* tracker.bead(ownerId)
  const ownerPath = yield* Schema.decodeUnknownEffect(AbsolutePath)(session.metadata.work_dir)
  if (!ownerMatches(owner, original, session) || !(yield* nodeWorkspaceMatches(tracker, owner, ownerPath)))
    return yield* new BoundaryFailure({ message: "native pool reassignment is unproven" })
  const inventory = yield* nativeWriterInventory(config, commands, [session.id])
  for (const entry of inventory) {
    const current = yield* nativeSession(config, commands, entry.id)
    if (occupiesWorkspace(current, binding.path))
      return yield* new BoundaryFailure({ message: "current native writer occupies completed producer workspace" })
  }
})

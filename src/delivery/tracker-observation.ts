import { Effect, Schema } from "effect"
import { parse } from "smol-toml"
import { BeadId, BoundaryFailure } from "../domain/shared.ts"
import { verifyDependencies } from "./tracker-eligibility.ts"
import { cityScopeMatches, claimOwnershipMatches } from "./tracker-scope.ts"
import type { RuntimeConfig } from "./config.ts"

export const Bead = Schema.Struct({
  id: BeadId,
  status: Schema.Literals(["open", "in_progress", "blocked", "closed"]),
  assignee: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  needs: Schema.optionalKey(Schema.Array(BeadId)),
  dependencies: Schema.optionalKey(
    Schema.Array(Schema.Struct({ issue_id: BeadId, depends_on_id: BeadId, type: Schema.String }))
  ),
  _cache_age_s: Schema.optionalKey(Schema.Number)
})
export type Bead = typeof Bead.Type
const protocol = { schema_version: Schema.Literal("1"), ok: Schema.Literal(true), command: Schema.Literal("hook") }
export const Claim = Schema.Union([
  Schema.Struct({
    ...protocol,
    action: Schema.Literal("work"),
    reason: Schema.Literals(["claimed", "existing_assignment", "ready_assignment"]),
    bead_id: BeadId,
    root_bead_id: Schema.optionalKey(BeadId),
    assignee: Schema.NonEmptyString,
    route: Schema.NonEmptyString
  }),
  Schema.Struct({
    ...protocol,
    action: Schema.Literal("drain"),
    reason: Schema.Literals([
      "no_work",
      "drain_pending",
      "stale_session",
      "non_turn_context",
      "missing_session_registration",
      "city_suspended",
      "agent_suspended",
      "rig_suspended"
    ]),
    drain_acknowledged: Schema.optionalKey(Schema.Boolean)
  })
])
const City = Schema.Struct({
  workspace: Schema.Struct({ name: Schema.String }),
  rigs: Schema.Array(Schema.Struct({ name: Schema.String, path: Schema.String }))
})
export const verifyCity = Effect.fn("Tracker.verifyCity")(function* (config: RuntimeConfig, text: string) {
  const value = yield* Effect.try({
    try: () => parse(text),
    catch: () => new BoundaryFailure({ message: "unreadable city configuration" })
  })
  const city = yield* Schema.decodeUnknownEffect(City)(value)
  if (!cityScopeMatches(config, city))
    return yield* new BoundaryFailure({ message: "foreign or contradictory city/rig configuration" })
})
export const verifyClaim = Effect.fn("Tracker.verifyClaim")(function* (
  config: RuntimeConfig,
  claim: Extract<typeof Claim.Type, { action: "work" }>,
  current: Bead,
  role: "worker" | "integrator"
) {
  const route = `${config.rig}/dalph.${role}`
  const routed = current.metadata?.["gc.routed_to"]
  if (!claimOwnershipMatches(route, claim, { routedTo: routed, assignee: current.assignee }))
    return yield* new BoundaryFailure({ message: "foreign or contradictory native claim/route" })
  yield* verifyTaskIdentity(claim, current)
  if (current.metadata?.["gc.root_store_ref"] !== `rig:${config.rig}`)
    return yield* new BoundaryFailure({ message: "foreign or missing native root store scope" })
  yield* verifyDependencies(current)
  if (current.status === "blocked") return yield* new BoundaryFailure({ message: "claimed task is blocked" })
})

const verifyTaskIdentity = Effect.fn("Tracker.verifyTaskIdentity")(function* (
  claim: Extract<typeof Claim.Type, { action: "work" }>,
  current: Bead
) {
  if (
    !current.metadata?.["dalph.task"] ||
    !current.metadata["gc.root_bead_id"] ||
    (claim.root_bead_id !== undefined && claim.root_bead_id !== current.metadata["gc.root_bead_id"])
  )
    return yield* new BoundaryFailure({ message: "claimed task has incomplete or contradictory task/root identity" })
})

import { Effect } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { NativeAgents, NativeConfig } from "./contract.ts"
import { validateRetiringPools } from "./pool-policy.ts"

const DETERMINISTIC_ROLES = [
  "native-prepare",
  "native-review-prepare",
  "native-qualifier",
  "native-integrator"
] as const
const PARALLEL_PREPARATION_SESSIONS = 2

function oneShotFits(
  role: { readonly StartCommand: string; readonly Lifecycle?: string; readonly MaxActiveSessions?: number | null },
  capacity: 1 | typeof PARALLEL_PREPARATION_SESSIONS
) {
  return (
    !!role.StartCommand.trim() &&
    role.Lifecycle === "one_shot" &&
    !!role.MaxActiveSessions &&
    role.MaxActiveSessions <= capacity
  )
}

/** Gas City starts these bounded one-shot roles; the pack does not dispatch their processes. */
export const validateInstalledRoles = Effect.fn("Native.validateInstalledRoles")(function* (
  config: RuntimeConfig,
  resolved: typeof NativeConfig.Type.config,
  inventory: typeof NativeAgents.Type
) {
  for (const name of DETERMINISTIC_ROLES) {
    const matches = resolved.Agents.filter((role) => role.Name === name && role.Dir === config.rig)
    const role = matches.length === 1 ? matches[0] : undefined
    const qualified = `${config.rig}/dalph.${name}`
    if (!role || !inventory.agents.some((agent) => agent.qualified_name === qualified && !agent.suspended))
      return yield* new BoundaryFailure({ message: `native installation requires exactly one configured ${qualified}` })
    const capacity = name === "native-integrator" ? 1 : PARALLEL_PREPARATION_SESSIONS
    if (!oneShotFits(role, capacity))
      return yield* new BoundaryFailure({
        message: `${qualified} requires a one-shot command and at most ${capacity} sessions`
      })
    yield* validateRetiringPools([role], resolved.NamedSessions)
  }
})

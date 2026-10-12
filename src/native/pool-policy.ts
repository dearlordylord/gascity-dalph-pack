import { Effect } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"
import type { NativeConfig, NativeSession } from "./contract.ts"

type Role = (typeof NativeConfig.Type.config.Agents)[number]
const roleBaseName = (name: string) => name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf(".")) + 1)
const namedTargetsRole = (named: { readonly Dir: string; readonly Template: string }, role: Role) =>
  named.Dir === role.Dir && roleBaseName(named.Template) === roleBaseName(role.Name)

/** Ephemeral min-zero pools let native retirement end ownership without a raced pack close. */
export const validateRetiringPools = Effect.fn("Native.validateRetiringPools")(function* (
  roles: ReadonlyArray<Role>,
  named: typeof NativeConfig.Type.config.NamedSessions
) {
  for (const role of roles) {
    if (role.MinActiveSessions !== 0 || (named ?? []).some((entry) => namedTargetsRole(entry, role)))
      return yield* new BoundaryFailure({ message: "native producer retirement requires minimum-zero unnamed pools" })
  }
})

/** Named and manually owned sessions can be reopened; terminal pool reuse guarantees do not apply. */
export const ephemeralPoolSession = (session: typeof NativeSession.Type) =>
  session.metadata.pool_managed === "true" &&
  session.metadata.session_origin === "ephemeral" &&
  session.metadata.configured_named_session !== "true" &&
  session.metadata.manual_session !== "true"

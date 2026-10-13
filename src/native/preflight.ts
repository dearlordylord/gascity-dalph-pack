import { Duration, Effect, Schema } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Commands } from "../delivery/tracker.ts"
import { NativeAgents, NativeBuild, NativeConfig, NativeProvider, type NativeContract } from "./contract.ts"
import { validateRetiringPools } from "./pool-policy.ts"
import { validateInstalledRoles } from "./installation.ts"
import { nativeProviderHealth } from "./provider-health.ts"
import { nativeScopedReadCapability } from "./scoped-read.ts"
import { nativeMetadataCapability } from "./metadata-http.ts"

const reject = (message: string) => Effect.fail(new BoundaryFailure({ message }))
const READINESS_SECONDS = 30
const REVIEWER_SESSIONS = 2
const TOTAL_SESSIONS = 5
type AgentRole = (typeof NativeConfig.Type.config.Agents)[number]
const directReviewer = (role: AgentRole | undefined): role is AgentRole =>
  !!role && !role.StartCommand && !!role.MaxActiveSessions && role.MaxActiveSessions <= REVIEWER_SESSIONS
const boundedRig = (rig: { MaxActiveSessions: number | null }) =>
  !!rig.MaxActiveSessions && rig.MaxActiveSessions <= TOTAL_SESSIONS
const validateReviewCapacity = Effect.fn("Native.validateReviewCapacity")(function* (
  config: RuntimeConfig,
  contract: NativeContract,
  resolved: typeof NativeConfig.Type.config,
  agents: typeof NativeAgents.Type
) {
  const reviewer = contract.reviewer ?? `${config.rig}/dalph.native-reviewer`
  if (
    reviewer === contract.agent ||
    !agents.agents.some((entry) => entry.qualified_name === reviewer && !entry.suspended)
  )
    return yield* reject("native reviewer must be a separate configured agent")
  const name = reviewer.slice(Math.max(reviewer.lastIndexOf("/"), reviewer.lastIndexOf(".")) + 1)
  const role = resolved.Agents.find((entry) => entry.Name === name && entry.Dir === config.rig)
  if (!directReviewer(role)) return yield* reject("native reviewer requires a direct provider and at most two sessions")
  const rig = resolved.Rigs?.find((entry) => entry.Name === config.rig)
  if (!rig || !boundedRig(rig)) return yield* reject("native review requires a rig session cap of at most five")
  return role
})
const validateAgent = Effect.fn("Native.validateAgent")(function* (
  config: RuntimeConfig,
  contract: NativeContract,
  resolved: typeof NativeConfig.Type.config,
  agents: typeof NativeAgents.Type
) {
  if (
    !agents.agents.some(
      (entry) =>
        entry.qualified_name === contract.agent &&
        !entry.suspended &&
        (entry.provider ?? resolved.Workspace.Provider) === contract.harness
    )
  )
    return yield* reject("native agent identity is not configured")
  const name = contract.agent.slice(Math.max(contract.agent.lastIndexOf("/"), contract.agent.lastIndexOf(".")) + 1)
  const matches = resolved.Agents.filter((entry) => entry.Name === name && entry.Dir === config.rig)
  const agent = matches.length === 1 ? matches[0] : undefined
  if (!agent || agent.StartCommand)
    return yield* reject("native implementation must select the configured direct harness agent")
  return agent
})
const validateSafety = Effect.fn("Native.validateSafety")(function* (
  contract: NativeContract,
  resolved: typeof NativeConfig.Type.config
) {
  if (resolved.Beads.Provider !== "bd")
    return yield* reject("this native hook revision requires the bd tracker claim capability")
  if (resolved.Session.Provider !== contract.runtime)
    return yield* reject("native runtime is not the qualified local tmux runtime")
  if (resolved.Beads.ConditionalWrites !== "require" || resolved.Beads.GuardedRelease !== "require")
    return yield* reject("native tracker requires conditional writes and guarded ownership release")
})
const validatePermission = Effect.fn("Native.validatePermission")(function* (
  agent: (typeof NativeConfig.Type.config.Agents)[number],
  provider: typeof NativeProvider.Type
) {
  const permission = agent.OptionDefaults?.permission_mode ?? provider.resolved.option_defaults?.permission_mode
  if (permission && !provider.resolved.permission_modes?.[permission])
    return yield* reject("unsupported native permission option; no launch authorized")
})
const validateInteractiveRoles = Effect.fn("Native.validateInteractiveRoles")(function* (
  config: RuntimeConfig,
  contract: NativeContract,
  resolved: typeof NativeConfig.Type.config,
  agent: AgentRole,
  reviewer: AgentRole
) {
  if (!agent.MaxActiveSessions || agent.MaxActiveSessions > REVIEWER_SESSIONS)
    return yield* reject("native implementation requires at most two sessions")
  const reviewerProvider = reviewer.Provider || resolved.Workspace.Provider
  if (reviewerProvider !== contract.harness)
    return yield* reject("native reviewer harness lacks the selected qualification contract")
  yield* validateRetiringPools([agent, reviewer], resolved.NamedSessions)
  if ([agent, reviewer].some((entry) => entry.WorkDir !== config.worktrees))
    return yield* reject("native implementation and reviewer workspace bases must equal the configured worktree root")
})
export const nativePreflight = Effect.fn("Native.preflight")(function* (
  config: RuntimeConfig,
  contract: NativeContract,
  commands: Commands
) {
  const gc = ["gc", "--city", config.city, "--rig", config.rig]
  yield* commands.execute(config.root, [...gc, "version", "--json"]).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeBuild))),
    Effect.mapError(() => new BoundaryFailure({ message: "native Ralph infrastructure build is not qualified" }))
  )
  yield* nativeMetadataCapability(config)
  yield* nativeScopedReadCapability(config)
  const loaded = yield* commands
    .execute(config.root, [...gc, "config", "show", "--json"])
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeConfig))))
  const resolved = loaded.config
  const agents = yield* commands
    .execute(config.root, [...gc, "agent", "list", "--json"])
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeAgents))))
  const agent = yield* validateAgent(config, contract, resolved, agents)
  const reviewRole = yield* validateReviewCapacity(config, contract, resolved, agents)
  yield* validateInstalledRoles(config, resolved, agents)
  yield* validateInteractiveRoles(config, contract, resolved, agent, reviewRole)
  yield* validateSafety(contract, resolved)
  const provider = yield* commands
    .execute(config.root, [...gc, "config", "explain", "--provider", contract.harness, "--json"])
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeProvider))))
  yield* validatePermission(agent, provider)
  yield* validatePermission(reviewRole, provider)
  const runtime = yield* commands.execute(config.root, ["tmux", "-V"])
  if (runtime !== contract.runtimeVersion) return yield* reject("native runtime version differs from qualification")
  const version = yield* commands.execute(config.root, [
    contract.harness === "fixture" ? "node" : contract.harness,
    "--version"
  ])
  if (version !== contract.harnessVersion) return yield* reject("native harness version differs from qualification")
  yield* commands.execute(config.root, contract.readiness, config.repo, Duration.seconds(READINESS_SECONDS))
  yield* nativeProviderHealth(config, commands)
  // Check executable lookup only; project qualification is run against the exact Base/candidate later.
  yield* commands.execute(config.root, ["sh", "-c", 'command -v "$1"', "native-preflight", contract.check.command[0]])
})

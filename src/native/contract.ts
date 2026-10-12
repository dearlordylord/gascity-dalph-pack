import { Schema } from "effect"
import { AbsolutePath, Plan } from "../domain/attempt.ts"
import { BeadId, CommitSha, NonNegativeInteger } from "../domain/shared.ts"

const Text = Schema.String.check(Schema.isMinLength(1))
const MAXIMUM_CHECK_SECONDS = 600
/** Qualified Ralph infrastructure and finite-heartbeat behavior of the patched native build. */
export const NativeBuild = Schema.Struct({
  schema_version: Schema.Literal("1"),
  ok: Schema.Literal(true),
  version: Schema.Literals(["dev-dalph-native-v3", "dev-dalph-native-v4-candidate"])
})
/** Public fresh formula cook response; the workflow root is not routed to a worker. */
export const NativeCookResponse = Schema.Struct({
  schema_version: Schema.Literal("1"),
  ok: Schema.Literal(true),
  mode: Schema.Literal("cook"),
  root_id: BeadId
})
export const NativeTaskIdentity = Schema.Struct({
  "gc.root_bead_id": BeadId,
  "dalph.task": Text,
  "dalph.runtime": Schema.Literal("native-v1"),
  "dalph.product_root": Schema.optionalKey(BeadId)
})
export const ProjectCheck = Schema.Struct({
  command: Schema.NonEmptyArray(Text),
  timeoutSeconds: NonNegativeInteger.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(MAXIMUM_CHECK_SECONDS))
})
export const NativeContract = Schema.Struct({
  version: Schema.Literal(1),
  agent: Text,
  reviewer: Schema.optionalKey(Text),
  harness: Schema.Literals(["codex", "claude", "fixture"]),
  harnessVersion: Text,
  runtime: Schema.Literal("tmux"),
  runtimeVersion: Text,
  readiness: Schema.NonEmptyArray(Text),
  check: ProjectCheck
})
export type NativeContract = typeof NativeContract.Type
export const NativeAttempt = Schema.Struct({
  version: Schema.Literal("native-v1"),
  task: Text,
  root: BeadId,
  plan: Plan,
  contract: NativeContract
})
export const NativeProposal = Schema.Struct({
  session: BeadId,
  commit: CommitSha,
  attempt: Plan.fields.attempt,
  base: CommitSha,
  task: Text,
  path: AbsolutePath
})
export const NativeSession = Schema.Struct({
  id: BeadId,
  status: Schema.String,
  metadata: Schema.Record(Schema.String, Schema.String)
})
export const NativeConfig = Schema.Struct({
  config: Schema.Struct({
    Agents: Schema.Array(
      Schema.Struct({
        Name: Text,
        Dir: Schema.String,
        Provider: Schema.String,
        StartCommand: Schema.String,
        Lifecycle: Schema.optionalKey(Schema.String),
        WorkDir: Schema.optionalKey(Schema.String),
        MaxActiveSessions: Schema.optionalKey(Schema.NullOr(NonNegativeInteger)),
        MinActiveSessions: Schema.optionalKey(Schema.NullOr(NonNegativeInteger)),
        OptionDefaults: Schema.NullOr(Schema.Record(Schema.String, Schema.String))
      })
    ),
    NamedSessions: Schema.NullOr(Schema.Array(Schema.Struct({ Template: Text, Dir: Schema.String }))),
    Rigs: Schema.optionalKey(
      Schema.Array(Schema.Struct({ Name: Text, MaxActiveSessions: Schema.NullOr(NonNegativeInteger) }))
    ),
    Session: Schema.Struct({ Provider: Text }),
    Beads: Schema.Struct({ Provider: Text, ConditionalWrites: Text, GuardedRelease: Text }),
    Workspace: Schema.Struct({ Provider: Schema.String })
  })
})
export const NativeAgents = Schema.Struct({
  agents: Schema.Array(
    Schema.Struct({ qualified_name: Text, provider: Schema.optionalKey(Text), suspended: Schema.Boolean })
  )
})
export const NativeProvider = Schema.Struct({
  resolved: Schema.Struct({
    option_defaults: Schema.NullOr(Schema.Record(Schema.String, Schema.String)),
    permission_modes: Schema.NullOr(Schema.Record(Schema.String, Schema.String))
  })
})
export class NativeSessionPending extends Schema.TaggedError<NativeSessionPending>()("NativeSessionPending", {
  message: Schema.String
}) {}

import { Schema } from "effect"
import { AbsolutePath, Plan } from "../domain/attempt.ts"
import { BeadId, BirthTicks, CommitSha, NonNegativeInteger } from "../domain/shared.ts"

const Text = Schema.String.check(Schema.isMinLength(1))
const MAXIMUM_CHECK_SECONDS = 600
export const NativeTaskIdentity = Schema.Struct({
  "gc.root_bead_id": BeadId,
  "dalph.task": Text,
  "dalph.runtime": Schema.Literal("native-v1")
})
export const ProjectCheck = Schema.Struct({
  command: Schema.NonEmptyArray(Text),
  timeoutSeconds: NonNegativeInteger.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(MAXIMUM_CHECK_SECONDS))
})
export const NativeContract = Schema.Struct({
  version: Schema.Literal(1),
  agent: Text,
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
  path: AbsolutePath,
  birth: BirthTicks
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
        OptionDefaults: Schema.NullOr(Schema.Record(Schema.String, Schema.String))
      })
    ),
    Session: Schema.Struct({ Provider: Text }),
    Beads: Schema.Struct({ Provider: Text, ConditionalWrites: Text, GuardedRelease: Text }),
    Workspace: Schema.Struct({ Provider: Schema.String })
  })
})
export const NativeAgents = Schema.Struct({
  agents: Schema.Array(Schema.Struct({ qualified_name: Text, provider: Schema.optionalKey(Text) }))
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

import { Clock, Duration, Effect, FileSystem, Schema } from "effect"
import { join } from "node:path"
import type { Plan } from "../domain/attempt.ts"
import { CommandIntent, CommandFinished, CommandReconciled, Qualification } from "../domain/attempt.ts"
import type { BeadId } from "../domain/shared.ts"
import { BoundaryFailure, CommitSha } from "../domain/shared.ts"
import type { RuntimeConfig } from "./config.ts"
import type { Commands, makeTracker } from "./tracker.ts"
import type { Git } from "./git.ts"
import { commandSlot } from "./command-slot.ts"
import { markedProcesses } from "./process-observation.ts"

const MODEL_SECONDS = 600
const QUALIFICATION_SECONDS = 90
type Tracker = ReturnType<typeof makeTracker>
export const makeStages = (config: RuntimeConfig, commands: Commands, tracker: Tracker, git: Git) => {
  const history = (id: BeadId, namespace = "") => ({
    read: (prefix: string) =>
      Effect.gen(function* () {
        const intent = yield* tracker.fact(id, `${namespace}${prefix}_intent`, CommandIntent)
        const finished = yield* tracker.fact(id, `${namespace}${prefix}_finished`, CommandFinished)
        const reconciled = yield* tracker.fact(id, `${namespace}${prefix}_reconciled`, CommandReconciled)
        return { ...(intent ? { intent } : {}), ...(finished ? { finished } : {}), reconciled: reconciled !== null }
      }),
    writers: (attempt: Plan["attempt"], birth: typeof CommandIntent.Type.birth_ticks) =>
      markedProcesses(`DALPH_ATTEMPT=${attempt}`, birth, commands.owner),
    reconcile: (
      prefix: string,
      attempt: Plan["attempt"],
      birth: typeof CommandIntent.Type.birth_ticks,
      observed: number
    ) =>
      tracker.record(id, `${namespace}${prefix}_reconciled`, {
        state: "stopped_without_receipt",
        attempt,
        birth_ticks: birth,
        observed
      })
  })
  const qualifiedTree = Effect.fn("Qualification.exactTree")(function* (plan: Plan, commit: CommitSha) {
    if ((yield* git.git(["rev-parse", "HEAD"], plan.path)) !== commit)
      return yield* new BoundaryFailure({ message: "qualification changed HEAD; refuse acceptance/publication" })
    if (yield* git.git(["status", "--porcelain"], plan.path))
      return yield* new BoundaryFailure({
        message: "qualification tree differs from commit; refuse acceptance/publication"
      })
  })
  const execute = Effect.fn("Delivery.executeStage")(function* (
    id: BeadId,
    plan: Plan,
    kind: "model" | "qualification",
    args: ReadonlyArray<string>,
    commit?: CommitSha,
    namespace = ""
  ) {
    const commitMetadata = commit ? { commit } : {}
    const slot = yield* commandSlot(history(id, namespace), plan.attempt, kind, commit)
    const fs = yield* FileSystem.FileSystem
    const logdir = join(config.root, "evidence", plan.attempt, `${kind}-${slot.ordinal}`)
    const logfile = join(logdir, "stdout.log")
    if (slot.accepted) return logfile
    yield* fs.makeDirectory(logdir, { recursive: true })
    const birth = yield* commands.birth
    const timeout = kind === "model" ? MODEL_SECONDS : (config.projectCheck?.timeoutSeconds ?? QUALIFICATION_SECONDS)
    yield* tracker.record(id, `${namespace}${slot.prefix}_intent`, {
      attempt: plan.attempt,
      birth_ticks: birth,
      command: [...args],
      timeout_seconds: timeout,
      logdir,
      logfile,
      ...commitMetadata
    })
    yield* commands
      .execute(config.root, args, plan.path, Duration.seconds(timeout), {
        stdout: logfile,
        stderr: join(logdir, "stderr.log")
      })
      .pipe(
        Effect.catchTag("CommandRejected", (error) =>
          Effect.gen(function* () {
            if (error.exit !== undefined)
              yield* tracker.record(id, `${namespace}${slot.prefix}_finished`, {
                attempt: plan.attempt,
                exit: error.exit,
                stopped: yield* Clock.currentTimeMillis,
                ...commitMetadata
              })
            return yield* Effect.fail(error)
          })
        )
      )
    if ((yield* markedProcesses(`DALPH_ATTEMPT=${plan.attempt}`, birth, commands.owner)).length)
      return yield* new BoundaryFailure({ message: "stage exit did not stop all marked writers" })
    yield* tracker.record(id, `${namespace}${slot.prefix}_finished`, {
      attempt: plan.attempt,
      exit: 0,
      stopped: yield* Clock.currentTimeMillis,
      ...commitMetadata
    })
    return logfile
  })
  const qualify = Effect.fn("Qualification.run")(function* (id: BeadId, plan: Plan, revision = "") {
    const commit = yield* git
      .git(["rev-parse", "HEAD"], plan.path)
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(CommitSha)))
    yield* qualifiedTree(plan, commit)
    const logfile = yield* execute(
      id,
      plan,
      "qualification",
      config.projectCheck?.command ?? ["mise", "exec", "node@24.20.0", "--", "pnpm", "test"],
      commit,
      revision ? `${revision}_` : ""
    )
    yield* qualifiedTree(plan, commit)
    return yield* Schema.decodeUnknownEffect(Qualification)({ commit, exit: 0, logfile })
  })
  const model = (id: BeadId, plan: Plan, prompt: string) =>
    execute(id, plan, "model", [
      "codex",
      "exec",
      "-C",
      plan.path,
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
      prompt
    ])
  return { model, qualify, qualifiedTree }
}

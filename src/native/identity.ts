import { nativeTrackerArgs } from "./tracker-command.ts"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { Effect, Schema } from "effect"
import { AttemptId, BoundaryFailure, CommitSha } from "../domain/shared.ts"
import { Plan } from "../domain/attempt.ts"
import { Bead, type makeTracker, type Commands } from "../delivery/tracker.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import type { Git } from "../delivery/git.ts"
import { canonical } from "../delivery/files.ts"
import { NativeAttempt, NativeTaskIdentity, type NativeContract } from "./contract.ts"

import { isImplementationMetadata } from "./nodes.ts"
import { WorkspaceSlug } from "./shared-workspace.ts"

type Tracker = ReturnType<typeof makeTracker>
const TASK_POSITIONS = 2
const implementation = (row: Bead) => {
  const metadata = row.metadata ?? {}
  return isImplementationMetadata(metadata)
}
const occupiedPosition = (row: Bead) => {
  const metadata = row.metadata ?? {}
  return implementation(row) && metadata["dalph.native_attempt"] && !metadata["dalph.native_settled"]
}
const admissionBase = Effect.fn("Native.admissionBase")(function* (git: Git) {
  yield* git.git(["fetch", "origin", `${git.target}:${git.remote}`])
  const base = yield* git.git(["rev-parse", git.remote]).pipe(Effect.flatMap(Schema.decodeUnknownEffect(CommitSha)))
  if ((yield* git.git(["symbolic-ref", "HEAD"])) !== git.target)
    return yield* new BoundaryFailure({ message: "native admission requires the configured target branch" })
  if ((yield* git.git(["rev-parse", "HEAD"])) !== base || (yield* git.git(["status", "--porcelain"])))
    return yield* new BoundaryFailure({ message: "native admission requires a clean target equal to the remote head" })
  return base
})
export const nativeRows = (config: RuntimeConfig, commands: Commands) =>
  commands
    .execute(
      config.root,
      nativeTrackerArgs([
        "env",
        "GC_NO_API=1",
        "gc",
        "--city",
        config.city,
        "--rig",
        config.rig,
        "beads",
        "list",
        "--all",
        "--format=json"
      ])
    )
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Bead)))))
export const nativeGroup = Effect.fn("Native.group")(function* (config: RuntimeConfig, commands: Commands, bead: Bead) {
  const input = { ...bead.metadata }
  if (!input["dalph.product_root"]) delete input["dalph.product_root"]
  const metadata = yield* Schema.decodeUnknownEffect(NativeTaskIdentity)(input).pipe(
    Effect.mapError(
      () =>
        new BoundaryFailure({
          message: "native-v1 requires explicit product task/root identity; legacy resume refused"
        })
    )
  )
  const workflowRoot = metadata["gc.root_bead_id"]
  const root = metadata["dalph.product_root"] ?? workflowRoot
  const task = metadata["dalph.task"]
  const roots: ReadonlyArray<string> = [root, workflowRoot]
  const rows = (yield* nativeRows(config, commands)).filter(
    (row): row is Bead & { readonly metadata: NonNullable<Bead["metadata"]> } =>
      !!row.metadata && roots.includes(row.metadata["gc.root_bead_id"] ?? "")
  )
  if (rows.some((row) => row.metadata?.["dalph.task"] && row.metadata["dalph.task"] !== task))
    return yield* new BoundaryFailure({ message: "native workflow has contradictory product task identity" })
  const work = rows.filter(implementation)
  if (work.length !== 1 || !work[0])
    return yield* new BoundaryFailure({ message: "native task needs exactly one implementation iteration" })
  return { root, task, rows, work: work[0] }
})
export const bindNativeAttempt = Effect.fn("Native.bindAttempt")(function* (
  config: RuntimeConfig,
  contract: NativeContract,
  commands: Commands,
  tracker: Tracker,
  git: Git,
  work: Bead
) {
  return yield* git.guarded(
    Effect.gen(function* () {
      const retained = yield* tracker.fact(work.id, "native_attempt", NativeAttempt)
      if (retained) {
        if (canonical(retained.contract) !== canonical(contract))
          return yield* new BoundaryFailure({ message: "retained native attempt requires its original contract" })
        yield* tracker.record(work.id, "work_plan", retained.plan)
        return retained
      }
      const rows = yield* nativeRows(config, commands)
      if (rows.filter(occupiedPosition).length >= TASK_POSITIONS)
        return yield* new BoundaryFailure({ message: "both task-work positions remain occupied by retained attempts" })
      const base = yield* admissionBase(git)
      const workspace = yield* Schema.decodeUnknownEffect(WorkspaceSlug)(
        work.metadata?.["gc.pack_workspace"] ?? `work-${work.id}`
      )
      const plan = yield* Schema.decodeUnknownEffect(Plan)({
        bead: work.id,
        attempt: AttemptId.make(randomUUID().replaceAll("-", "")),
        base,
        branch: `dalph/work/${work.id}`,
        path: join(config.worktrees, workspace)
      })
      const attempt = yield* Schema.decodeUnknownEffect(NativeAttempt)({
        version: "native-v1",
        task: work.metadata?.["dalph.task"],
        root: work.metadata?.["gc.root_bead_id"],
        plan,
        contract
      })
      yield* tracker.record(work.id, "native_attempt", attempt)
      yield* tracker.record(work.id, "work_plan", plan)
      return attempt
    })
  )
})
export const publishNativeWorkspace = Effect.fn("Native.publishWorkspace")(function* (
  config: RuntimeConfig,
  tracker: Tracker,
  git: Git,
  attempt: typeof NativeAttempt.Type
) {
  const plan = attempt.plan
  const values = {
    "gc.work_dir": plan.path,
    "gc.worktree_repo": config.repo,
    "gc.worktree_root": config.worktrees,
    "gc.work_branch": plan.branch,
    "gc.worktree_base_ref": git.remote,
    "gc.worktree_base_sha": plan.base,
    "gc.worktree_creator": "dalph-pack",
    "gc.worktree_owner": plan.attempt,
    "gc.worktree_generation": "1",
    "gc.worktree_lifecycle": "active"
  }
  for (const [key, value] of Object.entries(values)) yield* tracker.metadata(plan.bead, key, value)
})

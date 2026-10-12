import { Effect } from "effect"
import { nativeStopKey } from "../../src/native/session-stop.ts"
import { makeNativeReview } from "../../src/native/review.ts"
import { NativeReviewVerdict } from "../../src/native/review-contract.ts"
import { BeadId } from "../../src/domain/shared.ts"
import { nativeFixture } from "./native-fixture.ts"
import { RESULT } from "./workflow-fixture.ts"

export const nativeReviewFixture = Effect.gen(function* () {
  const f = yield* nativeFixture
  const execute = f.commands.execute
  f.commands.execute = (root, args, cwd, timeout, logs) =>
    args.includes("session") && args.includes("list")
      ? Effect.succeed(
          JSON.stringify({
            sessions: ["session", "review-session", "fix-session"].map((id) => ({
              id,
              template: f.raw(id).metadata.template,
              closed: f.raw(id).status === "closed"
            }))
          })
        )
      : execute(root, args, cwd, timeout, logs)
  const review = makeNativeReview(f.config, f.commands, f.tracker, f.git)
  const node = (id: string, phase: string, round: number) => {
    f.rows.set(id, {
      id: BeadId.make(id),
      status: "open",
      metadata: {
        ...Object.fromEntries(
          Object.entries(f.rows.get(id)?.metadata ?? {}).filter(([key]) => key.startsWith("dalph.native_stop_"))
        ),
        "gc.root_bead_id": "root",
        "dalph.task": "task",
        "dalph.runtime": "native-v1",
        "dalph.phase": phase,
        "gc.iteration": String(round),
        "gc.run_target": phase === "review" ? "fixture/dalph.native-reviewer" : f.contract.agent,
        ...(phase === "review-control"
          ? {
              "gc.kind": "ralph",
              "gc.step_id": "review",
              "gc.step_ref": "native-one-task.review",
              "gc.max_attempts": "4"
            }
          : {})
      }
    })
  }
  const round = (number: number) => {
    node("review", "review", number)
    node("fix", "fix", number)
    node("review-prepare", "review-prepare", number)
    node("review-control", "review-control", number)
    const reviewer = f.rows.get("review-session")
    if (reviewer) {
      reviewer.status = "open"
      reviewer.metadata.state = "awake"
    }
  }
  round(1)
  for (const [id, trigger, template] of [
    ["review-session", "review", "fixture/dalph.native-reviewer"],
    ["fix-session", "fix", f.contract.agent]
  ] as const)
    f.rows.set(id, {
      id: BeadId.make(id),
      status: trigger === "review" ? "open" : "closed",
      metadata: {
        state: trigger === "review" ? "awake" : "closed",
        pool_managed: "true",
        session_origin: "ephemeral",
        "gc.trigger_bead_id": trigger,
        template,
        work_dir: "/fixture/worktrees/work-work"
      }
    })
  const priorStop = JSON.stringify({
    version: 1,
    session: "fix-session",
    node: "fix",
    path: "/fixture/worktrees/work-work",
    template: f.contract.agent
  })
  f.raw("fix").metadata[`dalph.${nativeStopKey(BeadId.make("fix-session"))}`] = priorStop
  const start = Effect.gen(function* () {
    yield* f.workflow.prepare(yield* f.row("prepare"))
    f.state.workHead = RESULT
    yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
  })
  const verdict = Effect.gen(function* () {
    const facts = yield* review.context(yield* f.row("review"))
    return NativeReviewVerdict.make({
      version: 1,
      node: BeadId.make("review"),
      session: BeadId.make("review-session"),
      batch: facts.batch,
      round: facts.round,
      attempt: facts.attempt.plan.attempt,
      task: facts.attempt.task,
      base: facts.attempt.plan.base,
      commit: facts.commit,
      basis: { requirements: true, projectContract: true, baseToCandidate: true },
      findings: []
    })
  })
  return { ...f, review, round, start, verdict }
})

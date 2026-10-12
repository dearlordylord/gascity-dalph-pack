import { Effect, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { RESULT } from "./helpers/workflow-fixture.ts"
import { Bead } from "../src/delivery/tracker.ts"
import { NativeAttempt } from "../src/native/contract.ts"
import { BeadId } from "../src/domain/shared.ts"
import { nativeSession } from "../src/native/session-observation.ts"
import { historicalWritersStopped } from "../src/native/historical-writers.ts"
import { completedReassignedWork } from "../src/native/completed-work.ts"
import { nativeReviewFixture } from "./helpers/native-review-fixture.ts"
import { nativeWriterNode } from "../src/native/review-correlation.ts"
import { reconcileNativeReviews } from "../src/native/reconcile.ts"
import { validateRetiringPools } from "../src/native/pool-policy.ts"
import { nodeWorkspaceMatches } from "../src/native/node-workspace.ts"

const reassigned = Effect.gen(function* () {
  const f = yield* nativeFixture
  f.nativeState.retireCompleted = false
  yield* f.workflow.prepare(yield* f.row("prepare")).pipe(Effect.provide(f.layer))
  f.state.workHead = RESULT
  yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session")).pipe(Effect.provide(f.layer))
  const attempt = yield* f.tracker
    .fact(BeadId.make("work"), "native_attempt", NativeAttempt)
    .pipe(Effect.provide(f.layer))
  if (!attempt) throw new Error("missing attempt")
  f.rows.set("other", {
    id: BeadId.make("other"),
    status: "in_progress",
    metadata: {
      "gc.session_id": "session",
      "gc.run_target": f.contract.agent,
      "gc.work_dir": "/fixture/worktrees/other"
    }
  })
  Object.assign(f.raw("session").metadata, { current_claim_bead_id: "other", work_dir: "/fixture/worktrees/other" })
  return { attempt, f }
})

it.effect("native recovery ignores unclassified nodes and refuses a review without a semantic round", () =>
  Effect.gen(function* () {
    const f = yield* nativeReviewFixture
    f.rows.set("unclassified", {
      id: BeadId.make("unclassified"),
      status: "open",
      metadata: { "gc.root_bead_id": "root", "dalph.task": "task" }
    })
    yield* Effect.gen(function* () {
      yield* f.start
      yield* f.review.prepare(yield* f.row("review-prepare"))
      const attempt = yield* f.tracker.fact(BeadId.make("work"), "native_attempt", NativeAttempt)
      if (!attempt) throw new Error("missing attempt")
      const rows = yield* Effect.forEach([...f.rows.keys()], (id) => f.row(id))
      yield* reconcileNativeReviews(f.config, f.commands, attempt, rows, f.tracker)
      const session = yield* nativeSession(f.config, f.commands, BeadId.make("review-session"))
      const unclassified = Schema.decodeUnknownSync(Bead)({ id: "review", status: "open" })
      expect(nativeWriterNode([unclassified], session, ["review"])).toBeUndefined()
      expect(yield* nodeWorkspaceMatches(f.tracker, unclassified, attempt.plan.path)).toBe(false)
      f.raw("fix").status = "open"
      f.raw("fix").metadata["gc.session_id"] = "fix-session"
      f.raw("fix-session").status = "open"
      const occupied = yield* Effect.forEach([...f.rows.keys()], (id) => f.row(id))
      expect(
        String(yield* Effect.flip(reconcileNativeReviews(f.config, f.commands, attempt, occupied, f.tracker)))
      ).toContain("multiple retained review/fix sessions")
      expect(f.paths.has(attempt.plan.path)).toBe(true)
      delete f.raw("review").metadata["gc.iteration"]
      yield* Effect.flip(f.review.context(yield* f.row("review")))
      expect(f.raw("work").metadata["dalph.result"]).toBeUndefined()
      yield* validateRetiringPools(f.settings.config.Agents, null)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("historical producer recovery proves retained facts and ignores unowned tracker records", () =>
  Effect.gen(function* () {
    for (const fault of ["none", "attempt", "proposal"] as const) {
      const { attempt, f } = yield* reassigned
      yield* Effect.gen(function* () {
        const session = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
        if (fault !== "none") delete f.raw("work").metadata[`dalph.native_${fault}`]
        const noise = Schema.decodeUnknownSync(Schema.Array(Bead))([
          { id: "unowned", status: "open" },
          { id: "no-phase", status: "closed", metadata: { "gc.session_id": "session" } }
        ])
        const read = historicalWritersStopped(
          f.config,
          f.commands,
          f.tracker,
          [...noise, yield* f.row("work")],
          attempt.plan.path,
          session
        )
        if (fault === "none") expect(yield* read).toBe(true)
        else expect(String(yield* Effect.flip(read))).toContain("producer facts are missing")
        expect(f.events).not.toContain("native-close:session")
        expect(f.raw("session").status).toBe("open")
        expect(f.paths.has(attempt.plan.path)).toBe(true)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("completed native ownership refuses missing metadata and a live writer in the original workspace", () =>
  Effect.gen(function* () {
    for (const fault of ["original", "owner", "intruder"] as const) {
      const { attempt, f } = yield* reassigned
      yield* Effect.gen(function* () {
        if (fault === "intruder") {
          f.rows.set("intruder", {
            id: BeadId.make("intruder"),
            status: "open",
            metadata: {
              template: f.contract.agent,
              "gc.trigger_bead_id": "other",
              work_dir: attempt.plan.path,
              pool_managed: "true",
              session_origin: "ephemeral"
            }
          })
          const execute = f.commands.execute
          f.commands.execute = (root, args, cwd, timeout, logs) =>
            args.includes("session") && args.includes("list")
              ? Effect.succeed(
                  JSON.stringify({
                    sessions: [
                      { id: "session", template: f.contract.agent, closed: false },
                      { id: "intruder", template: f.contract.agent, closed: false }
                    ]
                  })
                )
              : execute(root, args, cwd, timeout, logs)
        } else Reflect.deleteProperty(f.raw(fault === "original" ? "work" : "other"), "metadata")
        const session = yield* nativeSession(f.config, f.commands, BeadId.make("session"))
        const failure = yield* Effect.flip(
          completedReassignedWork(
            f.config,
            f.commands,
            f.tracker,
            { node: attempt.plan.bead, path: attempt.plan.path, template: f.contract.agent },
            session
          )
        )
        expect(String(failure)).toContain(fault === "intruder" ? "occupies completed producer workspace" : "unproven")
        expect(f.events).not.toContain("native-close:session")
        expect(f.paths.has(attempt.plan.path)).toBe(true)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

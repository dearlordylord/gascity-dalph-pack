import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { RESULT } from "./helpers/workflow-fixture.ts"
import { NativeAttempt, NativeProposal } from "../src/native/contract.ts"
import { stoppedNativeSession } from "../src/native/session.ts"
import { retiredPoolSession } from "../src/native/retirement.ts"
import { BeadId } from "../src/domain/shared.ts"

const producer = Effect.gen(function* () {
  const f = yield* nativeFixture
  f.nativeState.retireCompleted = false
  yield* f.workflow.prepare(yield* f.row("prepare")).pipe(Effect.provide(f.layer))
  f.state.workHead = RESULT
  yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session")).pipe(Effect.provide(f.layer))
  const attempt = yield* f.tracker
    .fact(BeadId.make("work"), "native_attempt", NativeAttempt)
    .pipe(Effect.provide(f.layer))
  const proposal = yield* f.tracker
    .fact(BeadId.make("work"), "native_proposal", NativeProposal)
    .pipe(Effect.provide(f.layer))
  if (!attempt || !proposal) throw new Error("missing original producer facts")
  return { f, attempt, proposal }
})

it.effect("native observation follows open producer retirement or reassignment without closing an open owner", () =>
  Effect.gen(function* () {
    for (const mode of ["closed", "reassigned"] as const) {
      const { attempt, f, proposal } = yield* producer
      const original = f.raw("work").metadata["dalph.native_attempt"]
      const observation = yield* stoppedNativeSession(f.config, f.commands, proposal, attempt, f.tracker).pipe(
        Effect.provide(f.layer),
        Effect.forkChild
      )
      yield* TestClock.adjust("1 second")
      expect(f.events).not.toContain("native-close:session")
      if (mode === "closed") f.raw("session").status = "closed"
      else {
        f.rows.set("other", {
          id: BeadId.make("other"),
          status: "in_progress",
          metadata: {
            "gc.session_id": "session",
            "gc.run_target": attempt.contract.agent,
            "gc.work_dir": "/fixture/worktrees/other"
          }
        })
        Object.assign(f.raw("session").metadata, {
          current_claim_bead_id: "other",
          work_dir: "/fixture/worktrees/other"
        })
      }
      yield* TestClock.adjust("1 second")
      yield* Fiber.join(observation)
      expect(f.raw("work").metadata["dalph.native_attempt"]).toBe(original)
      expect(f.events.filter((entry) => entry === "native-close:session")).toHaveLength(mode === "closed" ? 1 : 0)
      expect(f.events).not.toContain("native-runtime-stop:session")
    }
  })
)

it.effect("an indefinitely open native producer reaches the observation deadline retaining exact resources", () =>
  Effect.gen(function* () {
    const { attempt, f, proposal } = yield* producer
    const original = f.raw("work").metadata["dalph.native_proposal"]
    const observation = yield* stoppedNativeSession(f.config, f.commands, proposal, attempt, f.tracker).pipe(
      Effect.provide(f.layer),
      Effect.flip,
      Effect.forkChild
    )
    yield* TestClock.adjust("45 seconds")
    expect((yield* Fiber.join(observation))._tag).toBe("NativeSessionPending")
    expect(f.raw("work").metadata["dalph.native_proposal"]).toBe(original)
    expect(f.paths.has(attempt.plan.path)).toBe(true)
    expect(f.events).not.toContain("native-close:session")
    expect(f.raw("work").metadata["dalph.result"]).toBeUndefined()
  })
)

it.effect("named, manual and unknown session ownership cannot use terminal pool close", () =>
  Effect.gen(function* () {
    for (const fault of ["named", "manual", "manualFlag", "unknown"] as const) {
      const { f } = yield* producer
      f.raw("session").status = "closed"
      if (fault === "named") f.raw("session").metadata.configured_named_session = "true"
      if (fault === "manual") f.raw("session").metadata.session_origin = "manual"
      if (fault === "manualFlag") f.raw("session").metadata.manual_session = "true"
      if (fault === "unknown") delete f.raw("session").metadata.pool_managed
      yield* Effect.flip(retiredPoolSession(f.config, f.commands, BeadId.make("session"))).pipe(Effect.provide(f.layer))
      expect(f.events).not.toContain("native-close:session")
    }
  })
)

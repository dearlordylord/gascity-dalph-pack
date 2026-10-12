import { stopNativeWriter, nativeStopKey } from "../src/native/session-stop.ts"
import { nativeSession } from "../src/native/session-observation.ts"
import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect, it } from "@effect/vitest"
import { nativeReviewFixture as fixture } from "./helpers/native-review-fixture.ts"
import { NativeAttempt } from "../src/native/contract.ts"
import { settleNative } from "../src/native/settlement.ts"
import { makeNativeContinuation, continuationBatch } from "../src/native/continuation.ts"
import { makeNativeController } from "../src/native/controller.ts"
import { ReviewRound } from "../src/native/review-contract.ts"
import { BeadId } from "../src/domain/shared.ts"
import { BASE } from "./helpers/workflow-fixture.ts"
import { reconcileNativeReviews } from "../src/native/reconcile.ts"
import { reviewNodes } from "../src/native/review-correlation.ts"

it.effect("native transport retries select the latest physical reviewer within the same semantic round", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const original = yield* f.row("review")
    const first = { ...original, metadata: { ...original.metadata, "gc.attempt": "1", "gc.retry_attempt": "1" } }
    const second = {
      ...first,
      id: BeadId.make("review-retry"),
      metadata: { ...first.metadata, "gc.attempt": "1", "gc.retry_attempt": "2" }
    }
    expect(reviewNodes([first, second], 1, "initial")).toEqual([second])
    for (const invalid of ["0", "1.5", "NaN", "9007199254740992"])
      expect(
        reviewNodes([first, { ...second, metadata: { ...second.metadata, "gc.retry_attempt": invalid } }], 1, "initial")
      ).toEqual([])
  })
)

it.effect("S3 independent clean semantic verdict exits at round one and exact evidence survives recovery", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.gen(function* () {
      yield* f.start
      yield* f.review.prepare(yield* f.row("review-prepare"))
      expect(f.raw("fix").status).toBe("closed")
      const verdict = yield* f.verdict
      yield* f.review.submit(yield* f.row("review"), verdict)
      expect(yield* f.review.gate(yield* f.row("review-control"))).toEqual(verdict)
      expect(yield* f.review.gate(yield* f.row("review-control"))).toEqual(verdict)
      expect(f.raw("work").metadata["dalph.native_approved_initial_1"]).toBeDefined()
      f.raw("work").metadata["dalph.review_required"] = "true"
      yield* f.workflow.check(yield* f.row("review-control"))
      expect(f.raw("work").metadata["dalph.result"]).toBeDefined()
    }).pipe(Effect.provide(f.layer))
  })
)
it.effect("review gate refuses a foreign template before requesting its teardown", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.gen(function* () {
      yield* f.start
      yield* f.review.prepare(yield* f.row("review-prepare"))
      yield* f.review.submit(yield* f.row("review"), yield* f.verdict)
      f.raw("review-session").metadata.template = "foreign/reviewer"
      const error = yield* Effect.flip(f.review.gate(yield* f.row("review-control")))
      expect(String(error)).toContain("correlation")
      expect(f.events).not.toContain("native-close:review-session")
      expect(f.raw("review").metadata[`dalph.${nativeStopKey(BeadId.make("review-session"))}`]).toBeUndefined()
      expect(f.raw("work").metadata["dalph.native_approved_initial_1"]).toBeUndefined()
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("a retained verdict survives native reviewer pool reassignment without closing the new review owner", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.gen(function* () {
      yield* f.start
      yield* f.review.prepare(yield* f.row("review-prepare"))
      f.nativeState.retireCompleted = false
      f.raw("review").metadata["gc.session_id"] = "review-session"
      const verdict = yield* f.verdict
      yield* f.review.submit(yield* f.row("review"), verdict)
      f.rows.set("other-review", {
        id: BeadId.make("other-review"),
        status: "in_progress",
        metadata: {
          "gc.session_id": "review-session",
          "gc.run_target": "fixture/dalph.native-reviewer",
          "gc.work_dir": "/fixture/worktrees/other-review"
        }
      })
      Object.assign(f.raw("review-session").metadata, {
        "gc.trigger_bead_id": "other-review",
        work_dir: "/fixture/worktrees/other-review"
      })
      const attempt = yield* f.tracker.fact(BeadId.make("work"), "native_attempt", NativeAttempt)
      expect(attempt).not.toBeNull()
      if (!attempt) return yield* Effect.die("missing original attempt")
      yield* reconcileNativeReviews(
        f.config,
        f.commands,
        attempt,
        yield* Effect.forEach([...f.rows.keys()], (id) => f.row(id)),
        f.tracker
      )
      expect(yield* f.review.gate(yield* f.row("review-control"))).toEqual(verdict)
      expect(f.raw("review-session").status).toBe("open")
      expect(f.events).not.toContain("native-close:review-session")
      expect(f.raw("work").metadata["dalph.native_approved_initial_1"]).toBeDefined()
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("S4 four blocking rounds retain findings and same-attempt fixes without approval", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.gen(function* () {
      yield* f.start
      const attempt = f.raw("work").metadata["dalph.native_attempt"]
      for (let round = 1; round <= 4; round++) {
        f.round(round)
        yield* f.review.prepare(yield* f.row("review-prepare"))
        if (round > 1) {
          expect(f.raw("fix").status).toBe("open")
          yield* f.review.finishFix(yield* f.row("fix"), BeadId.make("fix-session"))
        }
        yield* f.review.submit(yield* f.row("review"), {
          ...(yield* f.verdict),
          findings: [{ id: "block", message: "Requirement is missing", disposition: "blocking" }]
        })
        const error = yield* Effect.flip(f.review.gate(yield* f.row("review-control")))
        expect(error._tag).toBe("ReviewBlocking")
        expect(f.raw("work").metadata[`dalph.native_review_initial_${round}`]).toBeDefined()
      }
      expect(f.raw("work").metadata["dalph.native_attempt"]).toBe(attempt)
      expect(f.raw("work").metadata["dalph.result"]).toBeUndefined()
      expect(f.raw("delivery").status).toBe("open")
      expect(Schema.decodeUnknownOption(ReviewRound)(5)._tag).toBe("None")
      expect(f.state.pushCalls).toBe(0)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect(
  "S3 review refuses contradictory evidence while closed native status supersedes unknown lifecycle metadata",
  () =>
    Effect.gen(function* () {
      for (const fault of [
        "transport",
        "malformed",
        "candidate",
        "session",
        "node",
        "attempt",
        "task",
        "base",
        "round",
        "batch",
        "trigger",
        "path",
        "template",
        "live",
        "state",
        "basis",
        "pin",
        "dirty",
        "duplicate"
      ] as const) {
        const f = yield* fixture
        yield* Effect.gen(function* () {
          yield* f.start
          yield* f.review.prepare(yield* f.row("review-prepare"))
          const original = yield* f.verdict
          if (fault === "transport") {
            expect((yield* Effect.flip(f.review.gate(yield* f.row("review-control"))))._tag).toBe(
              "ReviewInfrastructureFailure"
            )
          } else if (fault === "malformed") {
            f.raw("review").metadata["dalph.native_review_initial_1"] = "{broken"
            yield* Effect.flip(f.review.gate(yield* f.row("review-control")))
          } else if (["candidate", "live", "state", "dirty"].includes(fault)) {
            yield* f.review.submit(yield* f.row("review"), original)
            if (fault === "candidate") f.state.workHead = "c".repeat(40)
            if (fault === "live") {
              f.raw("review-session").status = "open"
              f.nativeState.stopFailure = true
            }
            if (fault === "state") {
              f.raw("review-session").metadata.state = "unknown"
            }
            if (fault === "dirty") f.state.dirty = true
            if (fault === "state") expect(yield* f.review.gate(yield* f.row("review-control"))).toEqual(original)
            else if (fault === "live") {
              const pending = yield* f.review.gate(yield* f.row("review-control")).pipe(Effect.flip, Effect.forkChild)
              yield* TestClock.adjust("45 seconds")
              expect((yield* Fiber.join(pending))._tag).toBe("NativeSessionPending")
            } else yield* Effect.flip(f.review.gate(yield* f.row("review-control")))
          } else if (fault === "duplicate") {
            f.rows.set("another-review", { ...f.raw("review"), id: BeadId.make("another-review") })
            yield* Effect.flip(f.review.gate(yield* f.row("review-control")))
          } else {
            const changed: Record<string, unknown> = { ...original }
            if (fault === "session") changed.session = "session"
            if (fault === "node") changed.node = "foreign"
            if (fault === "attempt") changed.attempt = "foreign"
            if (fault === "task") changed.task = "foreign"
            if (fault === "base") changed.base = "c".repeat(40)
            if (fault === "round") changed.round = 2
            if (fault === "batch") changed.batch = "foreign"
            if (fault === "basis") changed.basis = { ...original.basis, projectContract: false }
            if (fault === "pin") delete f.raw("work").metadata["dalph.native_review_candidate_initial_1"]
            if (fault === "trigger") f.raw("review-session").metadata["gc.trigger_bead_id"] = "foreign"
            if (fault === "path") f.raw("review-session").metadata.work_dir = "/foreign"
            if (fault === "template") f.raw("review-session").metadata.template = "foreign"
            yield* Effect.flip(f.review.submit(yield* f.row("review"), changed))
          }
          if (fault === "state") expect(f.raw("work").metadata["dalph.native_approved_initial_1"]).toBeDefined()
          else expect(f.raw("work").metadata["dalph.native_approved_initial_1"]).toBeUndefined()
          expect(f.state.qualificationCalls).toBe(1)
        }).pipe(Effect.provide(f.layer))
      }
    })
)

it.effect("S4 later clean review qualifies and settles the repaired commit", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.gen(function* () {
      yield* f.start
      yield* f.review.prepare(yield* f.row("review-prepare"))
      yield* f.review.submit(yield* f.row("review"), {
        ...(yield* f.verdict),
        findings: [{ id: "repair", message: "Repair requirement", disposition: "blocking" }]
      })
      yield* Effect.flip(f.review.gate(yield* f.row("review-control")))
      f.round(2)
      yield* f.review.prepare(yield* f.row("review-prepare"))
      const repaired = "e".repeat(40)
      f.state.parents = `${BASE} ${repaired}`
      f.state.workHead = repaired
      f.branches.set("dalph/work/work", repaired)
      yield* f.review.finishFix(yield* f.row("fix"), BeadId.make("fix-session"))
      yield* f.review.submit(yield* f.row("review"), yield* f.verdict)
      yield* f.review.gate(yield* f.row("review-control"))
      f.raw("work").metadata["dalph.review_required"] = "true"
      yield* f.workflow.check(yield* f.row("review-control"))
      expect(f.raw("work").metadata["dalph.result"]).toContain(repaired)
      yield* f.workflow.integrate(yield* f.row("delivery"))
      const attempt = yield* f.tracker.fact(BeadId.make("work"), "native_attempt", NativeAttempt)
      if (!attempt) throw new Error("missing retained attempt")
      expect(yield* settleNative(f.tracker, yield* f.row("delivery"), attempt)).toBe(true)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("human continuation deduplicates submission and permits more than four finite lifetime batches", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    let launched = 0
    const execute = f.commands.execute
    f.commands.execute = (root, args, cwd, timeout, logs) => {
      if (!args.includes("cook")) return execute(root, args, cwd, timeout, logs)
      launched++
      const id = `continued-${launched}`
      const batch = args.find((arg) => arg.startsWith("batch="))?.slice(6)
      f.rows.set(id, {
        id: BeadId.make(id),
        status: "closed",
        metadata: {
          "gc.root_bead_id": id,
          "dalph.product_root": "root",
          "dalph.task": "task",
          "dalph.runtime": "native-v1",
          "dalph.phase": "review-control",
          "dalph.review_batch": batch ?? "",
          "gc.iteration": "4",
          "gc.outcome": "fail"
        }
      })
      return Effect.succeed(JSON.stringify({ schema_version: "1", ok: true, mode: "cook", root_id: id }))
    }
    const continuation = makeNativeContinuation(f.config, f.contract, f.commands, f.tracker, f.git, process.execPath)
    yield* Effect.gen(function* () {
      yield* f.start
      yield* Effect.flip(continuation.continuation(yield* f.row("review-control"), "premature"))
      for (let round = 1; round <= 4; round++) {
        f.round(round)
        yield* f.review.prepare(yield* f.row("review-prepare"))
        if (round > 1) yield* f.review.finishFix(yield* f.row("fix"), BeadId.make("fix-session"))
        yield* f.review.submit(yield* f.row("review"), {
          ...(yield* f.verdict),
          findings: [{ id: "block", message: "Retained repair", disposition: "blocking" }]
        })
        yield* Effect.flip(f.review.gate(yield* f.row("review-control")))
      }
      f.raw("review-control").metadata["gc.outcome"] = "fail"
      f.raw("review-control").status = "closed"
      f.raw("review-control").metadata["gc.failed_attempt"] = "4"
      f.raw("review-control").metadata["dalph.phase"] = "review"
      delete f.raw("review-control").metadata["gc.iteration"]
      for (let batch = 1; batch <= 6; batch++) {
        const key = `human-${batch}`
        const submitted = yield* continuation.continuation(yield* f.row("review-control"), key)
        expect(yield* continuation.continuation(yield* f.row("review-control"), key)).toEqual(submitted)
        expect(launched).toBe(batch)
        expect(continuationBatch("root", key)).toContain("human-")
      }
      expect(f.raw("work").metadata["dalph.result"]).toBeUndefined()
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("review recovery preserves occupied sessions and rejects missing or contradictory inventory", () =>
  Effect.gen(function* () {
    for (const fault of ["missing", "path", "template", "state", "multiple", "closed"] as const) {
      const f = yield* fixture
      yield* Effect.gen(function* () {
        yield* f.start
        f.raw("review").metadata["gc.session_id"] = "review-session"
        const session = f.raw("review-session")
        if (fault === "missing") f.raw("review").metadata["gc.session_id"] = "lost-session"
        if (fault === "path") session.metadata.work_dir = "/foreign"
        if (fault === "template") session.metadata.template = "foreign"
        if (fault === "state") {
          session.status = "open"
          session.metadata.state = "unknown"
        }
        if (fault === "multiple") {
          session.status = "open"
          session.metadata.state = "awake"
          f.raw("fix-session").status = "open"
          f.raw("fix-session").metadata.state = "awake"
        }
        if (fault === "closed") {
          f.raw("review").status = "closed"
          f.raw("fix").status = "closed"
          session.status = "closed"
          yield* stopNativeWriter(
            f.config,
            f.commands,
            f.tracker,
            yield* nativeSession(f.config, f.commands, session.id)
          )
        }
        const resume = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath).resume(
          BeadId.make("root")
        )
        if (fault === "closed" || fault === "state") yield* resume
        else yield* Effect.flip(resume)
        if (fault === "state") {
          expect(session.status).toBe("open")
          expect(f.raw("review").status).not.toBe("closed")
          expect(f.raw("work").metadata["dalph.result"]).toBeUndefined()
        }
      }).pipe(Effect.provide(f.layer))
    }
  })
)
it.effect("review expansion assigns the retained worktree before releasing fix and reviewer nodes", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.gen(function* () {
      yield* f.start
      // Expansion children can appear after the original task preparation.
      delete f.raw("review").metadata["gc.pack_workspace"]
      delete f.raw("fix").metadata["gc.pack_workspace"]
      yield* f.review.prepare(yield* f.row("review-prepare"))
      expect(f.raw("review").metadata["gc.pack_workspace"]).toBe("work-work")
      expect(f.raw("fix").metadata["gc.pack_workspace"]).toBe("work-work")
      expect(f.raw("review").metadata["dalph.native_attempt"]).toBe(f.raw("work").metadata["dalph.native_attempt"])
    }).pipe(Effect.provide(f.layer))
  })
)

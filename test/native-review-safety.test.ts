import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeReviewFixture } from "./helpers/native-review-fixture.ts"
import { BeadId } from "../src/domain/shared.ts"
import { makeNativeController } from "../src/native/controller.ts"

it.effect("qualification refuses missing or contradictory retained independent approval", () =>
  Effect.gen(function* () {
    for (const fault of ["missing", "attempt", "task", "base", "blocking"] as const) {
      const f = yield* nativeReviewFixture
      yield* Effect.gen(function* () {
        yield* f.start
        yield* f.review.prepare(yield* f.row("review-prepare"))
        yield* f.review.submit(yield* f.row("review"), yield* f.verdict)
        yield* f.review.gate(yield* f.row("review-control"))
        const metadata = f.raw("work").metadata
        metadata["dalph.review_required"] = "true"
        if (fault === "missing") delete metadata["dalph.native_approved_initial_1"]
        else {
          const approved = yield* f.verdict
          metadata["dalph.native_approved_initial_1"] = JSON.stringify({
            ...approved,
            ...(fault === "attempt" ? { attempt: "foreign" } : {}),
            ...(fault === "task" ? { task: "foreign" } : {}),
            ...(fault === "base" ? { base: "e".repeat(40) } : {}),
            ...(fault === "blocking"
              ? { findings: [{ id: "block", message: "Unresolved finding", disposition: "blocking" }] }
              : {})
          })
        }
        const qualifications = f.state.qualificationCalls
        expect(String(yield* Effect.flip(f.workflow.check(yield* f.row("review-control"))))).toContain(
          "no correlated clean independent review"
        )
        expect(f.state.qualificationCalls).toBe(qualifications)
        expect(metadata["dalph.result"]).toBeUndefined()
        expect(f.state.pushCalls).toBe(0)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("review refuses missing retained attempt or proposal before accepting evidence", () =>
  Effect.gen(function* () {
    for (const key of ["dalph.native_attempt", "dalph.native_proposal"]) {
      const f = yield* nativeReviewFixture
      yield* Effect.gen(function* () {
        yield* f.start
        delete f.raw("work").metadata[key]
        expect(String(yield* Effect.flip(f.review.context(yield* f.row("review"))))).toContain("retained")
        expect(f.raw("work").metadata["dalph.native_approved_initial_1"]).toBeUndefined()
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("review submission and fix completion refuse the wrong workflow role", () =>
  Effect.gen(function* () {
    const f = yield* nativeReviewFixture
    yield* Effect.gen(function* () {
      yield* f.start
      expect(String(yield* Effect.flip(f.review.submit(yield* f.row("work"), yield* f.verdict)))).toContain(
        "reviewer node"
      )
      expect(
        String(yield* Effect.flip(f.review.finishFix(yield* f.row("review"), BeadId.make("fix-session"))))
      ).toContain("fix node")
      expect(f.raw("review").metadata["dalph.native_review_initial_1"]).toBeUndefined()
      expect(f.raw("fix").metadata["dalph.native_fix_initial_1"]).toBeUndefined()
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("review preparation refuses missing fix identity or previous completed findings", () =>
  Effect.gen(function* () {
    for (const fault of ["fix", "previous"]) {
      const f = yield* nativeReviewFixture
      yield* Effect.gen(function* () {
        yield* f.start
        if (fault === "fix") f.rows.delete("fix")
        else f.round(2)
        const error = yield* Effect.flip(f.review.prepare(yield* f.row("review-prepare")))
        expect(String(error)).toContain(fault === "fix" ? "exact native fix node" : "previous completed review")
        expect(f.raw("review-prepare").status).toBe("open")
        expect(f.raw("review").status).toBe("open")
        expect(f.raw("work").metadata["dalph.result"]).toBeUndefined()
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("fix completion refuses a foreign session trigger, worktree or template", () =>
  Effect.gen(function* () {
    for (const key of ["current_claim_bead_id", "work_dir", "template"]) {
      const f = yield* nativeReviewFixture
      yield* Effect.gen(function* () {
        yield* f.start
        f.raw("fix-session").metadata[key] = "foreign"
        expect(
          String(yield* Effect.flip(f.review.finishFix(yield* f.row("fix"), BeadId.make("fix-session"))))
        ).toContain("correlation")
        expect(f.raw("fix").metadata["dalph.native_fix_initial_1"]).toBeUndefined()
        expect(f.raw("work").metadata["dalph.native_review_candidate_initial_1"]).toBeUndefined()
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("review reads closed writers by exact identity when stock inventory omits them", () =>
  Effect.gen(function* () {
    const f = yield* nativeReviewFixture
    yield* Effect.gen(function* () {
      yield* f.start
      yield* f.review.prepare(yield* f.row("review-prepare"))
      yield* f.review.submit(yield* f.row("review"), yield* f.verdict)
      f.raw("session").status = "closed"
      f.raw("review-session").status = "closed"
      const execute = f.commands.execute
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        args.includes("session") && args.includes("list")
          ? Effect.succeed(JSON.stringify({ sessions: [] }))
          : execute(root, args, cwd, timeout, logs)
      yield* f.review.gate(yield* f.row("review-control"))
      expect(f.raw("work").metadata["dalph.native_approved_initial_1"]).toBeDefined()
      const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
      yield* controller.resume(BeadId.make("root"))
      expect(f.events).toContain("native-resume")
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("review requires every expected open writer in the fresh native inventory", () =>
  Effect.gen(function* () {
    const f = yield* nativeReviewFixture
    yield* Effect.gen(function* () {
      yield* f.start
      yield* f.review.prepare(yield* f.row("review-prepare"))
      yield* f.review.submit(yield* f.row("review"), yield* f.verdict)
      f.raw("review-session").status = "open"
      const execute = f.commands.execute
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        args.includes("session") && args.includes("list")
          ? Effect.succeed(
              JSON.stringify({
                sessions: ["session", "fix-session"].map((id) => ({
                  id,
                  template: f.raw(id).metadata.template,
                  closed: f.raw(id).status === "closed"
                }))
              })
            )
          : execute(root, args, cwd, timeout, logs)
      expect(String(yield* Effect.flip(f.review.gate(yield* f.row("review-control"))))).toContain("incomplete")
      expect(f.raw("work").metadata["dalph.native_approved_initial_1"]).toBeUndefined()
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("closed writer readback cannot authorize another task or workspace", () =>
  Effect.gen(function* () {
    for (const fault of ["task", "workspace", "template", "missing-template"] as const) {
      const f = yield* nativeReviewFixture
      yield* Effect.gen(function* () {
        yield* f.start
        yield* f.review.prepare(yield* f.row("review-prepare"))
        yield* f.review.submit(yield* f.row("review"), yield* f.verdict)
        f.raw("session").status = "closed"
        f.raw("review-session").status = "closed"
        const execute = f.commands.execute
        f.commands.execute = (root, args, cwd, timeout, logs) =>
          args.includes("session") && args.includes("list")
            ? Effect.sync(() => {
                // The identity changes after verdict validation, before stop reconciliation.
                const metadata = f.raw("review-session").metadata
                if (fault === "task") {
                  metadata["current_claim_bead_id"] = "foreign-task"
                  metadata.work_dir = "/foreign/worktree"
                } else if (fault === "workspace") metadata.work_dir = "/foreign/worktree"
                else if (fault === "template") metadata.template = "foreign/worker"
                else delete metadata.template
                return JSON.stringify({ sessions: [] })
              })
            : execute(root, args, cwd, timeout, logs)
        expect(String(yield* Effect.flip(f.review.gate(yield* f.row("review-control"))))).toContain(
          fault === "task" ? "reassignment" : "contradictory"
        )
        expect(f.raw("work").metadata["dalph.native_approved_initial_1"]).toBeUndefined()
        expect(f.events).not.toContain("native-close:review-session")
        expect(f.paths.has("/fixture/worktrees/work-work")).toBe(true)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("public resume refuses overlapping retained fix and review writers without reopening native dispatch", () =>
  Effect.gen(function* () {
    const f = yield* nativeReviewFixture
    yield* Effect.gen(function* () {
      yield* f.start
      f.raw("fix-session").status = "open"
      f.raw("fix-session").metadata.state = "awake"
      const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
      expect(String(yield* Effect.flip(controller.resume(BeadId.make("root"))))).toContain(
        "multiple retained review/fix sessions"
      )
      expect(f.events.some((event) => event.includes("resume"))).toBe(false)
      expect(f.raw("review-session").status).toBe("open")
      expect(f.raw("fix-session").status).toBe("open")
      expect(f.paths.has("/fixture/worktrees/work-work")).toBe(true)
      expect(f.state.pushCalls).toBe(0)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("an unrelated native session sharing the attempt workspace retains custody without being stopped", () =>
  Effect.gen(function* () {
    for (const sameWorkspace of [true, false]) {
      const f = yield* nativeReviewFixture
      yield* Effect.gen(function* () {
        yield* f.start
        yield* f.review.prepare(yield* f.row("review-prepare"))
        yield* f.review.submit(yield* f.row("review"), yield* f.verdict)
        f.rows.set("foreign-session", {
          id: BeadId.make("foreign-session"),
          status: "open",
          metadata: {
            state: "awake",
            current_claim_bead_id: "foreign-task",
            template: "outside/worker",
            work_dir: sameWorkspace ? "/fixture/worktrees/work-work" : "/foreign/worktree"
          }
        })
        const execute = f.commands.execute
        f.commands.execute = (root, args, cwd, timeout, logs) =>
          args.includes("session") && args.includes("list")
            ? Effect.succeed(
                JSON.stringify({
                  sessions: ["session", "fix-session", "review-session", "foreign-session"].map((id) => ({
                    id,
                    template: f.raw(id).metadata.template,
                    closed: f.raw(id).status === "closed"
                  }))
                })
              )
            : execute(root, args, cwd, timeout, logs)
        const gate = f.review.gate(yield* f.row("review-control"))
        if (sameWorkspace) {
          expect(String(yield* Effect.flip(gate))).toContain("unrelated native writer")
          expect(f.raw("work").metadata["dalph.native_approved_initial_1"]).toBeUndefined()
          f.raw("foreign-session").metadata.work_dir = "/foreign/worktree"
          yield* f.review.gate(yield* f.row("review-control"))
        } else yield* gate
        expect(f.raw("foreign-session").status).toBe("open")
        expect(f.events).not.toContain("native-close:foreign-session")
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("mirrored native controls are excluded from writers while shared-workspace custody still refuses them", () =>
  Effect.gen(function* () {
    for (const kind of ["ralph", "spec", "retry", "check", "scope"]) {
      const f = yield* nativeReviewFixture
      yield* Effect.gen(function* () {
        yield* f.start
        f.rows.set("control", {
          id: BeadId.make("control"),
          status: "open",
          metadata: { ...f.raw("review").metadata, "gc.kind": kind }
        })
        f.rows.set("fix-control", {
          id: BeadId.make("fix-control"),
          status: "open",
          metadata: { ...f.raw("fix").metadata, "gc.kind": kind }
        })
        yield* f.review.prepare(yield* f.row("review-prepare"))
        yield* f.review.submit(yield* f.row("review"), yield* f.verdict)
        expect(String(yield* Effect.flip(f.review.submit(yield* f.row("control"), yield* f.verdict)))).toContain(
          "reviewer node"
        )
        expect(
          String(yield* Effect.flip(f.review.finishFix(yield* f.row("fix-control"), BeadId.make("fix-session"))))
        ).toContain("fix node")
        f.rows.set("control-session", {
          id: BeadId.make("control-session"),
          status: "open",
          metadata: {
            state: "awake",
            current_claim_bead_id: "control",
            template: "fixture/controller",
            work_dir: "/fixture"
          }
        })
        const execute = f.commands.execute
        f.commands.execute = (root, args, cwd, timeout, logs) =>
          args.includes("session") && args.includes("list")
            ? Effect.succeed(
                JSON.stringify({
                  sessions: ["session", "fix-session", "review-session", "control-session"].map((id) => ({
                    id,
                    template: f.raw(id).metadata.template,
                    closed: f.raw(id).status === "closed"
                  }))
                })
              )
            : execute(root, args, cwd, timeout, logs)
        yield* f.review.gate(yield* f.row("review-control"))
        expect(f.events).not.toContain("native-close:control-session")
        expect(f.raw("control-session").status).toBe("open")
        f.raw("control-session").metadata.work_dir = "/fixture/worktrees/work-work"
        expect(String(yield* Effect.flip(f.review.gate(yield* f.row("review-control"))))).toContain(
          "unrelated native writer"
        )
        expect(f.events).not.toContain("native-close:control-session")
      }).pipe(Effect.provide(f.layer))
    }
  })
)

import { nativeStopKey } from "../src/native/session-stop.ts"
import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { nativeCheckLauncher } from "../src/native/launcher.ts"
import { makeNativeController } from "../src/native/controller.ts"
import { BeadId } from "../src/domain/shared.ts"
import { NativeAttempt } from "../src/native/contract.ts"
import { bindNativeAttempt } from "../src/native/identity.ts"
import { RESULT } from "./helpers/workflow-fixture.ts"

it.effect("native launch refuses an unqualified Ralph infrastructure build before cooking", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    f.nativeState.gasCityVersion = "dev"
    const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
    yield* Effect.flip(controller.launch("Task")).pipe(Effect.provide(f.layer))
    expect(f.events).not.toContain("native-cook")
    expect(f.paths.size).toBe(0)
  })
)

it.effect("public resume preserves an aborted scope's skipped delivery without claiming publication or cleanup", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
    yield* Effect.gen(function* () {
      yield* controller.launch("Task")
      yield* f.workflow.prepare(yield* f.row("prepare"))
      const retained = f.raw("work").metadata["dalph.native_attempt"]
      f.raw("delivery").status = "closed"
      f.raw("delivery").metadata["gc.outcome"] = "skipped"
      yield* controller.resume(BeadId.make("root"))
      expect(f.raw("work").metadata["dalph.native_attempt"]).toBe(retained)
      expect(f.raw("work").metadata["dalph.native_settled"]).toBeUndefined()
      expect(f.paths.size).toBe(1)
      expect(f.state.pushCalls).toBe(0)
      expect(f.events).toContain("native-resume")
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("native admission binds the authored workspace locator and refuses an escaping locator", () =>
  Effect.gen(function* () {
    for (const workspace of ["work-launch-unique", "../escape"] as const) {
      const f = yield* nativeFixture
      f.raw("work").metadata["gc.pack_workspace"] = workspace
      yield* Effect.gen(function* () {
        const admission = bindNativeAttempt(f.config, f.contract, f.commands, f.tracker, f.git, yield* f.row("work"))
        if (workspace === "../escape") {
          yield* Effect.flip(admission)
          expect(f.raw("work").metadata["dalph.native_attempt"]).toBeUndefined()
          expect(f.paths.size).toBe(0)
        } else {
          const attempt = yield* admission
          expect(attempt.plan.path).toBe("/fixture/worktrees/work-launch-unique")
          expect(attempt.plan.bead).toBe("work")
          expect((yield* admission).plan).toEqual(attempt.plan)
        }
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("S1/S6 public native launch and resume deliver one exact configured task", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
    yield* Effect.gen(function* () {
      expect((yield* controller.launch("Implement the assigned task")).workflow_id).toBe("root")
      expect(f.events.filter((event) => event === "native-cook")).toHaveLength(1)
      const execute = f.commands.execute
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        args.includes("beads") && args.includes("list")
          ? Effect.succeed(JSON.stringify([...f.rows.values(), { id: "unrelated", status: "open" }]))
          : execute(root, args, cwd, timeout, logs)
      yield* controller.resume(BeadId.make("root"))
      yield* f.workflow.prepare(yield* f.row("prepare"))
      const retained = f.raw("work").metadata["dalph.native_attempt"]
      yield* controller.resume(BeadId.make("root"))
      expect(f.raw("work").metadata["dalph.native_attempt"]).toBe(retained)
      f.state.workHead = RESULT
      f.branches.set("dalph/work/work", RESULT)
      yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
      yield* f.workflow.check(yield* f.row("work"))
      yield* f.workflow.integrate(yield* f.row("delivery"))
      f.rows.set("delivery-scope", {
        id: BeadId.make("delivery-scope"),
        status: "closed",
        metadata: { ...f.raw("delivery").metadata, "gc.kind": "scope" }
      })
      delete f.raw("work").metadata["dalph.native_settled"]
      yield* controller.resume(BeadId.make("root"))
      expect(f.raw("work").metadata["dalph.native_settled"]).toBeDefined()
      expect(f.state.modelCalls).toBe(0)
      expect(f.state.pushCalls).toBe(1)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("S5/S12 public resume refuses lost resources, ambiguous delivery, changed contract and legacy root", () =>
  Effect.gen(function* () {
    for (const fault of ["legacy", "changed", "lost", "missing", "ambiguous", "unprepared", "root", "bead"] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
        if (fault === "legacy") yield* Effect.flip(controller.resume(BeadId.make("root")))
        else {
          yield* controller.launch("Task")
          yield* f.workflow.prepare(yield* f.row("prepare"))
          if (fault === "changed")
            yield* Effect.flip(
              makeNativeController(
                f.config,
                { ...f.contract, harnessVersion: "changed" },
                f.commands,
                f.tracker,
                process.execPath
              ).resume(BeadId.make("root"))
            )
          if (fault === "lost") {
            f.paths.clear()
            yield* Effect.flip(controller.resume(BeadId.make("root")))
          }
          if (fault === "missing") {
            f.rows.delete("delivery")
            yield* Effect.flip(controller.resume(BeadId.make("root")))
          }
          if (fault === "ambiguous") {
            f.rows.set("second-delivery", {
              ...f.raw("delivery"),
              id: BeadId.make("second-delivery"),
              metadata: { ...f.raw("delivery").metadata }
            })
            yield* Effect.flip(controller.resume(BeadId.make("root")))
          }
          if (fault === "root" || fault === "bead") {
            const attempt = yield* f.tracker.fact(BeadId.make("work"), "native_attempt", NativeAttempt)
            if (!attempt) throw new Error("missing attempt")
            f.raw("work").metadata["dalph.native_attempt"] = JSON.stringify(
              fault === "root"
                ? { ...attempt, root: "foreign" }
                : { ...attempt, plan: { ...attempt.plan, bead: "foreign" } }
            )
            yield* Effect.flip(controller.resume(BeadId.make("root")))
          }
          if (fault === "unprepared") {
            delete f.raw("work").metadata["dalph.work_prepared"]
            yield* controller.resume(BeadId.make("root"))
          }
        }
        expect(f.state.modelCalls).toBe(0)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("S1 public launch preflight fails before workflow or worktree admission", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    f.nativeState.readiness = false
    yield* Effect.flip(
      makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath).launch("Task")
    ).pipe(Effect.provide(f.layer))
    expect(f.raw("root").metadata["dalph.native_launch"]).toBeUndefined()
    expect(f.paths.size).toBe(0)
  })
)

it.effect("S5 durable task positions survive stopped or uncertain native sessions and controller restart", () =>
  Effect.gen(function* () {
    for (const state of ["closed", "runtime-missing", "absent"] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        yield* makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath).launch("Task")
        yield* f.workflow.prepare(yield* f.row("prepare"))
        const attempt = yield* f.tracker.fact(BeadId.make("work"), "native_attempt", NativeAttempt)
        if (!attempt) throw new Error("missing retained attempt")
        f.raw("session").status = "closed"
        if (state === "absent") delete f.raw("session").metadata.state
        else f.raw("session").metadata.state = state
        f.raw("work").status = "closed"
        if (state === "closed")
          f.raw("work").metadata[`dalph.${nativeStopKey(BeadId.make("session"))}`] = JSON.stringify({
            version: 1,
            session: "session",
            node: "work",
            path: attempt.plan.path,
            template: f.contract.agent
          })
        f.rows.set("second", {
          id: BeadId.make("second"),
          status: "closed",
          metadata: {
            "dalph.phase": "work",
            "dalph.native_attempt": JSON.stringify({
              ...attempt,
              root: "second-root",
              plan: { ...attempt.plan, bead: "second", attempt: "second-attempt" }
            })
          }
        })
        const ensureCalls = f.events.filter((event) => event.includes("worktree ensure")).length
        const resume = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath).resume(
          BeadId.make("root")
        )
        // Exact public close reconciles stale or missing lifecycle metadata.
        yield* resume
        expect(f.events.filter((event) => event.includes("worktree ensure")).length).toBe(ensureCalls)
        f.rows.set("third", {
          id: BeadId.make("third"),
          status: "open",
          metadata: {
            "dalph.phase": "work",
            "dalph.runtime": "native-v1",
            "dalph.task": "third",
            "gc.root_bead_id": "third-root"
          }
        })
        yield* Effect.flip(bindNativeAttempt(f.config, f.contract, f.commands, f.tracker, f.git, yield* f.row("third")))
        expect(f.raw("third").metadata["dalph.native_attempt"]).toBeUndefined()
        expect(f.state.modelCalls).toBe(0)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("S5 public resume observes the same native session and refuses duplicate or miscorrelated writers", () =>
  Effect.gen(function* () {
    for (const fault of [
      "live",
      "duplicate",
      "path",
      "unrelated",
      "missing",
      "unknown",
      "runtime-missing",
      "inventory",
      "proposal-session",
      "claim-missing",
      "owner",
      "cleared-closed",
      "cleared-foreign"
    ] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
        yield* controller.launch("Task")
        yield* f.workflow.prepare(yield* f.row("prepare"))
        f.raw("session").status = "open"
        f.raw("session").metadata.state = "awake"
        if (fault === "missing") delete f.raw("session").metadata.state
        if (fault === "unknown" || fault === "runtime-missing") f.raw("session").metadata.state = fault
        if (fault === "path") f.raw("session").metadata.work_dir = "/foreign"
        if (fault === "unrelated") f.raw("session").metadata["current_claim_bead_id"] = "another-task"
        if (["claim-missing", "cleared-closed", "cleared-foreign"].includes(fault))
          delete f.raw("session").metadata.current_claim_bead_id
        if (fault === "cleared-closed" || fault === "cleared-foreign") f.raw("session").status = "closed"
        if (fault === "owner" || fault === "cleared-foreign")
          f.raw("work").metadata["gc.session_id"] = "foreign-session"
        if (fault === "duplicate") {
          f.rows.set("duplicate", { ...f.raw("session"), id: BeadId.make("duplicate") })
          const execute = f.commands.execute
          f.commands.execute = (root, args, cwd, timeout, logs) =>
            args.includes("session") && args.includes("list")
              ? Effect.succeed(
                  JSON.stringify({
                    sessions: ["session", "duplicate"].map((id) => ({ id, template: f.contract.agent, closed: false }))
                  })
                )
              : execute(root, args, cwd, timeout, logs)
        }
        if (fault === "inventory") {
          const execute = f.commands.execute
          f.commands.execute = (root, args, cwd, timeout, logs) =>
            args.includes("session") && args.includes("list")
              ? Effect.succeed(JSON.stringify({ sessions: [] }))
              : execute(root, args, cwd, timeout, logs)
        }
        if (fault === "proposal-session") {
          f.state.workHead = RESULT
          yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
          const proposal = JSON.parse(f.raw("work").metadata["dalph.native_proposal"] ?? "{}")
          f.raw("work").metadata["dalph.native_proposal"] = JSON.stringify({ ...proposal, session: "lost-session" })
        }
        const before = f.raw("work").metadata["dalph.native_attempt"]
        const resume = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath).resume(
          BeadId.make("root")
        )
        if (
          [
            "duplicate",
            "path",
            "unrelated",
            "inventory",
            "proposal-session",
            "claim-missing",
            "owner",
            "cleared-foreign"
          ].includes(fault)
        )
          expect(yield* Effect.isFailure(resume), fault).toBe(true)
        else yield* resume
        expect(f.raw("work").metadata["dalph.native_attempt"]).toBe(before)
        expect(f.raw("work").metadata["dalph.native_settled"]).toBeUndefined()
        expect(f.state.modelCalls).toBe(0)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("retained recovery trusts exact closed sessions over a stale list without completing their task", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
      yield* controller.launch("Task")
      yield* f.workflow.prepare(yield* f.row("prepare"))
      f.raw("work").status = "in_progress"
      f.raw("session").status = "closed"
      f.raw("session").metadata.state = "failed-create"
      const execute = f.commands.execute
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        args.includes("session") && args.includes("list")
          ? Effect.succeed(JSON.stringify({ sessions: [{ id: "session", template: f.contract.agent, closed: false }] }))
          : execute(root, args, cwd, timeout, logs)
      const retained = f.raw("work").metadata["dalph.native_attempt"]
      yield* controller.resume(BeadId.make("root"))
      expect(f.events).toContain("native-close:session")
      expect(f.events).toContain("native-resume")
      expect(f.raw("work").status).toBe("in_progress")
      expect(f.raw("work").metadata["dalph.native_attempt"]).toBe(retained)
      expect(f.raw("work").metadata["dalph.result"]).toBeUndefined()
      expect(f.paths.size).toBe(1)
      expect(f.state.pushCalls).toBe(0)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("native check launcher retains exact pinned execution and refuses changed private content", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    f.settings.config.Workspace.Env.DALPH_TRIAL_ROOT = "/fixture/with ' quotes $(false)"
    yield* Effect.gen(function* () {
      const path = yield* nativeCheckLauncher(f.config, f.commands, process.execPath)
      expect(yield* nativeCheckLauncher(f.config, f.commands, process.execPath)).toBe(path)
      const source = f.files.get(path) ?? ""
      expect(source).toContain(process.execPath)
      expect(source).toContain("'\\''")
      expect(source).toContain("dist/native.js' 'check'")
      f.files.set(path, "foreign content")
      yield* Effect.flip(nativeCheckLauncher(f.config, f.commands, process.execPath))
    }).pipe(Effect.provide(f.layer))
  })
)

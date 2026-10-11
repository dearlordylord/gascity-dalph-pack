import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { nativeCheckLauncher } from "../src/native/launcher.ts"
import { makeNativeController } from "../src/native/controller.ts"
import { BeadId } from "../src/domain/shared.ts"
import { NativeAttempt } from "../src/native/contract.ts"
import { bindNativeAttempt } from "../src/native/identity.ts"
import { RESULT } from "./helpers/workflow-fixture.ts"

it.effect("S1/S6 public native launch and resume deliver one exact configured task", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker)
    yield* Effect.gen(function* () {
      expect((yield* controller.launch("Implement the assigned task")).workflow_id).toBe("root")
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
    for (const fault of ["legacy", "changed", "lost", "ambiguous", "unprepared", "root", "bead"] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker)
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
                f.tracker
              ).resume(BeadId.make("root"))
            )
          if (fault === "lost") {
            f.paths.clear()
            yield* Effect.flip(controller.resume(BeadId.make("root")))
          }
          if (fault === "ambiguous") {
            f.rows.delete("delivery")
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
    yield* Effect.flip(makeNativeController(f.config, f.contract, f.commands, f.tracker).launch("Task")).pipe(
      Effect.provide(f.layer)
    )
    expect(f.raw("root").metadata["dalph.native_launch"]).toBeUndefined()
    expect(f.paths.size).toBe(0)
  })
)

it.effect("S5 durable task positions survive stopped or uncertain native sessions and controller restart", () =>
  Effect.gen(function* () {
    for (const state of ["closed", "runtime-missing", "absent"] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        yield* makeNativeController(f.config, f.contract, f.commands, f.tracker).launch("Task")
        yield* f.workflow.prepare(yield* f.row("prepare"))
        const attempt = yield* f.tracker.fact(BeadId.make("work"), "native_attempt", NativeAttempt)
        if (!attempt) throw new Error("missing retained attempt")
        f.raw("session").status = "closed"
        if (state === "absent") delete f.raw("session").metadata.state
        else f.raw("session").metadata.state = state
        f.raw("work").status = "closed"
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
        const resume = makeNativeController(f.config, f.contract, f.commands, f.tracker).resume(BeadId.make("root"))
        if (state !== "closed") yield* Effect.flip(resume)
        else yield* resume
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
      "proposal-session"
    ] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker)
        yield* controller.launch("Task")
        yield* f.workflow.prepare(yield* f.row("prepare"))
        f.raw("session").status = "open"
        f.raw("session").metadata.state = "awake"
        if (fault === "missing") delete f.raw("session").metadata.state
        if (fault === "unknown" || fault === "runtime-missing") f.raw("session").metadata.state = fault
        if (fault === "path") f.raw("session").metadata.work_dir = "/foreign"
        if (fault === "unrelated") f.raw("session").metadata["gc.trigger_bead_id"] = "another-task"
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
        const resume = makeNativeController(f.config, f.contract, f.commands, f.tracker).resume(BeadId.make("root"))
        if (
          [
            "duplicate",
            "path",
            "missing",
            "unknown",
            "runtime-missing",
            "unrelated",
            "inventory",
            "proposal-session"
          ].includes(fault)
        )
          yield* Effect.flip(resume)
        else yield* resume
        expect(f.raw("work").metadata["dalph.native_attempt"]).toBe(before)
        expect(f.raw("work").metadata["dalph.native_settled"]).toBeUndefined()
        expect(f.state.modelCalls).toBe(0)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("native check launcher retains exact pinned execution and refuses changed private content", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    f.settings.config.Workspace.Env.DALPH_TRIAL_ROOT = "/fixture/with ' quotes $(false)"
    yield* Effect.gen(function* () {
      const path = yield* nativeCheckLauncher(f.config, f.commands)
      expect(yield* nativeCheckLauncher(f.config, f.commands)).toBe(path)
      const source = f.files.get(path) ?? ""
      expect(source).toContain(process.execPath)
      expect(source).toContain("'\\''")
      expect(source).toContain("dist/native.js' check")
      f.files.set(path, "foreign content")
      yield* Effect.flip(nativeCheckLauncher(f.config, f.commands))
    }).pipe(Effect.provide(f.layer))
  })
)

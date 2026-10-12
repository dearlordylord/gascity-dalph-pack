import { Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { NativeAttempt } from "../src/native/contract.ts"
import { BeadId } from "../src/domain/shared.ts"
import { CommandRejected } from "../src/delivery/command.ts"
import { makeTracker } from "../src/delivery/tracker.ts"
import { makeWorkflow } from "../src/delivery/workflow.ts"
import { makeStages } from "../src/delivery/stages.ts"
import { makeWorktrees } from "../src/delivery/worktrees.ts"
import { makeNativeWorkflow } from "../src/native/workflow.ts"
import { isImplementationMetadata } from "../src/native/nodes.ts"
import { nativePreflight } from "../src/native/preflight.ts"
import { RESULT } from "./helpers/workflow-fixture.ts"

it.effect("native boundaries require immutable attempt and exact implementation identity", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      yield* Effect.flip(f.workflow.check(yield* f.row("work")))
      yield* f.workflow.prepare(yield* f.row("prepare"))
      yield* f.workflow.prepare(yield* f.row("prepare"))
      yield* Effect.flip(f.workflow.finish(yield* f.row("prepare"), BeadId.make("session")))
      yield* Effect.flip(f.workflow.integrate(yield* f.row("delivery")))
      f.state.workHead = RESULT
      yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
      yield* Effect.flip(f.workflow.finish(yield* f.row("work"), BeadId.make("other")))
      f.state.workHead = "e".repeat(40)
      yield* Effect.flip(f.workflow.finish(yield* f.row("work"), BeadId.make("session")))
      f.state.workHead = RESULT
      f.raw("session").metadata.template = "foreign"
      yield* Effect.flip(f.workflow.check(yield* f.row("work")))
      const attempt = yield* f.tracker.fact(BeadId.make("work"), "native_attempt", NativeAttempt)
      if (!attempt) throw new Error("missing attempt")
      f.raw("work").metadata["dalph.native_attempt"] = JSON.stringify({
        ...attempt,
        plan: { ...attempt.plan, bead: "foreign" }
      })
      yield* Effect.flip(f.workflow.check(yield* f.row("work")))
      expect(isImplementationMetadata({})).toBe(false)
      expect(isImplementationMetadata({ "dalph.phase": "work", "gc.kind": "spec" })).toBe(false)
      expect(isImplementationMetadata({ "dalph.phase": "work", "gc.kind": "ralph" })).toBe(false)
      expect(isImplementationMetadata({ "dalph.phase": "work", "gc.kind": "scope-check" })).toBe(false)
      yield* f.workflow.claim()
      const execute = f.commands.execute
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        args.includes("current")
          ? Effect.fail(new CommandRejected({ message: "no current claim", receipt: "fixture", exit: 1 }))
          : execute(root, args, cwd, timeout, logs)
      expect((yield* f.workflow.claim())?.bead_id).toBe("work")
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("native metadata writes require acknowledgement and reject contradictions", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      yield* f.tracker.metadata(BeadId.make("work"), "owned", "original")
      yield* f.tracker.metadata(BeadId.make("work"), "owned", "original")
      yield* Effect.flip(f.tracker.metadata(BeadId.make("work"), "owned", "foreign"))
      f.state.casAcknowledged = false
      yield* Effect.flip(f.tracker.metadata(BeadId.make("work"), "new", "value"))
      f.nativeState.wrongRead = true
      yield* Effect.flip(f.tracker.bead(BeadId.make("work")))
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("an applied native conditional write cannot be acknowledged by another bead", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    const execute = f.commands.execute
    f.commands.execute = (root, args, cwd, timeout, logs) =>
      execute(root, args, cwd, timeout, logs).pipe(
        Effect.map((response) =>
          args.includes("metadata-cas") ? JSON.stringify({ ...JSON.parse(response), bead_id: "foreign" }) : response
        )
      )
    yield* Effect.gen(function* () {
      const failure = yield* Effect.flip(f.tracker.metadata(BeadId.make("work"), "exact_ack", "value"))
      expect(String(failure)).toContain("acknowledgement names another bead")
      expect(f.raw("work").metadata.exact_ack).toBe("value")
      expect(f.raw("work").status).toBe("open")
      expect(f.state.pushCalls).toBe(0)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("native preparation never substitutes another immutable plan", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      yield* f.workflow.prepare(yield* f.row("prepare"))
      const original = f.raw("work").metadata["dalph.work_plan"] ?? ""
      const plan = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))(original)
      const tracker = {
        ...f.tracker,
        record: (id: BeadId, key: string, value: Schema.JsonObject) =>
          f.tracker.record(id, key, value).pipe(
            Effect.tap(() => {
              if (key === "native_launch")
                f.raw("work").metadata["dalph.work_plan"] = JSON.stringify({ ...plan, attempt: "changed" })
              return Effect.void
            })
          )
      }
      const workflow = makeNativeWorkflow(f.config, f.contract, f.commands, tracker, f.git)
      yield* Effect.flip(workflow.prepare(yield* f.row("prepare")))
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("native terminal close response failure retains workflow custody", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      yield* f.workflow.prepare(yield* f.row("prepare"))
      f.state.workHead = RESULT
      yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
      f.nativeState.closeResponseLost = true
      const failure = yield* Effect.flip(f.workflow.check(yield* f.row("work")))
      expect(String(failure)).toContain("native close response lost")
      expect(f.raw("work").metadata["dalph.result"]).toBeUndefined()
      expect(f.raw("session").status).toBe("closed")
      expect(f.paths.size).toBe(1)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("explicit agent provider and native permission configuration pass preflight", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    f.nativeState.providerPermission = "plan"
    f.nativeState.permissionModes = { plan: "--permission-mode plan" }
    f.settings.config.Agents.forEach((agent) => {
      agent.OptionDefaults = { permission_mode: "plan" }
      agent.Provider = ""
    })
    yield* nativePreflight(f.config, f.contract, f.commands).pipe(Effect.provide(f.layer))
  })
)

it.effect("native admission reads inherited provider and ignores metadata-less unrelated nodes", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    const execute = f.commands.execute
    f.commands.execute = (root, args, cwd, timeout, logs) => {
      if (args.includes("agent") && args.includes("list"))
        return Effect.succeed(
          JSON.stringify({
            agents: f.settings.config.Agents.map((role) => ({
              qualified_name: `${role.Dir}/dalph.${role.Name}`,
              suspended: false
            }))
          })
        )
      if (args.includes("beads") && args.includes("list"))
        return Effect.succeed(JSON.stringify([...f.rows.values(), { id: "unrelated", status: "open" }]))
      return execute(root, args, cwd, timeout, logs)
    }
    yield* f.workflow.prepare(yield* f.row("prepare")).pipe(Effect.provide(f.layer))
  })
)

it.effect("selected alternate native harness uses its own qualified version", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    const execute = f.commands.execute
    f.settings.config.Workspace.Provider = "claude"
    f.settings.config.Agents.forEach((role) => {
      role.Provider = "claude"
    })
    f.commands.execute = (root, args, cwd, timeout, logs) => {
      if (args.includes("agent") && args.includes("list"))
        return Effect.succeed(
          JSON.stringify({
            agents: [
              { qualified_name: f.contract.agent, provider: "claude", suspended: false },
              { qualified_name: "fixture/dalph.native-reviewer", suspended: false },
              ...f.settings.config.Agents.filter((role) => role.StartCommand).map((role) => ({
                qualified_name: `${role.Dir}/dalph.${role.Name}`,
                suspended: false
              }))
            ]
          })
        )
      if (args[0] === "claude") return Effect.succeed("2.1.289")
      return execute(root, args, cwd, timeout, logs)
    }
    yield* nativePreflight(f.config, { ...f.contract, harness: "claude", harnessVersion: "2.1.289" }, f.commands).pipe(
      Effect.provide(f.layer)
    )
  })
)

it.effect("legacy discovery accepts public array output and refuses empty work", () =>
  Effect.gen(function* () {
    for (const rows of [[], [{ id: "work", status: "open" }]] as const) {
      const f = yield* nativeFixture
      const execute = f.commands.execute
      f.commands.execute = (root, args, cwd, timeout, logs) =>
        args.includes("hook") && !args.includes("--claim")
          ? Effect.succeed(JSON.stringify(rows))
          : execute(root, args, cwd, timeout, logs)
      // The legacy fixture owns its command port, so exercise the public discovery seam through a workflow with that port.
      const stages = makeStages(f.config, f.commands, f.tracker, f.git)
      const trees = makeWorktrees(f.config, f.commands, f.tracker, f.git)
      const workflow = makeWorkflow(f.config, f.commands, f.tracker, f.git, stages, trees)
      yield* Effect.flip(workflow.run("worker")).pipe(Effect.provide(f.layer))
      expect(f.state.modelCalls).toBe(0)
    }
  })
)

it.effect("retained candidate boundaries cannot switch their configured project check", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      yield* f.workflow.prepare(yield* f.row("prepare"))
      const changed = makeNativeWorkflow(
        f.config,
        { ...f.contract, check: { command: ["node", "-e", "process.exit(0)"], timeoutSeconds: 1 } },
        f.commands,
        f.tracker,
        f.git
      )
      yield* Effect.flip(changed.check(yield* f.row("work")))
      expect(f.raw("work").metadata["dalph.result"]).toBeUndefined()
      expect(f.state.qualificationCalls).toBe(1)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("native dead-runtime observation requires terminal status before workflow qualification", () =>
  Effect.gen(function* () {
    for (const status of ["closed", "open"] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        yield* f.workflow.prepare(yield* f.row("prepare"))
        f.state.workHead = RESULT
        f.branches.set("dalph/work/work", RESULT)
        yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
        f.nativeState.retireCompleted = false
        f.raw("session").status = status
        f.raw("session").metadata.state = "dead-runtime"
        if (status === "closed") {
          yield* f.workflow.check(yield* f.row("work"))
          expect(f.raw("work").metadata["dalph.result"]).toBeDefined()
          delete f.raw("session").metadata.state
          yield* f.workflow.integrate(yield* f.row("delivery"))
          expect(f.raw("work").metadata["dalph.native_settled"]).toBeDefined()
        } else {
          const observation = yield* f.workflow.check(yield* f.row("work")).pipe(Effect.flip, Effect.forkChild)
          yield* TestClock.adjust("45 seconds")
          expect((yield* Fiber.join(observation))._tag).toBe("NativeSessionPending")
          expect(f.raw("work").metadata["dalph.result"]).toBeUndefined()
          expect(f.events).not.toContain("native-close:session")
          expect(f.paths.size).toBe(1)
        }
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("native tracker rejects missing scoped client and foreign write acknowledgement", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      yield* Effect.flip(makeTracker(f.config, f.commands).bead(BeadId.make("work")))
      yield* Effect.flip(makeTracker(f.config, f.commands).record(BeadId.make("work"), "proof", { exact: true }))
      const execute = f.commands.execute
      let reads = 0
      f.commands.execute = (root, args, cwd, timeout, logs) => {
        if (args.includes("beads") && args.includes("show") && ++reads === 2)
          return Effect.succeed(JSON.stringify({ id: "foreign", status: "open" }))
        return execute(root, args, cwd, timeout, logs)
      }
      yield* Effect.flip(f.tracker.metadata(BeadId.make("work"), "foreign-ack", "value"))
      f.commands.execute = execute
      f.raw("spec").metadata["dalph.task"] = "another-task"
      yield* Effect.flip(f.workflow.prepare(yield* f.row("prepare")))
      expect(f.paths.size).toBe(0)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect(
  "native idle and drain are successful quiescence, while unknown or contradictory exits cannot claim work",
  () =>
    Effect.gen(function* () {
      for (const fault of ["idle", "drain", "unknown", "contradictory"] as const) {
        const f = yield* nativeFixture
        yield* Effect.gen(function* () {
          const execute = f.commands.execute
          f.commands.execute = (root, args, cwd, timeout, logs) => {
            if (args.includes("hook"))
              return Effect.fail(
                new CommandRejected({
                  message: fault,
                  receipt: "/fixture/claim.json",
                  ...(fault !== "unknown" ? { exit: 1 } : {})
                })
              )
            return execute(root, args, cwd, timeout, logs)
          }
          f.files.set(
            "/fixture/claim.stdout",
            JSON.stringify(
              fault === "contradictory" ? { action: "work", bead_id: "work" } : { action: fault, reason: "no_work" }
            )
          )
          if (fault === "idle" || fault === "drain") expect(yield* f.workflow.claim()).toBeNull()
          else yield* Effect.flip(f.workflow.claim())
          expect(f.state.modelCalls).toBe(0)
          expect(f.paths.size).toBe(0)
        }).pipe(Effect.provide(f.layer))
      }
    })
)

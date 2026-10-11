import { Duration, Effect, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { CommandRejected } from "../src/delivery/command.ts"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { NativeAttempt, NativeContract, NativeProposal } from "../src/native/contract.ts"
import { bindNativeAttempt, nativeGroup } from "../src/native/identity.ts"
import { correlatedSession, nativeSession, stoppedNativeSession } from "../src/native/session.ts"
import { BeadId } from "../src/domain/shared.ts"
import { RESULT, BASE } from "./helpers/workflow-fixture.ts"

it.effect(
  "native-v1 prepares qualified Base, correlates a native result and delivers through existing safe integration",
  () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        yield* f.workflow.prepare(yield* f.row("prepare"))
        const before = yield* f.tracker.fact(BeadId.make("work"), "native_attempt", NativeAttempt)
        expect(before?.plan.base).toBe(BASE)
        expect(f.rows.get("work")?.metadata["gc.work_dir"]).toBe(before?.plan.path)
        expect(f.state.modelCalls).toBe(0)
        f.state.workHead = RESULT
        f.branches.set("dalph/work/work", RESULT)
        yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
        yield* f.workflow.check(yield* f.row("work"))
        expect(f.state.qualificationCalls).toBe(2)
        expect(f.rows.get("delivery")?.metadata["dalph.native_candidate"]).toContain(RESULT)
        yield* f.workflow.integrate(yield* f.row("delivery"))
        expect(f.state.pushCalls).toBe(1)
        expect(f.paths.size).toBe(0)
        expect(f.rows.get("work")?.metadata["dalph.native_settled"]).toBeDefined()
        expect(yield* f.tracker.fact(BeadId.make("work"), "native_attempt", NativeAttempt)).toEqual(before)
        expect(f.state.modelCalls).toBe(0)
      }).pipe(Effect.provide(f.layer))
    })
)

it.effect("S5 retained attempts retain Base and occupy capacity even with stopped sessions", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      yield* f.workflow.prepare(yield* f.row("prepare"))
      const first = yield* f.tracker.fact(BeadId.make("work"), "native_attempt", NativeAttempt)
      expect(first).not.toBeNull()
      f.state.remote = RESULT
      const retained = yield* bindNativeAttempt(
        f.config,
        f.contract,
        f.commands,
        f.tracker,
        f.git,
        yield* f.row("work")
      )
      expect(retained.plan.base).toBe(BASE)
      f.rows.set("occupied", {
        id: BeadId.make("occupied"),
        status: "closed",
        metadata: { "dalph.phase": "work", "dalph.native_attempt": JSON.stringify(first) }
      })
      f.rows.set("third", {
        id: BeadId.make("third"),
        status: "open",
        metadata: { "dalph.task": "third", "gc.root_bead_id": "third-root" }
      })
      const refused = yield* Effect.flip(
        bindNativeAttempt(f.config, f.contract, f.commands, f.tracker, f.git, yield* f.row("third"))
      )
      expect(String(refused)).toContain("occupied")
      expect(f.rows.get("third")?.metadata["dalph.native_attempt"]).toBeUndefined()
      f.paths.clear()
      expect(String(yield* Effect.flip(f.workflow.prepare(yield* f.row("prepare"))))).toContain("worktree lost")
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("S6 qualification failure, missing proposal, dirty or moved candidate cannot accept", () =>
  Effect.gen(function* () {
    for (const fault of ["missing", "dirty", "moves", "failed"] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        yield* f.workflow.prepare(yield* f.row("prepare"))
        if (fault !== "missing") {
          f.state.workHead = RESULT
          yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
        }
        f.state.dirty = fault === "dirty"
        f.state.stageMovesHead = fault === "moves"
        f.state.qualificationExit = fault === "failed" ? 1 : 0
        yield* Effect.flip(f.workflow.check(yield* f.row("work")))
        expect(f.rows.get("work")?.metadata["dalph.result"]).toBeUndefined()
        expect(f.state.pushCalls).toBe(0)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect("S1 mandatory preflight refuses unsupported capabilities before planning", () =>
  Effect.gen(function* () {
    for (const fault of [
      "agent",
      "wrapper",
      "matching",
      "runtime",
      "writes",
      "tracker",
      "release",
      "permission",
      "runtimeVersion",
      "version",
      "readiness"
    ] as const) {
      const f = yield* nativeFixture
      if (fault === "agent") f.nativeState.configured = false
      if (fault === "matching")
        f.settings.config.Agents.forEach((agent) => {
          agent.Name = "unconfigured"
        })
      if (fault === "wrapper")
        f.settings.config.Agents.forEach((agent) => {
          agent.StartCommand = "codex exec"
        })
      if (fault === "runtime") f.settings.config.Session.Provider = "subprocess"
      if (fault === "tracker") f.settings.config.Beads.Provider = "file"
      if (fault === "writes") f.settings.config.Beads.ConditionalWrites = "off"
      if (fault === "release") f.settings.config.Beads.GuardedRelease = "off"
      if (fault === "permission") f.nativeState.providerPermission = "invalid"
      if (fault === "runtimeVersion") f.nativeState.runtime = "other"
      if (fault === "version") f.nativeState.version = "other"
      if (fault === "readiness") f.nativeState.readiness = false
      yield* Effect.flip(f.workflow.prepare(yield* f.row("prepare"))).pipe(Effect.provide(f.layer))
      expect(f.paths.size).toBe(0)
      expect(f.rows.get("work")?.metadata["dalph.native_attempt"]).toBeUndefined()
    }
    expect(Schema.decodeUnknownOption(NativeContract)({ version: 1 })).toEqual(
      expect.objectContaining({ _tag: "None" })
    )
  })
)

it.effect("S12 native and legacy runtimes refuse reinterpretation before a task writer or resource mutation", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      delete f.raw("prepare").metadata["dalph.runtime"]
      expect(String(yield* Effect.flip(nativeGroup(f.config, f.commands, yield* f.row("prepare"))))).toContain("legacy")
      expect(String(yield* Effect.flip(f.legacyWorkflow().run("worker")))).toContain("legacy-v1")
      expect(f.state.modelCalls).toBe(0)
      expect(f.paths.size).toBe(0)
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("native session correlation and fresh stopped proof fail closed", () =>
  Effect.gen(function* () {
    const f = yield* nativeFixture
    yield* Effect.gen(function* () {
      yield* f.workflow.prepare(yield* f.row("prepare"))
      f.state.workHead = RESULT
      yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
      const attempt = yield* f.tracker.fact(BeadId.make("work"), "native_attempt", NativeAttempt)
      const proposal = yield* f.tracker.fact(BeadId.make("work"), "native_proposal", NativeProposal)
      if (!attempt || !proposal) throw new Error("missing fixture attempt")
      for (const key of ["template", "work_dir", "gc.trigger_bead_id"] as const) {
        const original = f.raw("session").metadata[key] ?? ""
        f.raw("session").metadata[key] = "foreign"
        yield* Effect.flip(correlatedSession(f.config, f.commands, proposal, attempt))
        f.raw("session").metadata[key] = original
      }
      for (const changed of [
        { ...proposal, task: "foreign" },
        { ...proposal, path: f.config.repo },
        { ...proposal, base: Schema.decodeUnknownSync(NativeProposal.fields.base)("c".repeat(40)) },
        { ...proposal, attempt: Schema.decodeUnknownSync(NativeProposal.fields.attempt)("foreign") }
      ])
        yield* Effect.flip(correlatedSession(f.config, f.commands, changed, attempt))
      f.raw("session").status = "open"
      expect((yield* Effect.flip(stoppedNativeSession(f.config, f.commands, proposal, attempt)))._tag).toBe(
        "NativeSessionPending"
      )
      f.nativeState.wrongRead = true
      yield* Effect.flip(nativeSession(f.config, f.commands, proposal.session))
    }).pipe(Effect.provide(f.layer))
  })
)

it.effect("S6 native workflow refuses timed-out, missing-receipt and changed-tree project checks", () =>
  Effect.gen(function* () {
    for (const fault of ["timeout", "missing-receipt", "changed-tree"] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        yield* f.workflow.prepare(yield* f.row("prepare"))
        f.state.workHead = RESULT
        yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
        const execute = f.commands.execute
        f.commands.execute = (root, args, cwd, timeout, logs) => {
          if (args[0] !== "node" || args[1] !== "--test") return execute(root, args, cwd, timeout, logs)
          expect(cwd).toBe("/fixture/worktrees/work-work")
          expect(Duration.toSeconds(timeout ?? Duration.zero)).toBe(7)
          if (fault !== "changed-tree")
            return Effect.fail(new CommandRejected({ message: fault, receipt: "/fixture/check.json" }))
          return execute(root, args, cwd, timeout, logs).pipe(
            Effect.tap(() => {
              f.state.dirty = true
              return Effect.void
            })
          )
        }
        yield* Effect.flip(f.workflow.check(yield* f.row("work")))
        expect(f.raw("work").metadata["dalph.result"]).toBeUndefined()
        expect(f.state.pushCalls).toBe(0)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

import { Effect, FileSystem, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import * as HttpClient from "effect/http/HttpClient"
import { CommandRejected } from "../src/delivery/command.ts"
import { BeadId, BoundaryFailure } from "../src/domain/shared.ts"
import { makeTracker } from "../src/delivery/tracker.ts"
import { makeWorkflow } from "../src/delivery/workflow.ts"
import { Bead, verifyClaim } from "../src/delivery/tracker-observation.ts"
import { observePrerequisites, verifyDependencies } from "../src/delivery/tracker-eligibility.ts"
import {
  cityScopeMatches,
  claimOwnershipMatches,
  implementationIdentityMatches
} from "../src/delivery/tracker-scope.ts"
import { makeFixture } from "./helpers/workflow-fixture.ts"

it.effect("native idle and drain settle without any task or resource effect", () =>
  Effect.gen(function* () {
    for (const reason of ["no_work", "drain_pending", "rig_suspended"]) {
      const f = yield* makeFixture
      const commands = {
        ...f.commands,
        execute: (_root: string, args: ReadonlyArray<string>) =>
          args.includes("hook")
            ? Effect.succeed(
                JSON.stringify({
                  schema_version: "1",
                  ok: true,
                  command: "hook",
                  action: "drain",
                  reason,
                  drain_acknowledged: true
                })
              )
            : f.commands.execute(_root, args)
      }
      const tracker = makeTracker(f.config, commands)
      const workflow = makeWorkflow(f.config, commands, tracker, f.git, f.stages, f.worktrees)
      for (const role of ["worker", "integrator"] as const)
        expect(
          yield* workflow
            .run(role)
            .pipe(
              Effect.provideService(FileSystem.FileSystem, f.fs),
              Effect.provideService(HttpClient.HttpClient, f.http)
            )
        ).toEqual({ outcome: "idle", reason })
      expect(f.state.modelCalls).toBe(0)
      expect(f.paths.size).toBe(0)
      expect(f.rows.get("work")?.status).toBe("open")
    }
  })
)
it.effect("unavailable and incomplete claim reads never become idle", () =>
  Effect.gen(function* () {
    for (const payload of [
      "",
      "{}",
      '{"action":"drain"}',
      JSON.stringify({
        schema_version: "1",
        ok: true,
        command: "hook",
        action: "drain",
        reason: "claims_errored",
        drain_acknowledged: true
      })
    ]) {
      const f = yield* makeFixture
      const commands = {
        ...f.commands,
        execute: (_root: string, args: ReadonlyArray<string>) =>
          args.includes("hook") ? Effect.succeed(payload) : f.commands.execute(_root, args)
      }
      yield* Effect.flip(makeTracker(f.config, commands).claim().pipe(Effect.provide(NodeServices.layer)))
      expect(f.paths.size).toBe(0)
    }
  })
)
it.effect("ambiguous fact mutation reads the exact task before any repeated CAS", () =>
  Effect.gen(function* () {
    for (const applied of [true, false]) {
      const f = yield* makeFixture
      let calls = 0
      const commands = {
        ...f.commands,
        execute: (_root: string, args: ReadonlyArray<string>) =>
          Effect.gen(function* () {
            if (args.includes("metadata-cas")) {
              calls++
              if (applied) yield* f.commands.execute(_root, args)
              return yield* new CommandRejected({ message: "response lost", receipt: "test-receipt" })
            }
            return yield* f.commands.execute(_root, args)
          })
      }
      const tracker = makeTracker(f.config, commands)
      const operation = tracker
        .record(BeadId.make("work"), "test", { exact: "value" })
        .pipe(Effect.provide(NodeServices.layer))
      if (applied) {
        yield* operation
        yield* operation
      } else expect(String(yield* Effect.flip(operation))).toContain("response lost")
      expect(calls).toBe(1)
    }
  })
)
it.effect("unknown, duplicate, stale and malformed observations preserve the task", () =>
  Effect.gen(function* () {
    for (const payload of [
      "[]",
      "{}",
      JSON.stringify([{ id: "work", status: "unknown" }]),
      JSON.stringify([{ id: "work", status: "open", _cache_age_s: 1 }]),
      JSON.stringify([
        { id: "work", status: "open" },
        { id: "work", status: "open" }
      ])
    ]) {
      const f = yield* makeFixture
      const commands = {
        ...f.commands,
        execute: (_root: string, args: ReadonlyArray<string>) =>
          args.includes("ready")
            ? Effect.succeed(args.includes("open") ? payload : "[]")
            : f.commands.execute(_root, args)
      }
      yield* Effect.flip(
        makeTracker(f.config, commands).bead(BeadId.make("work")).pipe(Effect.provide(NodeServices.layer))
      )
      expect(f.state.modelCalls).toBe(0)
    }
  })
)
it.effect("foreign scope, claims, instructions and unresolved dependencies fail before resource effects", () =>
  Effect.gen(function* () {
    for (const mode of [
      "city",
      "malformed-city",
      "rig",
      "claim",
      "task",
      "blocked",
      "instructions",
      "dependency",
      "foreign-dependency",
      "unsupported-dependency"
    ]) {
      const f = yield* makeFixture
      const row = f.rows.get("work")
      if (!row) throw new Error("fixture")
      if (mode === "claim") row.assignee = "foreign-session"
      if (mode === "task") delete row.metadata["dalph.task"]
      if (mode === "blocked") row.status = "blocked"
      if (mode === "instructions") delete row.description
      const dependency = {
        issue_id: mode === "foreign-dependency" ? "other" : "work",
        depends_on_id: "delivery",
        type: mode === "unsupported-dependency" ? "unknown" : "blocks"
      }
      const commands = {
        ...f.commands,
        execute: (_root: string, args: ReadonlyArray<string>) =>
          Effect.gen(function* () {
            if (args.includes("config") && mode === "malformed-city") return "["
            if (args.includes("config") && mode === "city") return '[workspace]\nname="foreign"\nrigs=[]'
            if (args.includes("config") && mode === "rig")
              return '[workspace]\nname="trial"\n[[rigs]]\nname="fixture"\npath="/foreign"'
            if (args.includes("ready") && mode.includes("dependency")) {
              const text = yield* f.commands.execute(_root, args)
              return text.replace('"description":', `"dependencies":[${JSON.stringify(dependency)}],"description":`)
            }
            return yield* f.commands.execute(_root, args)
          })
      }
      const tracker = makeTracker(f.config, commands)
      yield* Effect.flip(
        makeWorkflow(f.config, commands, tracker, f.git, f.stages, f.worktrees)
          .run("worker")
          .pipe(
            Effect.provideService(FileSystem.FileSystem, f.fs),
            Effect.provideService(HttpClient.HttpClient, f.http)
          )
      )
      expect(f.paths.size).toBe(0)
      expect(f.state.modelCalls).toBe(0)
    }
  })
)
it.effect("native dependency declarations must be complete, unique and supported", () =>
  Effect.gen(function* () {
    const f = yield* makeFixture
    const original = yield* Schema.decodeUnknownEffect(Bead)(f.rows.get("work"))
    for (const needs of [["delivery"], ["delivery", "delivery"], ["work"]]) {
      const current = yield* Schema.decodeUnknownEffect(Bead)({
        ...original,
        needs,
        metadata: { ...original.metadata, "gc.native_step_dependencies.v1": JSON.stringify(needs.map(() => "step")) }
      })
      if (needs.length === 1 && needs[0] === "delivery") yield* verifyDependencies(current)
      else yield* Effect.flip(verifyDependencies(current))
    }
    yield* Effect.flip(
      verifyDependencies({
        ...original,
        metadata: { ...original.metadata, "gc.native_step_dependencies.v1": '["step"]' }
      }).pipe(Effect.provide(NodeServices.layer))
    )
    const repeatedRefs = yield* Schema.decodeUnknownEffect(Bead)({
      ...original,
      needs: ["delivery", "another"],
      metadata: { ...original.metadata, "gc.native_step_dependencies.v1": '["step","step"]' }
    })
    yield* Effect.flip(verifyDependencies(repeatedRefs))
    const nativeEdges = yield* Schema.decodeUnknownEffect(Bead)({
      ...original,
      metadata: { ...original.metadata, "gc.native_step_dependencies.v1": '["step"]' },
      dependencies: [
        { issue_id: "work", depends_on_id: "delivery", type: "blocks" },
        { issue_id: "work", depends_on_id: "root", type: "tracks" }
      ]
    })
    yield* verifyDependencies(nativeEdges)
    yield* Effect.flip(observePrerequisites(nativeEdges, f.tracker.bead).pipe(Effect.provide(NodeServices.layer)))
    const parent = yield* Schema.decodeUnknownEffect(Bead)({
      ...original,
      dependencies: [{ issue_id: "work", depends_on_id: "delivery", type: "parent-child" }]
    })
    yield* verifyDependencies(parent)
    yield* observePrerequisites(parent, f.tracker.bead).pipe(Effect.provide(NodeServices.layer))
    const closed = f.rows.get("delivery")
    if (!closed) throw new Error("fixture")
    closed.status = "closed"
    const blocked = yield* Schema.decodeUnknownEffect(Bead)({
      ...original,
      needs: ["delivery"],
      dependencies: [{ issue_id: "work", depends_on_id: "delivery", type: "blocks" }]
    })
    yield* observePrerequisites(blocked, f.tracker.bead).pipe(Effect.provide(NodeServices.layer))
  })
)
it.effect("all native identity comparisons reject missing or contradictory scope", () =>
  Effect.gen(function* () {
    const f = yield* makeFixture
    expect(
      cityScopeMatches(f.config, { workspace: { name: "foreign" }, rigs: [{ name: "fixture", path: f.config.repo }] })
    ).toBe(false)
    expect(
      cityScopeMatches(f.config, { workspace: { name: "trial" }, rigs: [{ name: "other", path: f.config.repo }] })
    ).toBe(false)
    expect(
      cityScopeMatches(f.config, {
        workspace: { name: "trial" },
        rigs: [
          { name: "fixture", path: f.config.repo },
          { name: "fixture", path: f.config.repo }
        ]
      })
    ).toBe(false)
    expect(implementationIdentityMatches(undefined, undefined)).toBe(false)
    expect(implementationIdentityMatches({ "dalph.task": "task" }, {})).toBe(false)
    expect(implementationIdentityMatches({ "dalph.task": "task", "gc.root_bead_id": "root" }, undefined)).toBe(false)
    expect(
      claimOwnershipMatches("expected", { route: "foreign", assignee: "a" }, { routedTo: "expected", assignee: "a" })
    ).toBe(false)
    expect(
      claimOwnershipMatches("expected", { route: "expected", assignee: "a" }, { routedTo: "foreign", assignee: "a" })
    ).toBe(false)
    const row = f.rows.get("work")
    if (!row) throw new Error("fixture")
    delete row.metadata["gc.root_store_ref"]
    yield* Effect.flip(f.tracker.bead(row.id).pipe(Effect.provide(NodeServices.layer)))
    const claim = {
      schema_version: "1",
      ok: true,
      command: "hook",
      action: "work",
      reason: "claimed",
      bead_id: row.id,
      assignee: "fixture-session",
      route: "fixture/dalph.worker"
    } as const
    const current = yield* Schema.decodeUnknownEffect(Bead)(row)
    yield* Effect.flip(verifyClaim(f.config, claim, current, "worker"))
    yield* Effect.flip(verifyClaim(f.config, { ...claim, root_bead_id: BeadId.make("foreign") }, current, "worker"))
    yield* verifyClaim(
      f.config,
      { ...claim, root_bead_id: BeadId.make("root") },
      { ...current, metadata: { ...current.metadata, "gc.root_store_ref": "rig:fixture" } },
      "worker"
    )
  })
)
it.effect("an observed close is idempotent and does not issue another mutation", () =>
  Effect.gen(function* () {
    const f = yield* makeFixture
    const close = f.tracker
      .close(BeadId.make("work"), "exact reason")
      .pipe(Effect.provideService(FileSystem.FileSystem, f.fs), Effect.provideService(HttpClient.HttpClient, f.http))
    yield* close
    yield* close
    expect(f.rows.get("work")?.status).toBe("closed")
  })
)
it.effect("delivery re-reads its exact implementation and refuses changed lifecycle or identity", () =>
  Effect.gen(function* () {
    for (const mode of ["reopened", "changed-task"]) {
      const f = yield* makeFixture
      yield* f
        .workflow()
        .run("worker")
        .pipe(Effect.provideService(FileSystem.FileSystem, f.fs), Effect.provideService(HttpClient.HttpClient, f.http))
      f.state.role = "integrator"
      let closedReads = 0
      const commands = {
        ...f.commands,
        execute: (_root: string, args: ReadonlyArray<string>) =>
          Effect.gen(function* () {
            const text = yield* f.commands.execute(_root, args)
            if (args.includes("ready") && args.includes("closed")) closedReads++
            if (closedReads === 2 && args.includes("ready") && args.includes("closed")) {
              const row = f.rows.get("work")
              if (!row) throw new Error("fixture")
              if (mode === "reopened") row.status = "open"
              else row.metadata["dalph.task"] = "foreign-task"
            }
            return text
          })
      }
      const tracker = makeTracker(f.config, commands)
      const failure = yield* Effect.flip(
        makeWorkflow(f.config, commands, tracker, f.git, f.stages, f.worktrees)
          .run("integrator")
          .pipe(
            Effect.provideService(FileSystem.FileSystem, f.fs),
            Effect.provideService(HttpClient.HttpClient, f.http)
          )
      )
      expect(String(failure)).toContain("implementation")
      expect(f.state.pushCalls).toBe(0)
    }
  })
)

it.effect("applied native facts never release unknown writer custody", () =>
  Effect.gen(function* () {
    const f = yield* makeFixture
    const commands = {
      ...f.commands,
      execute: (_root: string, args: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const response = yield* f.commands.execute(_root, args)
          if (args.includes("metadata-cas")) return yield* new BoundaryFailure({ message: "writer custody unknown" })
          return response
        })
    }
    const failure = yield* Effect.flip(
      makeTracker(f.config, commands)
        .record(BeadId.make("work"), "guard", { applied: true })
        .pipe(Effect.provide(NodeServices.layer))
    )
    expect(String(failure)).toContain("writer custody unknown")
    expect(f.rows.get("work")?.metadata["dalph.guard"]).toBe('{"applied":true}')
    expect(f.state.modelCalls).toBe(0)
  })
)

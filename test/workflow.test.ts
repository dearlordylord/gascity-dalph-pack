import { Effect, FileSystem, Layer, Schema, Option } from "effect"
import { expect, it } from "@effect/vitest"
import * as HttpClient from "effect/http/HttpClient"
import { BeadId, CommitSha } from "../src/domain/shared.ts"
import { Plan } from "../src/domain/attempt.ts"
import { RuntimeConfig } from "../src/delivery/config.ts"
import { NodeServices } from "@effect/platform-node"
import { CommandRejected } from "../src/delivery/command.ts"
import { makeWorktrees } from "../src/delivery/worktrees.ts"
import { makeStages } from "../src/delivery/stages.ts"
import { makeFixture, CANDIDATE, RESULT } from "./helpers/workflow-fixture.ts"

type Fixture = Effect.Success<typeof makeFixture>
const turn = (fixture: Fixture, role: "worker" | "integrator", faultAfterPush?: string) => {
  fixture.state.role = role
  return fixture
    .workflow(faultAfterPush ? { faultAfterPush } : {})
    .run(role)
    .pipe(
      Effect.provide(
        Layer.merge(
          Layer.succeed(FileSystem.FileSystem, fixture.fs),
          Layer.succeed(HttpClient.HttpClient, fixture.http)
        )
      )
    )
}
it.effect("delivers one admitted task through qualification, publication, promotion and cleanup before closure", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    yield* turn(fixture, "worker")
    expect(fixture.rows.get("work")?.status).toBe("closed")
    expect(fixture.rows.get("delivery")?.status).toBe("open")
    expect(fixture.state.workHead).toBe(RESULT)
    const intent = yield* fixture.tracker
      .fact(BeadId.make("work"), "model_intent", Schema.Struct({ command: Schema.Array(Schema.String) }))
      .pipe(Effect.provideService(FileSystem.FileSystem, fixture.fs))
    expect(intent?.command).toEqual([
      "codex",
      "exec",
      "-C",
      expect.any(String),
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
      expect.any(String)
    ])
    yield* turn(fixture, "integrator")
    expect(fixture.state.local).toBe(CANDIDATE)
    expect(fixture.state.remote).toBe(CANDIDATE)
    expect(fixture.rows.get("delivery")?.status).toBe("closed")
    expect(fixture.paths.size).toBe(0)
    expect(fixture.branches.size).toBe(0)
    expect(fixture.state.modelCalls).toBe(1)
    expect(fixture.state.cleanupCalls).toBe(2)
  })
)
it.effect("recovers ambiguous publication using the retained candidate without another push or model", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    yield* turn(fixture, "worker")
    const failed = yield* Effect.flip(turn(fixture, "integrator", "delivery"))
    expect(String(failed)).toContain("injected loss")
    expect(fixture.rows.get("delivery")?.status).toBe("open")
    expect(fixture.state.pushCalls).toBe(1)
    yield* turn(fixture, "integrator")
    expect(fixture.state.pushCalls).toBe(1)
    expect(fixture.state.modelCalls).toBe(1)
    expect(fixture.rows.get("delivery")?.status).toBe("closed")
  })
)
it.effect("lost prepared worktree is retained as an unfinished attempt", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    fixture.state.modelExit = 7
    yield* Effect.flip(turn(fixture, "worker"))
    fixture.paths.clear()
    expect(String(yield* Effect.flip(turn(fixture, "worker")))).toContain("lost")
    expect(fixture.state.modelCalls).toBe(1)
  })
)
it.effect("exhausts model retries on the same plan and preserves every prior outcome", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    fixture.state.modelExit = 7
    for (const ordinal of [1, 2, 3]) {
      yield* Effect.flip(turn(fixture, "worker"))
      expect(fixture.state.modelCalls).toBe(ordinal)
    }
    expect(String(yield* Effect.flip(turn(fixture, "worker")))).toContain("budget exhausted")
    expect(fixture.rows.get("work")?.status).toBe("open")
  })
)
it.effect("a failed qualification cannot be retried by another ordinary turn", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    fixture.state.qualificationExit = 5
    yield* Effect.flip(turn(fixture, "worker"))
    expect(String(yield* Effect.flip(turn(fixture, "worker")))).toContain("diagnose")
    expect(fixture.state.qualificationCalls).toBe(1)
  })
)
it.effect("refuses uncommitted, unchanged and qualification-mutated implementation trees", () =>
  Effect.gen(function* () {
    for (const field of ["dirty", "noCommit", "stageMovesHead"] as const) {
      const fixture = yield* makeFixture
      fixture.state[field] = true
      yield* Effect.flip(turn(fixture, "worker"))
      expect(fixture.rows.get("work")?.status).toBe("open")
    }
  })
)
it.effect("refuses a claim from another phase and missing implementation instructions", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    const work = fixture.rows.get("work")
    if (!work) throw new Error("fixture setup")
    work.metadata["dalph.phase"] = "deliver"
    expect(String(yield* Effect.flip(turn(fixture, "worker")))).toContain("different workflow phase")
    work.metadata["dalph.phase"] = "work"
    delete work.description
    expect(String(yield* Effect.flip(turn(fixture, "worker")))).toContain("instructions")
  })
)
it.effect("tracker CAS acknowledgement is required before worktree effects", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    fixture.state.casAcknowledged = false
    expect(String(yield* Effect.flip(turn(fixture, "worker")))).toContain("not acknowledged")
    expect(fixture.paths.size).toBe(0)
  })
)
it.effect("ambiguous close is reconciled against the native tracker, without blindly repeating mutation", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    fixture.state.closeFails = true
    fixture.state.closeAmbiguous = true
    yield* turn(fixture, "worker")
    expect(fixture.rows.get("work")?.status).toBe("closed")
  })
)
it.effect("an unobserved close remains a failure", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    fixture.state.closeFails = true
    yield* Effect.flip(turn(fixture, "worker"))
    expect(fixture.rows.get("work")?.status).toBe("open")
  })
)
it.effect("invalid merge parents and duplicate implementation identity cannot publish", () =>
  Effect.gen(function* () {
    for (const field of ["parents", "duplicateSource"] as const) {
      const fixture = yield* makeFixture
      yield* turn(fixture, "worker")
      if (field === "parents") fixture.state.parents = RESULT
      else fixture.state.duplicateSource = true
      yield* Effect.flip(turn(fixture, "integrator"))
      expect(fixture.state.pushCalls).toBe(0)
    }
  })
)
it.effect("cleanup refusal retains the delivery blocker after publication", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    yield* turn(fixture, "worker")
    fixture.state.cleanupPending = true
    expect(String(yield* Effect.flip(turn(fixture, "integrator")))).toContain("cleanup refused")
    expect(fixture.rows.get("delivery")?.status).toBe("open")
    fixture.state.cleanupPending = false
    yield* turn(fixture, "integrator")
    expect(fixture.rows.get("delivery")?.status).toBe("closed")
  })
)
it.effect("changed branch ownership and wrong target checkout preserve unfinished delivery", () =>
  Effect.gen(function* () {
    for (const field of ["branchMoved", "wrongBranch"] as const) {
      const fixture = yield* makeFixture
      yield* turn(fixture, "worker")
      fixture.state[field] = true
      yield* Effect.flip(turn(fixture, "integrator"))
      expect(fixture.rows.get("delivery")?.status).toBe("open")
    }
  })
)
it.effect("contradictory durable facts are refused", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    yield* turn(fixture, "worker")
    const failed = yield* Effect.flip(
      fixture.tracker
        .record(BeadId.make("work"), "result", { commit: CANDIDATE })
        .pipe(Effect.provideService(FileSystem.FileSystem, fixture.fs))
    )
    expect(String(failed)).toContain("contradictory durable fact")
  })
)
it.effect("reuses exact successful stage receipts without another child or another close", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    yield* turn(fixture, "worker")
    yield* turn(fixture, "worker")
    expect(fixture.state.modelCalls).toBe(1)
    expect(fixture.state.qualificationCalls).toBe(1)
  })
)
it.effect("unknown model exit is reconciled before the next finite ordinal", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    fixture.state.unknownModelExit = true
    yield* Effect.flip(turn(fixture, "worker"))
    fixture.state.unknownModelExit = false
    yield* turn(fixture, "worker")
    expect(fixture.rows.get("work")?.metadata["dalph.model_reconciled"]).toContain("stopped_without_receipt")
    expect(fixture.state.modelCalls).toBe(2)
  })
)
it.effect("reads the optional project contract through the filesystem boundary", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    const config = yield* Schema.decodeUnknownEffect(RuntimeConfig)({
      ...fixture.config,
      contract: "/fixture/contract.md"
    })
    yield* fixture
      .workflow(config)
      .run("worker")
      .pipe(
        Effect.provide(
          Layer.merge(
            Layer.succeed(FileSystem.FileSystem, fixture.fs),
            Layer.succeed(HttpClient.HttpClient, fixture.http)
          )
        )
      )
    expect(fixture.events.find((event) => event.startsWith("codex"))).toContain("fixture contract")
  })
)
it.effect("refuses a missing tracker identity, missing accepted result and an unknown claim", () =>
  Effect.gen(function* () {
    for (const field of ["dalph.task", "gc.root_bead_id", "dalph.result", "claim"]) {
      const fixture = yield* makeFixture
      yield* turn(fixture, "worker")
      const row = fixture.rows.get(field === "dalph.result" ? "work" : "delivery")
      if (!row) throw new Error("fixture setup")
      delete row.metadata[field]
      if (field === "claim") fixture.state.wrongClaim = true
      yield* Effect.flip(turn(fixture, "integrator"))
      expect(fixture.state.pushCalls).toBe(0)
    }
  })
)
it.effect("native completion acknowledgement must be observed, even after an HTTP success", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    fixture.state.closeAcknowledged = false
    expect(String(yield* Effect.flip(turn(fixture, "worker")))).toContain("completion not observed")
  })
)
it.effect("retained provisioning identity and planned Base cannot silently change", () =>
  Effect.gen(function* () {
    for (const field of ["base", "provenance"]) {
      const fixture = yield* makeFixture
      fixture.state.modelExit = 7
      yield* Effect.flip(turn(fixture, "worker"))
      if (field === "base") {
        const row = fixture.rows.get("work")
        if (!row) throw new Error("fixture setup")
        delete row.metadata["dalph.work_prepared"]
        fixture.paths.clear()
        fixture.state.remote = CANDIDATE
      } else fixture.state.nativeAttempt = "different-native-attempt"
      const failure = yield* Effect.flip(turn(fixture, "worker"))
      expect(String(failure)).toContain(field === "base" ? "Base no longer matches" : "provisioning attempt changed")
      expect(fixture.state.modelCalls).toBe(1)
    }
  })
)
it.effect("cleanup requires the exact plan and a retained qualification boundary", () =>
  Effect.gen(function* () {
    for (const field of ["dalph.work_plan", "dalph.work_prepared", "dalph.model_intent"]) {
      const fixture = yield* makeFixture
      yield* turn(fixture, "worker")
      const row = fixture.rows.get("work")
      if (!row) throw new Error("fixture setup")
      delete row.metadata[field]
      if (field === "dalph.model_intent") delete row.metadata["dalph.qualification_intent"]
      yield* Effect.flip(turn(fixture, "integrator"))
      expect(fixture.rows.get("delivery")?.status).toBe("open")
    }
  })
)
it.effect("cleanup resumes after branch deletion without deleting another branch", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    yield* turn(fixture, "worker")
    fixture.branches.clear()
    yield* turn(fixture, "integrator")
    expect(fixture.rows.get("delivery")?.status).toBe("closed")
  })
)
it.effect("an interrupted candidate construction verifies its existing merge before accepting it", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    yield* turn(fixture, "worker")
    fixture.state.qualificationExit = 5
    yield* Effect.flip(turn(fixture, "integrator"))
    yield* Effect.flip(turn(fixture, "integrator"))
    expect(fixture.events.filter((event) => event.includes("merge --no-ff"))).toHaveLength(1)
  })
)
it.effect("a retained candidate without its plan remains blocked", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    yield* turn(fixture, "worker")
    yield* Effect.flip(turn(fixture, "integrator", "delivery"))
    const row = fixture.rows.get("delivery")
    if (!row) throw new Error("fixture setup")
    delete row.metadata["dalph.candidate_plan"]
    expect(String(yield* Effect.flip(turn(fixture, "integrator")))).toContain("no retained plan")
  })
)
it.effect("qualification refuses dirty content even when HEAD stayed fixed", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    yield* turn(fixture, "worker")
    const row = fixture.rows.get("work")
    if (!row) throw new Error("fixture setup")
    const plan = yield* fixture.tracker
      .fact(row.id, "work_plan", Plan)
      .pipe(Effect.provideService(FileSystem.FileSystem, fixture.fs))
    if (!plan) throw new Error("fixture plan")
    fixture.state.dirty = true
    const failure = yield* Effect.flip(
      fixture.stages
        .qualifiedTree(plan, CommitSha.make(RESULT))
        .pipe(Effect.provideService(FileSystem.FileSystem, fixture.fs))
    )
    expect(String(failure)).toContain("tree differs")
  })
)
it.effect("a lost publication plan and dirty target checkout keep delivery open", () =>
  Effect.gen(function* () {
    for (const field of ["losePlanOnPushIntent", "targetDirty"] as const) {
      const fixture = yield* makeFixture
      yield* turn(fixture, "worker")
      fixture.state[field] = true
      const failure = yield* Effect.flip(turn(fixture, "integrator"))
      expect(String(failure)).toContain(field === "targetDirty" ? "target checkout dirty" : "lost its exact plan")
      expect(fixture.rows.get("delivery")?.status).toBe("open")
    }
  })
)
it.effect("a branch lookup failure is not treated as an already absent branch", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    yield* turn(fixture, "worker")
    fixture.state.cleanupPending = true
    yield* Effect.flip(turn(fixture, "integrator"))
    fixture.state.cleanupPending = false
    const git = {
      ...fixture.git,
      git: (args: ReadonlyArray<string>, cwd?: typeof fixture.config.repo) =>
        args[0] === "show-ref"
          ? Effect.fail(
              new CommandRejected({ message: "ref database unreadable", receipt: "/fixture/ref.json", exit: 2 })
            )
          : fixture.git.git(args, cwd)
    }
    const worktrees = makeWorktrees(fixture.config, fixture.commands, fixture.tracker, git)
    const failure = yield* Effect.flip(
      worktrees
        .cleanup(BeadId.make("delivery"), BeadId.make("work"), "work")
        .pipe(Effect.provideService(FileSystem.FileSystem, fixture.fs))
    )
    expect(String(failure)).toContain("ref database unreadable")
    expect(fixture.branches.has("dalph/work/work")).toBe(true)
  })
)
it.live("stage success cannot accept a still-live marked writer", () =>
  Effect.gen(function* () {
    const fixture = yield* makeFixture
    yield* turn(fixture, "worker")
    const row = fixture.rows.get("work")
    if (!row) throw new Error("fixture setup")
    const plan = yield* fixture.tracker
      .fact(row.id, "work_plan", Plan)
      .pipe(Effect.provideService(FileSystem.FileSystem, fixture.fs))
    if (!plan) throw new Error("fixture plan")
    delete row.metadata["dalph.model_finished"]
    const nativeFs = yield* FileSystem.FileSystem
    const info = yield* nativeFs.stat("/proc/self")
    let active = false
    const fs = FileSystem.makeNoop({
      readDirectory: () => Effect.succeed(active ? ["4242"] : []),
      stat: () => Effect.succeed(info),
      readFileString: (path) =>
        Effect.succeed(
          path.endsWith("stat")
            ? `4242 (fixture) ${["R", ...Array(18).fill("0"), "100"].join(" ")}`
            : `DALPH_ATTEMPT=${plan.attempt}\0`
        ),
      makeDirectory: () => Effect.void
    })
    const commands = {
      ...fixture.commands,
      owner: Option.getOrThrow(info.uid),
      execute: () =>
        Effect.sync(() => {
          active = true
          return ""
        })
    }
    const stages = makeStages(fixture.config, commands, fixture.tracker, fixture.git)
    const failure = yield* Effect.flip(
      stages.model(row.id, plan, "fixture prompt").pipe(Effect.provideService(FileSystem.FileSystem, fs))
    )
    expect(String(failure)).toContain("did not stop all marked writers")
    expect(row.metadata).not.toHaveProperty("dalph.model_2_finished")
  }).pipe(Effect.provide(NodeServices.layer))
)

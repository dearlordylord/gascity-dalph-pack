import { Effect, FileSystem, Ref, Schema } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpResponse from "effect/http/HttpClientResponse"
import { RuntimeConfig } from "../../src/delivery/config.ts"
import { CommandRejected } from "../../src/delivery/command.ts"
import type { AttemptId } from "../../src/domain/shared.ts"
import { BeadId, BirthTicks, BoundaryFailure } from "../../src/domain/shared.ts"
import { makeTracker } from "../../src/delivery/tracker.ts"
import { makeWorktrees } from "../../src/delivery/worktrees.ts"
import { makeStages } from "../../src/delivery/stages.ts"
import { makeWorkflow } from "../../src/delivery/workflow.ts"
import type { Commands } from "../../src/delivery/tracker.ts"
import type { Git } from "../../src/delivery/git.ts"

export const BASE = "a".repeat(40)
export const RESULT = "b".repeat(40)
export const CANDIDATE = "c".repeat(40)
export const makeFixture = Effect.gen(function* () {
  const config = yield* Schema.decodeUnknownEffect(RuntimeConfig)({
    root: "/fixture",
    pack: "/fixture/pack",
    city: "/fixture/city",
    repo: "/fixture/repo",
    worktrees: "/fixture/worktrees",
    cityName: "trial",
    rig: "fixture",
    endpoint: "http://127.0.0.1:8372",
    branch: "master"
  })
  const rows = new Map<string, { id: BeadId; status: string; description?: string; metadata: Record<string, string> }>()
  for (const [id, phase] of [
    ["work", "work"],
    ["delivery", "deliver"]
  ]) {
    rows.set(String(id), {
      id: BeadId.make(String(id)),
      status: "open",
      description: "Implement assigned behavior",
      metadata: { "dalph.task": "task", "dalph.phase": String(phase), "gc.root_bead_id": "root" }
    })
  }
  const state = {
    role: "worker",
    remote: BASE,
    local: BASE,
    workHead: BASE,
    candidateHead: BASE,
    dirty: false,
    targetDirty: false,
    losePlanOnPushIntent: false,
    parents: `${BASE} ${RESULT}`,
    wrongBranch: false,
    noCommit: false,
    qualificationExit: 0,
    modelExit: 0,
    stageMovesHead: false,
    casAcknowledged: true,
    cleanupPending: false,
    branchMoved: false,
    duplicateSource: false,
    wrongClaim: false,
    closeFails: false,
    closeAmbiguous: false,
    closeAcknowledged: true,
    nativeAttempt: "native-attempt",
    unknownModelExit: false,
    modelCalls: 0,
    qualificationCalls: 0,
    pushCalls: 0,
    cleanupCalls: 0
  }
  const paths = new Set<string>()
  const branches = new Map<string, string>()
  const events: string[] = []
  const current = yield* Ref.make<AttemptId | null>(null)
  const native = Effect.fn("Fixture.native")(function* (args: ReadonlyArray<string>, cwd?: string) {
    events.push(args.join(" "))
    if (args[0] === "bd") {
      const row = rows.get(String(args[4]))
      return JSON.stringify(row ? [row] : [])
    }
    if (args.includes("metadata-cas")) {
      const id = args[args.indexOf("metadata-cas") + 1]
      const key = args.find((arg) => arg.startsWith("--key="))?.slice("--key=".length)
      const value = args.find((arg) => arg.startsWith("--next="))?.slice("--next=".length)
      const row = rows.get(String(id))
      if (row && key && value && state.casAcknowledged) row.metadata[key] = value
      if (row && key === "dalph.push_intent" && state.losePlanOnPushIntent) delete row.metadata["dalph.candidate_plan"]
      return "{}"
    }
    if (args.includes("hook"))
      return JSON.stringify({
        action: "work",
        bead_id: state.wrongClaim ? "unknown" : state.role === "worker" ? "work" : "delivery"
      })
    if (args.includes("ready")) {
      const source = rows.get("work")
      const closed = source?.status === "closed" ? [source] : []
      return JSON.stringify(state.duplicateSource ? [...closed, ...closed] : closed)
    }
    if (args[0] === "gc" && args[1] === "worktree") {
      const path = args[args.indexOf("--path") + 1] ?? ""
      const branch = args[args.indexOf("--branch") + 1] ?? ""
      if (args[2] === "cleanup") {
        state.cleanupCalls++
        if (!state.cleanupPending) paths.delete(path)
        return JSON.stringify({ cleanup_pending: state.cleanupPending })
      }
      if (args[2] === "ensure") {
        paths.add(path)
        branches.set(branch, BASE)
      }
      return JSON.stringify({ provenance: { attempt_id: state.nativeAttempt } })
    }
    if (args[0] === "codex") {
      state.modelCalls++
      if (state.unknownModelExit)
        return yield* new CommandRejected({ message: "missing exit", receipt: "/fixture/model.json" })
      if (state.modelExit)
        return yield* new CommandRejected({
          message: "model failed",
          receipt: "/fixture/model.json",
          exit: state.modelExit
        })
      if (!state.noCommit) {
        state.workHead = RESULT
        branches.set("dalph/work/work", RESULT)
      }
      return "model receipt"
    }
    if (args[0] === "mise") {
      state.qualificationCalls++
      if (state.qualificationExit)
        return yield* new CommandRejected({
          message: "qualification failed",
          receipt: "/fixture/qualification.json",
          exit: state.qualificationExit
        })
      if (state.stageMovesHead) state.workHead = CANDIDATE
      return "qualification passed"
    }
    return yield* new BoundaryFailure({ message: `Unexpected fixture command: ${args.join(" ")} ${cwd ?? ""}` })
  })
  const commands: Commands = {
    execute: (_root, args, cwd) => native(args, cwd),
    reconcile: () => Effect.void,
    current,
    birth: Effect.succeed(BirthTicks.make(1)),
    owner: 0
  }
  const gitCall = Effect.fn("Fixture.git")(function* (args: ReadonlyArray<string>, cwd = config.repo) {
    events.push(`git ${args.join(" ")}`)
    if (args[0] === "fetch") return ""
    if (args[0] === "status") return state.dirty || (cwd === config.repo && state.targetDirty) ? " M owned.ts" : ""
    if (args[0] === "symbolic-ref") return state.wrongBranch ? "refs/heads/other" : "refs/heads/master"
    if (args[0] === "remote") return "/fixture/remote.git"
    if (args[0] === "show") return state.parents
    if (args[0] === "show-ref") {
      if (branches.has(String(args.at(-1)).replace("refs/heads/", ""))) return ""
      return yield* new CommandRejected({ message: "absent", receipt: "/fixture/git.json", exit: 1 })
    }
    if (args[0] === "update-ref") {
      branches.delete(String(args[2]).replace("refs/heads/", ""))
      return ""
    }
    if (args[0] === "merge-base") return ""
    if (args[0] === "push") {
      state.pushCalls++
      state.remote = CANDIDATE
      return ""
    }
    if (args.includes("merge")) {
      if (cwd === config.repo) state.local = CANDIDATE
      else {
        state.candidateHead = CANDIDATE
        branches.set("dalph/candidate/delivery", CANDIDATE)
      }
      return ""
    }
    if (args[0] === "rev-parse") {
      const ref = args.at(-1)
      if (ref === "HEAD")
        return cwd === config.repo ? state.local : cwd.includes("candidate") ? state.candidateHead : state.workHead
      if (ref === "refs/remotes/origin/master") return state.remote
      if (ref === "refs/heads/master") return state.local
      const branch = String(ref).replace("refs/heads/", "")
      const tip = branches.get(branch)
      if (tip) return state.branchMoved ? BASE : tip
    }
    return yield* new BoundaryFailure({ message: `Unexpected fixture Git operation: ${args.join(" ")}` })
  })
  const git: Git = {
    git: gitCall,
    guarded: (operation) => Effect.scoped(operation),
    target: "refs/heads/master",
    remote: "refs/remotes/origin/master"
  }
  const fs = FileSystem.makeNoop({
    exists: (path) => Effect.succeed(paths.has(path)),
    readDirectory: () => Effect.succeed([]),
    makeDirectory: () => Effect.void,
    readFileString: () => Effect.succeed("fixture contract")
  })
  const http = HttpClient.make((request) =>
    Effect.sync(() => {
      const id = decodeURIComponent(request.url.split("/").at(-2) ?? "")
      const row = rows.get(id)
      if (row && state.closeAcknowledged && (!state.closeFails || state.closeAmbiguous)) row.status = "closed"
      const status = state.closeFails ? 503 : 200
      return HttpResponse.fromWeb(request, new Response(JSON.stringify({ status: "closed" }), { status }))
    })
  )
  const tracker = makeTracker(config, commands)
  const worktrees = makeWorktrees(config, commands, tracker, git)
  const stages = makeStages(config, commands, tracker, git)
  const workflow = (overrides: Partial<RuntimeConfig> = {}) =>
    makeWorkflow({ ...config, ...overrides }, commands, tracker, git, stages, worktrees)
  return { branches, commands, config, events, fs, git, http, paths, rows, stages, state, tracker, workflow, worktrees }
})

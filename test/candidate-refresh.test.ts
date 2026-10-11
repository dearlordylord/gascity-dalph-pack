import { Effect, FileSystem, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { candidateKey, refreshCandidate, retainedCandidate } from "../src/delivery/candidate-refresh.ts"
import { Candidate, Plan, Result } from "../src/domain/attempt.ts"
import { BeadId, CommitSha } from "../src/domain/shared.ts"
import { BASE, CANDIDATE, makeFixture, RESULT } from "./helpers/workflow-fixture.ts"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { CommandRejected } from "../src/delivery/command.ts"

const ADVANCED = CommitSha.make("d".repeat(40))
const REFRESHED = CommitSha.make("e".repeat(40))
const id = BeadId.make("delivery")
const qualification = {
  commit: CommitSha.make(CANDIDATE),
  exit: 0,
  logfile: Plan.fields.path.make("/fixture/check.log")
}
const prior = Candidate.make({
  commit: CommitSha.make(CANDIDATE),
  head: CommitSha.make(BASE),
  result: CommitSha.make(RESULT),
  tests: qualification
})

it.effect("refresh retains immutable implementation, requalifies integration and resumes the exact merge", () =>
  Effect.gen(function* () {
    for (const resumed of [false, true]) {
      const f = yield* makeFixture
      yield* Effect.gen(function* () {
        const plan = yield* f.worktrees.prepare(id, "candidate", CommitSha.make(BASE))
        const result = Result.make({
          commit: prior.result,
          attempt: plan.attempt,
          tests: { ...qualification, commit: prior.result }
        })
        f.state.candidateHead = resumed ? REFRESHED : CANDIDATE
        const calls: ReadonlyArray<string>[] = []
        const git = {
          ...f.git,
          git: (args: ReadonlyArray<string>, cwd?: Plan["path"]) => {
            calls.push(args)
            if (args[0] === "show") return Effect.succeed(`${CANDIDATE} ${ADVANCED}`)
            if (args.includes("merge")) {
              f.state.candidateHead = REFRESHED
              return Effect.succeed("")
            }
            return f.git.git(args, cwd)
          }
        }
        const refreshed = yield* refreshCandidate(f.tracker, git, f.stages, id, prior, result, ADVANCED, 1)
        expect(refreshed.result).toBe(prior.result)
        expect(refreshed.head).toBe(ADVANCED)
        expect(refreshed.tests.commit).toBe(REFRESHED)
        expect(f.state.modelCalls).toBe(0)
        expect(f.state.qualificationCalls).toBe(1)
        expect(calls.filter((args) => args.includes("merge"))).toHaveLength(resumed ? 0 : 1)
        yield* f.tracker.record(id, "candidate", prior)
        const second = { ...refreshed, commit: CommitSha.make("f".repeat(40)) }
        yield* f.tracker.record(id, "candidate_3", second)
        expect(yield* retainedCandidate(f.tracker, id)).toEqual({ candidate: second, ordinal: 3 })
        expect(candidateKey(1)).toBe("candidate")
      }).pipe(Effect.provideService(FileSystem.FileSystem, f.fs))
    }
  })
)

it.effect("refresh refuses exhaustion, lost plan, changed source and foreign merge parents", () =>
  Effect.gen(function* () {
    for (const fault of ["exhausted", "plan", "source", "parents", "lineage", "conflict"] as const) {
      const f = yield* makeFixture
      yield* Effect.gen(function* () {
        const plan = yield* f.worktrees.prepare(id, "candidate", CommitSha.make(BASE))
        const result = Result.make({
          commit: prior.result,
          attempt: plan.attempt,
          tests: { ...qualification, commit: prior.result }
        })
        if (fault === "plan") delete f.rows.get("delivery")?.metadata["dalph.candidate_plan"]
        if (fault === "source")
          yield* f.tracker.record(id, "candidate_2_refresh", { prior: RESULT, result: RESULT, head: ADVANCED })
        f.state.candidateHead = CANDIDATE
        const git = {
          ...f.git,
          git: (args: ReadonlyArray<string>, cwd?: Plan["path"]) => {
            if ((fault === "lineage" && args[0] === "merge-base") || (fault === "conflict" && args.includes("merge")))
              return Effect.fail(new CommandRejected({ message: fault, receipt: "/fixture/git.json", exit: 1 }))
            if (args[0] === "show") return Effect.succeed(`${BASE} ${ADVANCED}`)
            return f.git.git(args, cwd)
          }
        }
        yield* Effect.flip(
          refreshCandidate(f.tracker, git, f.stages, id, prior, result, ADVANCED, fault === "exhausted" ? 3 : 1)
        )
        expect(f.state.modelCalls).toBe(0)
        expect(f.state.qualificationCalls).toBe(0)
        expect(f.paths.size).toBe(1)
      }).pipe(Effect.provideService(FileSystem.FileSystem, f.fs))
    }
  })
)

it.effect("native publication pins its endpoint and rejects changed result approval before mutation", () =>
  Effect.gen(function* () {
    for (const fault of ["endpoint", "result", "attempt", "approval", "candidate"] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        yield* f.workflow.prepare(yield* f.row("prepare"))
        f.state.workHead = RESULT
        f.branches.set("dalph/work/work", RESULT)
        yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
        yield* f.workflow.check(yield* f.row("work"))
        const metadata = f.raw("work").metadata
        const result = Schema.decodeUnknownSync(Schema.fromJsonString(Result))(metadata["dalph.result"] ?? "")
        if (fault === "endpoint") {
          yield* f.tracker.record(id, "push_intent", {
            candidate: CANDIDATE,
            head: BASE,
            endpoint: "/foreign.git",
            ref: f.git.target
          })
        } else if (fault === "candidate") {
          const plan = yield* f.worktrees.prepare(id, "candidate", CommitSha.make(BASE))
          yield* f.tracker.record(id, "candidate", { ...prior, result: ADVANCED })
          expect(plan).toBeDefined()
        } else
          metadata["dalph.result"] = JSON.stringify({
            ...result,
            ...(fault === "result" ? { commit: ADVANCED } : {}),
            ...(fault === "attempt" ? { attempt: "foreign" } : {}),
            ...(fault === "approval" ? { tests: { ...result.tests, commit: ADVANCED } } : {})
          })
        yield* Effect.flip(f.workflow.integrate(yield* f.row("delivery")))
        expect(f.state.pushCalls).toBe(0)
        expect(f.raw("delivery").status).not.toBe("closed")
      }).pipe(Effect.provide(f.layer))
    }
  })
)

it.effect(
  "native delivery refreshes a competing compatible head without reimplementing, then cleans the refreshed branch",
  () =>
    Effect.gen(function* () {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        yield* f.workflow.prepare(yield* f.row("prepare"))
        f.state.workHead = RESULT
        f.branches.set("dalph/work/work", RESULT)
        yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
        yield* f.workflow.check(yield* f.row("work"))
        const original = f.git.git
        let denied = true
        f.git.git = (args, cwd) => {
          if (args[0] === "push") {
            if (denied)
              return Effect.fail(
                new CommandRejected({ message: "denied publication", receipt: "/fixture/push.json", exit: 1 })
              )
            f.state.pushCalls++
            f.state.remote = REFRESHED
            return Effect.succeed("")
          }
          if (args[0] === "merge-base" && args[2] === CANDIDATE && args[3] === ADVANCED)
            return Effect.fail(
              new CommandRejected({ message: "not applied", receipt: "/fixture/ancestry.json", exit: 1 })
            )
          if (args.includes("merge") && args.at(-1) === ADVANCED) {
            f.state.candidateHead = REFRESHED
            f.branches.set("dalph/candidate/delivery", REFRESHED)
            return Effect.succeed("")
          }
          if (args[0] === "show" && args.at(-1) === REFRESHED) return Effect.succeed(`${CANDIDATE} ${ADVANCED}`)
          if (args.includes("merge") && args.at(-1) === REFRESHED && cwd === undefined) {
            f.state.local = REFRESHED
            return Effect.succeed("")
          }
          return original(args, cwd)
        }
        yield* Effect.flip(f.workflow.integrate(yield* f.row("delivery")))
        expect(f.paths.size).toBe(2)
        expect(f.raw("delivery").status).not.toBe("closed")
        denied = false
        f.state.remote = ADVANCED
        yield* f.workflow.integrate(yield* f.row("delivery"))
        expect(f.state.modelCalls).toBe(0)
        expect(f.state.pushCalls).toBe(1)
        expect(f.paths.size).toBe(0)
        expect(f.branches.size).toBe(0)
        expect(f.state.local).toBe(REFRESHED)
        expect(f.raw("delivery").status).toBe("closed")
        expect(f.raw("prepare").metadata["dalph.native_integration_2"]).toBeDefined()
        const refreshed = yield* retainedCandidate(f.tracker, id)
        expect(refreshed.ordinal).toBe(2)
        expect(refreshed.candidate?.result).toBe(RESULT)
      }).pipe(Effect.provide(f.layer))
    })
)

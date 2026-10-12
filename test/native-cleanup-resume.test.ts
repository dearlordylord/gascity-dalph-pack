import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { RESULT } from "./helpers/workflow-fixture.ts"
import { makeNativeController } from "../src/native/controller.ts"
import { BeadId, BoundaryFailure } from "../src/domain/shared.ts"

it.effect("public resume distinguishes applied cleanup with a lost response from unexplained resource loss", () =>
  Effect.gen(function* () {
    for (const fault of [
      "none",
      "missing-intent",
      "plan",
      "attempt",
      "published",
      "promoted",
      "commit",
      "candidate",
      "publication-pair",
      "prepared"
    ] as const) {
      const f = yield* nativeFixture
      yield* Effect.gen(function* () {
        const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
        yield* controller.launch("Task")
        yield* f.workflow.prepare(yield* f.row("prepare"))
        f.state.workHead = RESULT
        f.branches.set("dalph/work/work", RESULT)
        yield* f.workflow.finish(yield* f.row("work"), BeadId.make("session"))
        yield* f.workflow.check(yield* f.row("work"))
        const execute = f.commands.execute
        const git = f.git.git
        f.git.git = (args, cwd) =>
          cwd === "/fixture/worktrees/work-work" && !f.paths.has(cwd)
            ? Effect.fail(new BoundaryFailure({ message: "original worktree already removed" }))
            : git(args, cwd)
        let loseResponse = true
        let resumes = 0
        f.commands.execute = (root, args, cwd, timeout, logs) =>
          execute(root, args, cwd, timeout, logs).pipe(
            Effect.flatMap((response) => {
              if (args.includes("resume")) resumes++
              if (loseResponse && args.includes("cleanup") && args.includes("/fixture/worktrees/work-work")) {
                loseResponse = false
                return Effect.fail(new BoundaryFailure({ message: "cleanup response lost after native removal" }))
              }
              return Effect.succeed(response)
            })
          )
        expect(String(yield* Effect.flip(f.workflow.integrate(yield* f.row("delivery"))))).toContain(
          "cleanup response lost"
        )
        expect(f.paths.has("/fixture/worktrees/work-work")).toBe(false)
        const metadata = f.raw("delivery").metadata
        expect(metadata["dalph.work_cleaned"]).toBeUndefined()
        if (fault === "missing-intent") delete metadata["dalph.work_cleanup_intent"]
        if (fault === "plan" || fault === "attempt") {
          const intent = JSON.parse(metadata["dalph.work_cleanup_intent"] ?? "null")
          metadata["dalph.work_cleanup_intent"] = JSON.stringify({
            ...intent,
            ...(fault === "plan" ? { plan: { ...intent.plan, path: "/foreign/worktree" } } : { attempt_id: "foreign" })
          })
        }
        if (fault === "published" || fault === "promoted") delete metadata[`dalph.${fault}`]
        if (fault === "candidate") delete metadata["dalph.candidate"]
        if (fault === "prepared") delete f.raw("work").metadata["dalph.work_prepared"]
        if (fault === "publication-pair") {
          metadata["dalph.published"] = JSON.stringify({ commit: "e".repeat(40) })
          metadata["dalph.promoted"] = JSON.stringify({ commit: "e".repeat(40) })
        }
        if (fault === "commit") {
          const promoted = JSON.parse(metadata["dalph.promoted"] ?? "null")
          metadata["dalph.promoted"] = JSON.stringify({ ...promoted, commit: "e".repeat(40) })
        }
        const recovery = controller.resume(BeadId.make("root"))
        if (fault === "none") {
          yield* recovery
          expect(resumes).toBe(1)
          yield* f.workflow.integrate(yield* f.row("delivery"))
          expect(f.raw("work").metadata["dalph.native_settled"]).toBeDefined()
          expect(f.raw("delivery").status).toBe("closed")
        } else if (fault === "prepared") {
          yield* recovery
          expect(String(yield* Effect.flip(f.workflow.integrate(yield* f.row("delivery"))))).toContain("cleanup proof")
        } else {
          expect(String(yield* Effect.flip(recovery))).toContain("worktree is lost")
          expect(resumes).toBe(0)
        }
        expect(f.paths.has("/fixture/worktrees/work-work")).toBe(false)
        expect(f.state.modelCalls).toBe(0)
        expect(f.state.pushCalls).toBe(1)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

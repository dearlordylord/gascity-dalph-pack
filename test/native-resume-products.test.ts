import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeReviewFixture } from "./helpers/native-review-fixture.ts"
import { BeadId } from "../src/domain/shared.ts"
import { makeNativeController } from "../src/native/controller.ts"

it.effect("resume ignores another product's writer but refuses its intrusion into the exact workspace", () =>
  Effect.gen(function* () {
    for (const shared of [false, true]) {
      const f = yield* nativeReviewFixture
      yield* Effect.gen(function* () {
        const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
        yield* controller.launch("Task")
        yield* f.start
        yield* f.review.prepare(yield* f.row("review-prepare"))
        f.rows.set("other-review", {
          id: BeadId.make("other-review"),
          status: "open",
          metadata: {
            "gc.root_bead_id": "other-root",
            "dalph.task": "other-task",
            "dalph.phase": "review",
            "gc.run_target": "fixture/dalph.native-reviewer",
            "gc.session_id": "other-session"
          }
        })
        f.rows.set("other-session", {
          id: BeadId.make("other-session"),
          status: "open",
          metadata: {
            state: "awake",
            template: "fixture/dalph.native-reviewer",
            work_dir: shared ? "/fixture/worktrees/work-work" : "/fixture/worktrees/other-work",
            "gc.trigger_bead_id": "other-review"
          }
        })
        const execute = f.commands.execute
        f.commands.execute = (root, args, cwd, timeout, logs) =>
          args.includes("session") && args.includes("list")
            ? Effect.succeed(
                JSON.stringify({
                  sessions: ["session", "review-session", "fix-session", "other-session"].map((id) => ({
                    id,
                    template: f.raw(id).metadata.template,
                    closed: f.raw(id).status === "closed"
                  }))
                })
              )
            : execute(root, args, cwd, timeout, logs)
        const original = f.raw("work").metadata["dalph.native_attempt"]
        const resume = controller.resume(BeadId.make("root"))
        if (shared) yield* Effect.flip(resume)
        else yield* resume
        expect(f.events).not.toContain("native-close:other-session")
        expect(f.raw("other-session").status).toBe("open")
        expect(f.raw("work").metadata["dalph.native_attempt"]).toBe(original)
        expect(f.paths.has("/fixture/worktrees/work-work")).toBe(true)
      }).pipe(Effect.provide(f.layer))
    }
  })
)

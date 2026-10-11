import { Effect, FileSystem, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import * as HttpClient from "effect/http/HttpClient"
import { CommandRejected } from "../src/delivery/command.ts"
import { BeadId } from "../src/domain/shared.ts"
import { Bead, makeTracker } from "../src/delivery/tracker.ts"
import { makeWorkflow } from "../src/delivery/workflow.ts"
import { makeFixture } from "./helpers/workflow-fixture.ts"

it.effect("discovery failures cannot claim work unless exit one proves an empty observation", () =>
  Effect.gen(function* () {
    for (const scenario of [
      { exit: 2, source: "[]", idle: false },
      { source: "[]", idle: false },
      { exit: 1, source: '[{"id":"work","status":"open"}]', idle: false },
      { exit: 1, source: "{}", idle: false },
      { exit: 1, source: "[]", idle: true }
    ]) {
      const f = yield* makeFixture
      let claims = 0
      const commands = {
        ...f.commands,
        execute: (root: string, args: ReadonlyArray<string>) => {
          if (!args.includes("hook")) return f.commands.execute(root, args)
          if (!args.includes("--claim"))
            return Effect.fail(
              new CommandRejected({
                message: "discovery failed",
                receipt: "/fixture/discovery.json",
                ...("exit" in scenario ? { exit: scenario.exit } : {})
              })
            )
          claims++
          return Effect.succeed(
            JSON.stringify({
              schema_version: "1",
              ok: true,
              command: "hook",
              action: "drain",
              reason: "no_work",
              drain_acknowledged: true
            })
          )
        }
      }
      const fs = { ...f.fs, readFileString: () => Effect.succeed(scenario.source) }
      const tracker = makeTracker(f.config, commands)
      const workflow = makeWorkflow(f.config, commands, tracker, f.git, f.stages, f.worktrees)
      const turn = workflow
        .run("worker")
        .pipe(Effect.provideService(FileSystem.FileSystem, fs), Effect.provideService(HttpClient.HttpClient, f.http))
      if (scenario.idle) expect(yield* turn).toEqual({ outcome: "idle", reason: "no_work" })
      else yield* Effect.flip(turn)
      expect(claims).toBe(scenario.idle ? 1 : 0)
      expect(f.state.modelCalls).toBe(0)
      expect(f.state.qualificationCalls).toBe(0)
      expect(f.paths.size).toBe(0)
      expect(f.rows.get("work")?.status).toBe("open")
    }
  })
)

it.effect("legacy metadata requires exact acknowledgement and never repeats a contradictory write", () =>
  Effect.gen(function* () {
    for (const acknowledged of [true, false]) {
      const f = yield* makeFixture
      f.state.casAcknowledged = acknowledged
      const write = f.tracker
        .metadata(BeadId.make("work"), "dalph.native_attempt", "attempt-one")
        .pipe(Effect.provideService(FileSystem.FileSystem, f.fs))
      if (acknowledged) {
        yield* write
        yield* write
        const error = yield* Effect.flip(
          f.tracker
            .metadata(BeadId.make("work"), "dalph.native_attempt", "another-attempt")
            .pipe(Effect.provideService(FileSystem.FileSystem, f.fs))
        )
        expect(String(error)).toContain("contradictory durable metadata")
        expect(f.rows.get("work")?.metadata["dalph.native_attempt"]).toBe("attempt-one")
      } else {
        expect(String(yield* Effect.flip(write))).toContain("durable metadata not acknowledged")
        expect(f.rows.get("work")?.metadata["dalph.native_attempt"]).toBeUndefined()
      }
      expect(f.events.filter((event) => event.includes("metadata-cas"))).toHaveLength(1)
      expect(f.paths.size).toBe(0)
    }
  })
)

it.effect("integration revalidates a discovered implementation before candidate or publication effects", () =>
  Effect.gen(function* () {
    for (const change of ["reopened", "foreign-root"]) {
      const f = yield* makeFixture
      const work = f.rows.get("work")
      if (!work) throw new Error("fixture work missing")
      work.status = "closed"
      let listed = false
      const commands = {
        ...f.commands,
        execute: (root: string, args: ReadonlyArray<string>) =>
          Effect.gen(function* () {
            const text = yield* f.commands.execute(root, args)
            if (!listed && args.includes("ready") && args.includes("closed")) {
              listed = true
              if (change === "reopened") work.status = "open"
              else work.metadata["gc.root_bead_id"] = "foreign-root"
            }
            return text
          })
      }
      const tracker = makeTracker(f.config, commands)
      const workflow = makeWorkflow(f.config, commands, tracker, f.git, f.stages, f.worktrees)
      const delivery = yield* Schema.decodeUnknownEffect(Bead)(f.rows.get("delivery"))
      const error = yield* Effect.flip(
        workflow
          .integrator(delivery)
          .pipe(
            Effect.provideService(FileSystem.FileSystem, f.fs),
            Effect.provideService(HttpClient.HttpClient, f.http)
          )
      )
      expect(String(error)).toContain("foreign or unfinished native scope")
      expect(f.state.qualificationCalls).toBe(0)
      expect(f.state.pushCalls).toBe(0)
      expect(f.state.cleanupCalls).toBe(0)
      expect(f.paths.size).toBe(0)
      expect(f.rows.get("delivery")?.status).toBe("open")
    }
  })
)

import { Effect, Layer, Schema } from "effect"
import { NodeHttpClient, NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { BeadId } from "../src/domain/shared.ts"
import { nativeTrackerFixture } from "./helpers/native-tracker-fixture.ts"

it.live(
  "S9 public native workflow launch/resume delivers with a native configured tracker and preserves failed reads",
  () =>
    Effect.gen(function* () {
      const f = yield* nativeTrackerFixture
      const launched = yield* f
        .native(["sling", "fixture/dalph.worker", "s9", "--formula", "--json"])
        .pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(
              Schema.fromJsonString(Schema.Struct({ workflow_id: BeadId, ok: Schema.Literal(true) }))
            )
          )
        )
      expect(launched.workflow_id).toBeTruthy()
      f.state.readsFail = true
      expect(String(yield* Effect.flip(f.turn("worker")))).toContain("tracker unavailable")
      expect(f.state.modelCalls).toBe(0)
      const firstClaim = f.state.claims[0]
      expect(firstClaim?.action).toBe("work")
      expect(yield* f.gitCall(["worktree", "list", "--porcelain"])).not.toContain("/worktrees/")
      f.state.readsFail = false
      if (firstClaim?.action !== "work") throw new Error("native claim was not observed")
      const preserved = yield* f.tracker.bead(firstClaim.bead_id)
      expect(preserved.status).toBe("in_progress")
      expect(preserved.metadata?.["dalph.result"]).toBeUndefined()
      f.state.loseCas = true
      expect((yield* f.turn("worker")).outcome).toBe("worked")
      expect(f.state.modelCalls).toBe(1)
      const resumedClaim = f.state.claims[1]
      expect(resumedClaim?.reason).toBe("existing_assignment")
      if (firstClaim?.action === "work" && resumedClaim?.action === "work") {
        expect(resumedClaim.bead_id).toBe(firstClaim.bead_id)
        expect(firstClaim.root_bead_id).toBe(launched.workflow_id)
      } else throw new Error("native exact resume was not observed")
      expect(new Set(f.state.casKeys).size).toBe(f.state.casKeys.length)
      expect((yield* f.turn("integrator")).outcome).toBe("delivered")
      expect(yield* f.fs.readFileString(`${f.config.repo}/delivered.txt`)).toBe("delivered\n")
      expect(yield* f.gitCall(["rev-parse", "master"])).toBe(
        yield* f.gitCall(["rev-parse", "refs/remotes/origin/master"])
      )
      expect((yield* f.turn("worker")).outcome).toBe("idle")
      expect((yield* f.turn("integrator")).outcome).toBe("idle")
      expect(f.state.modelCalls).toBe(1)
      const rows = yield* f
        .native(["ready", "--status", "closed", "--limit", "0", "--json"])
        .pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(
              Schema.fromJsonString(
                Schema.Array(
                  Schema.Struct({ metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)) })
                )
              )
            )
          )
        )
      expect(rows.filter((row) => row.metadata?.["dalph.task"] === "task")).toHaveLength(2)
      expect(yield* f.gitCall(["worktree", "list", "--porcelain"])).not.toContain("/worktrees/")
    }).pipe(Effect.provide(Layer.merge(NodeHttpClient.layerUndici, NodeServices.layer)), Effect.scoped),
  { timeout: 270_000 }
)

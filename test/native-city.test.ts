import { Effect, Schema, Schedule } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { nativeCity } from "./helpers/native-city.ts"
import { BoundaryFailure, BeadId } from "../src/domain/shared.ts"

it.live(
  "S1/S6: public native workflow launch delivers one task with a non-pnpm command and exact native session",
  () =>
    Effect.gen(function* () {
      const city = yield* nativeCity
      const launch = yield* city
        .native("launch")
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ workflow_id: BeadId })))))
      const delivered = yield* Effect.gen(function* () {
        const rows = yield* city.rows()
        const delivery = rows.find(
          (row) =>
            row.metadata?.["gc.root_bead_id"] === launch.workflow_id && row.metadata?.["dalph.phase"] === "deliver"
        )
        if (delivery?.status !== "closed") return yield* new BoundaryFailure({ message: "native delivery pending" })
        return { rows, delivery }
      }).pipe(Effect.retry({ schedule: Schedule.spaced("1 second").pipe(Schedule.upTo({ duration: "240 seconds" })) }))
      const work = delivered.rows.find((row) => row.metadata?.["dalph.native_settled"])
      expect(work?.metadata?.["dalph.native_proposal"]).toBeDefined()
      expect(work?.metadata?.["dalph.result"]).toBeDefined()
      const attempt = work?.metadata?.["dalph.native_attempt"]
      const proposal = work?.metadata?.["dalph.native_proposal"]
      yield* city.native("resume", launch.workflow_id)
      const resumed = (yield* city.rows()).find((row) => row.id === work?.id)
      expect(resumed?.metadata?.["dalph.native_attempt"]).toBe(attempt)
      expect(resumed?.metadata?.["dalph.native_proposal"]).toBe(proposal)
      expect(yield* city.git("status", "--porcelain")).toBe("")
      const head = yield* city.git("rev-parse", "HEAD")
      expect(yield* city.git("rev-parse", "refs/remotes/origin/master")).toBe(head)
      expect(yield* city.fs.readFileString(`${city.env.DALPH_TARGET_REPO}/native-proof.ts`)).toContain('"native"')
      expect(yield* city.fs.readDirectory(city.env.DALPH_WORKTREE_ROOT)).toEqual([])
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  280000
)

import { Effect, Option, Schema, Schedule } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { nativeCity } from "./helpers/native-city.ts"
import { BoundaryFailure, BeadId } from "../src/domain/shared.ts"
import { NativeActorAcknowledgement } from "../src/native/actor-retirement.ts"
import { NativeProposal } from "../src/native/contract.ts"
import { NativeReviewVerdict } from "../src/native/review-contract.ts"
import { isExecutionMetadata } from "../src/native/nodes.ts"

it.live(
  "S1/S3/S6: public native workflow launch delivers after one exact independent clean review",
  () =>
    Effect.gen(function* () {
      const city = yield* nativeCity
      const launch = yield* city
        .native("launch")
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ workflow_id: BeadId })))))
      const cooked = yield* city.rows()
      const root = cooked.find((row) => row.id === launch.workflow_id)
      expect(root).toBeDefined()
      expect(root?.assignee ?? "").toBe("")
      expect(root?.metadata?.["gc.routed_to"] ?? "").toBe("")
      const reviewControl = cooked.find((row) => row.metadata?.["gc.kind"] === "ralph")
      expect(reviewControl?.metadata?.["gc.scope_ref"]).toBe("delivery-scope")
      expect(reviewControl?.metadata?.["gc.on_fail"]).toBe("abort_scope")
      const delivered = yield* Effect.gen(function* () {
        const rows = yield* city.rows()
        const delivery = rows.find(
          (row) =>
            row.metadata?.["gc.root_bead_id"] === launch.workflow_id && row.metadata?.["dalph.phase"] === "deliver"
        )
        const scope = rows.find((row) => row.metadata?.["gc.scope_name"] === "delivery")
        if (
          delivery?.status !== "closed" ||
          !rows.some((row) => row.metadata?.["dalph.native_settled"]) ||
          scope?.status !== "closed"
        )
          return yield* new BoundaryFailure({ message: "native delivery pending" })
        return { rows, delivery, scope }
      }).pipe(Effect.retry({ schedule: Schedule.spaced("5 seconds").pipe(Schedule.upTo({ duration: "540 seconds" })) }))
      const work = delivered.rows.find((row) => row.metadata?.["dalph.native_settled"])
      expect(delivered.scope?.metadata?.["gc.outcome"]).toBe("pass")
      expect(delivered.delivery.metadata?.["gc.outcome"]).toBe("pass")
      expect(work?.metadata?.["dalph.native_proposal"]).toBeDefined()
      expect(work?.metadata?.["dalph.result"]).toBeDefined()
      const reviews = delivered.rows.filter(
        (row) => row.metadata?.["dalph.phase"] === "review" && isExecutionMetadata(row.metadata)
      )
      expect(reviews).toHaveLength(1)
      expect(reviews[0]?.metadata?.["gc.iteration"]).toBe("1")
      expect(work?.metadata?.["dalph.native_approved_initial_1"]).toBeDefined()
      const proposalFact = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeProposal))(
        work?.metadata?.["dalph.native_proposal"]
      )
      const approval = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeReviewVerdict))(
        work?.metadata?.["dalph.native_approved_initial_1"]
      )
      const outputDirectory = `${city.root}/evidence/actor-retirement`
      const outputs = (yield* city.fs.readDirectory(outputDirectory)).filter((name) => name.endsWith(".stdout"))
      const acknowledgements = yield* Effect.forEach(outputs, (name) =>
        city.fs
          .readFileString(`${outputDirectory}/${name}`)
          .pipe(
            Effect.map((text) =>
              Schema.decodeUnknownOption(Schema.fromJsonString(NativeActorAcknowledgement))(text.trim())
            )
          )
      )
      const acknowledgedNames = acknowledgements.flatMap((value) => (Option.isSome(value) ? [value.value.session] : []))
      for (const session of [proposalFact.session, approval.session]) {
        const native = delivered.rows.find((row) => row.id === session)
        expect(native?.status).toBe("closed")
        expect(acknowledgedNames).toContain(native?.metadata?.session_name)
      }

      expect(delivered.rows.some((row) => row.metadata?.["dalph.native_fix_initial_1"])).toBe(false)
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
      expect(yield* city.worktreeEntries()).toEqual([])
      expect((yield* city.git("worktree", "list", "--porcelain")).match(/^worktree /gm)).toHaveLength(1)
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  600000
)

import { Effect, Schedule, Schema, type Duration } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { makeNativeCity } from "./helpers/native-city.ts"
import { BeadId, BoundaryFailure } from "../src/domain/shared.ts"
import { Candidate, Plan, Result } from "../src/domain/attempt.ts"

it.live(
  "S7/S8 public native launch/resume serializes two accepted results and reconciles applied push and cleanup loss",
  () =>
    Effect.gen(function* () {
      const city = yield* makeNativeCity(true)
      const observe = <A, E, R>(
        read: Effect.Effect<A, E, R>,
        ready: (value: A) => boolean,
        window: Duration.Input = "180 seconds"
      ) =>
        read.pipe(
          Effect.flatMap((value) =>
            ready(value)
              ? Effect.succeed(value)
              : Effect.fail(new BoundaryFailure({ message: "native delivery observation pending" }))
          ),
          Effect.retry({ schedule: Schedule.spaced("1 second").pipe(Schedule.upTo({ duration: window })) })
        )
      const launch = () =>
        city
          .native("launch")
          .pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ workflow_id: BeadId }))))
          )
      const first = yield* launch()
      const second = yield* launch()
      const roots = [first.workflow_id, second.workflow_id]
      const accepted = yield* observe(
        city.rows(),
        (rows) =>
          roots.every((root) =>
            rows.some((row) => row.metadata?.["gc.root_bead_id"] === root && row.metadata?.["dalph.result"])
          ),
        "10 minutes"
      )
      const work = accepted.filter(
        (row) =>
          roots.includes(BeadId.make(row.metadata?.["gc.root_bead_id"] ?? "none")) && row.metadata?.["dalph.result"]
      )
      expect(work).toHaveLength(2)
      const results = work.map((row) =>
        Schema.decodeUnknownSync(Schema.fromJsonString(Result))(row.metadata?.["dalph.result"] ?? "")
      )
      expect(results[0]?.commit).not.toBe(results[1]?.commit)
      yield* city.fs.writeFileString(`${city.root}/release-integration`, "release")
      yield* observe(city.fs.exists(`${city.root}/push-applied`), Boolean)
      const pushed = yield* city.rows()
      const delivery = pushed.find((row) => row.metadata?.["dalph.push_intent"])
      if (!delivery) throw new Error("missing exact pushed delivery")
      const candidate = Schema.decodeUnknownSync(Schema.fromJsonString(Candidate))(
        delivery.metadata?.["dalph.candidate"] ?? ""
      )
      expect(pushed.filter((row) => row.metadata?.["dalph.candidate"])).toHaveLength(1)
      expect(
        pushed.filter((row) => row.metadata?.["dalph.phase"] === "deliver" && row.status === "closed")
      ).toHaveLength(0)
      expect(
        yield* city.execute(["git", "--git-dir", `${city.root}/remote.git`, "rev-parse", "refs/heads/master"])
      ).toBe(candidate.commit)
      yield* city.fs.writeFileString(`${city.root}/release-push`, "lose response")
      yield* city.native("resume", first.workflow_id)
      yield* city.native("resume", second.workflow_id)
      yield* observe(city.fs.exists(`${city.root}/cleanup-applied`), Boolean)
      const cleanup = yield* city.rows()
      const partial = cleanup.find((row) => row.id === delivery.id)
      expect(partial?.metadata?.["dalph.published"]).toBeDefined()
      expect(partial?.metadata?.["dalph.promoted"]).toBeDefined()
      expect(partial?.status).not.toBe("closed")
      const plan = Schema.decodeUnknownSync(Schema.fromJsonString(Plan))(
        work.find((row) => row.metadata?.["gc.root_bead_id"] === delivery.metadata?.["gc.root_bead_id"])?.metadata?.[
          "dalph.work_plan"
        ] ?? ""
      )
      expect(yield* city.fs.exists(plan.path)).toBe(false)
      yield* city.fs.writeFileString(`${city.root}/release-cleanup`, "lose response")
      yield* city.native("resume", first.workflow_id)
      yield* city.native("resume", second.workflow_id)
      const settled = yield* observe(city.rows(), (rows) =>
        roots.every((root) =>
          rows.some((row) => row.metadata?.["gc.root_bead_id"] === root && row.metadata?.["dalph.native_settled"])
        )
      )
      for (const result of results) yield* city.git("merge-base", "--is-ancestor", result.commit, "HEAD")
      expect(yield* city.git("rev-parse", "HEAD")).toBe(
        yield* city.execute(["git", "--git-dir", `${city.root}/remote.git`, "rev-parse", "refs/heads/master"])
      )
      expect(yield* city.worktreeEntries()).toEqual([])
      expect((yield* city.git("worktree", "list", "--porcelain")).match(/^worktree /gm)).toHaveLength(1)
      expect(settled.filter((row) => row.metadata?.["dalph.native_settled"])).toHaveLength(2)
      const trace = (yield* city.fs.readFileString(`${city.root}/delivery-trace.jsonl`))
        .trim()
        .split("\n")
        .map((line) =>
          Schema.decodeUnknownSync(
            Schema.fromJsonString(Schema.Struct({ name: Schema.String, args: Schema.Array(Schema.String) }))
          )(line)
        )
      expect(trace.filter((entry) => entry.name === "push")).toHaveLength(2)
      expect(trace.every((entry) => !entry.args.some((arg) => arg.startsWith("--force")))).toBe(true)
      expect(settled.find((row) => row.id === delivery.id)?.metadata?.["dalph.candidate"]).toBe(
        delivery.metadata?.["dalph.candidate"]
      )
      for (const original of work)
        expect(settled.find((row) => row.id === original.id)?.metadata?.["dalph.result"]).toBe(
          original.metadata?.["dalph.result"]
        )
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  1500000
)

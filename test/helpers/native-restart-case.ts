import { Effect, Exit, Schedule, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { makeNativeCity } from "./native-city.ts"
import { BeadId, BoundaryFailure } from "../../src/domain/shared.ts"
import { NativeAttempt, NativeProposal, NativeSession } from "../../src/native/contract.ts"
import { NativeReviewVerdict } from "../../src/native/review-contract.ts"
import { isExecutionMetadata } from "../../src/native/nodes.ts"

const poll = Schedule.spaced("1 second").pipe(Schedule.upTo({ duration: "10 minutes" }))
const Entry = Schema.Struct({ session: BeadId })

export const registerNativeRestartCase = (changed: boolean) => {
  it.live(
    `S3/S4 public restart after review approval with ${changed ? "changed" : "unchanged"} candidate`,
    () =>
      Effect.gen(function* () {
        const city = yield* makeNativeCity(changed ? "cut-changed" : "cut-unchanged")
        const launched = yield* city
          .native("launch")
          .pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ workflow_id: BeadId }))))
          )
        const entries = () =>
          city.fs.readDirectory(city.root).pipe(
            Effect.flatMap((files) =>
              Effect.forEach(
                files.filter((name) => name.startsWith("qualification-cut-") && name.endsWith(".json")),
                (name) =>
                  city.fs
                    .readFileString(`${city.root}/${name}`)
                    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Entry))))
              )
            )
          )
        const session = (id: BeadId) =>
          city
            .execute([
              "env",
              "GC_NO_API=1",
              "gc",
              "--city",
              city.env.DALPH_CITY_ROOT,
              "beads",
              "show",
              id,
              "--format=json"
            ])
            .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeSession))))
        const before = yield* Effect.gen(function* () {
          const rows = yield* city.rows()
          const work = rows.find(
            (row) =>
              row.metadata?.["gc.root_bead_id"] === launched.workflow_id &&
              row.metadata["dalph.phase"] === "work" &&
              isExecutionMetadata(row.metadata)
          )
          const held = (yield* entries())[0]
          if (!work?.metadata?.["dalph.native_approved_initial_1"] || !held)
            return yield* new BoundaryFailure({ message: "approved native qualifier cut pending" })
          return { work, held }
        }).pipe(Effect.retry({ schedule: poll }))
        const metadata = before.work.metadata
        if (!metadata) return yield* new BoundaryFailure({ message: "cut lost attempt metadata" })
        const attempt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeAttempt))(
          metadata["dalph.native_attempt"]
        )
        const approved = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeReviewVerdict))(
          metadata["dalph.native_approved_initial_1"]
        )
        const proposal = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(NativeProposal))(
          metadata["dalph.native_proposal"]
        )
        const originalHead = yield* city.git("rev-parse", "HEAD")
        expect(metadata["dalph.result"]).toBeUndefined()
        expect(approved.commit).toBe(proposal.commit)
        const oldQualifier = yield* session(before.held.session)
        expect(oldQualifier.metadata.template).toBe("fixture/dalph.native-qualifier")
        yield* city.execute(["gc", "--city", city.env.DALPH_CITY_ROOT, "stop"], undefined, 120)
        const heldQualifier = yield* session(before.held.session)
        expect(heldQualifier.id).toBe(oldQualifier.id)
        expect(heldQualifier.metadata.template).toBe(oldQualifier.metadata.template)
        expect(heldQualifier.metadata["gc.trigger_bead_id"]).toBe(oldQualifier.metadata["gc.trigger_bead_id"])
        const stoppedRows = yield* city.rows()
        const unclaimed = stoppedRows.find((row) => row.id === heldQualifier.metadata["gc.trigger_bead_id"])
        expect(unclaimed?.status).toBe("open")
        expect(unclaimed?.metadata?.["dalph.phase"]).toBe("qualify")
        expect(unclaimed?.metadata?.["gc.root_bead_id"]).toBe(launched.workflow_id)
        expect(unclaimed?.assignee ?? "").toBe("")
        const identities = new Set(
          [
            heldQualifier.id,
            heldQualifier.metadata.session_name,
            heldQualifier.metadata.alias,
            heldQualifier.metadata.agent_name,
            heldQualifier.metadata.template
          ].filter((value): value is string => typeof value === "string" && value.length > 0)
        )
        expect(
          stoppedRows.filter(
            (row) =>
              row.status !== "closed" &&
              (identities.has(row.assignee ?? "") || row.metadata?.["gc.session_id"] === heldQualifier.id)
          )
        ).toEqual([])
        const closed = yield* city
          .execute(["gc", "--city", city.env.DALPH_CITY_ROOT, "session", "close", heldQualifier.id, "--json"])
          .pipe(
            Effect.flatMap(
              Schema.decodeUnknownEffect(
                Schema.fromJsonString(
                  Schema.Struct({
                    schema_version: Schema.Literal("1"),
                    ok: Schema.Literal(true),
                    session_id: BeadId,
                    state: Schema.Literal("closed")
                  })
                )
              )
            )
          )
        expect(closed.session_id).toBe(heldQualifier.id)
        const preserved = (yield* city.rows()).find((row) => row.id === unclaimed?.id)
        expect(preserved?.status).toBe("open")
        expect(preserved?.assignee ?? "").toBe("")
        expect(preserved?.metadata?.["gc.session_id"]).toBeUndefined()
        expect(preserved?.metadata?.["dalph.result"]).toBeUndefined()
        for (const id of [before.held.session, proposal.session, approved.session]) {
          const stopped = yield* session(id)
          expect(stopped.id).toBe(id)
          expect(stopped.status).toBe("closed")
          if (id === heldQualifier.id) {
            expect(stopped.metadata.template).toBe(heldQualifier.metadata.template)
            expect(stopped.metadata["gc.trigger_bead_id"]).toBe(heldQualifier.metadata["gc.trigger_bead_id"])
          }
        }
        const ownedGit = (...args: string[]) => city.execute(["git", "-C", attempt.plan.path, ...args])
        expect(yield* ownedGit("rev-parse", "HEAD")).toBe(approved.commit)
        expect(yield* ownedGit("status", "--porcelain")).toBe("")
        if (changed) {
          yield* city.fs.writeFileString(
            `${attempt.plan.path}/changed-after-review.ts`,
            "export const changed = true\n"
          )
          yield* ownedGit("add", "changed-after-review.ts")
          yield* ownedGit(
            "-c",
            "user.name=Native Acceptance",
            "-c",
            "user.email=native@local",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-m",
            "Change candidate after retained review"
          )
        }
        const candidate = yield* ownedGit("rev-parse", "HEAD")
        expect(candidate === approved.commit).toBe(!changed)
        const oldEntries = new Set((yield* entries()).map((entry) => entry.session))
        yield* city.execute(["gc", "start", city.env.DALPH_CITY_ROOT, "--json"], undefined, 120)
        const resumed = yield* city.native("resume", launched.workflow_id).pipe(Effect.exit)
        expect(Exit.isSuccess(resumed)).toBe(true)
        const newQualifier = yield* entries().pipe(
          Effect.flatMap((observed) => {
            const fresh = observed.find((entry) => !oldEntries.has(entry.session))
            return fresh
              ? Effect.succeed(fresh)
              : Effect.fail(new BoundaryFailure({ message: "new qualifier pending" }))
          }),
          Effect.retry({ schedule: poll })
        )
        const freshSession = yield* session(newQualifier.session)
        expect(freshSession.id).toBe(newQualifier.session)
        expect(freshSession.status).not.toBe("closed")
        expect(freshSession.metadata.template).toBe("fixture/dalph.native-qualifier")
        const qualification = (yield* city.rows()).find(
          (row) =>
            row.metadata?.["gc.root_bead_id"] === launched.workflow_id &&
            row.metadata["dalph.phase"] === "qualify" &&
            row.metadata["gc.kind"] !== "scope-check" &&
            isExecutionMetadata(row.metadata)
        )
        expect(qualification).toBeDefined()
        expect(freshSession.metadata["gc.trigger_bead_id"]).toBe(qualification?.id)
        expect(newQualifier.session).not.toBe(before.held.session)
        yield* city.fs.writeFileString(`${city.root}/qualification-release.next`, JSON.stringify(newQualifier))
        yield* city.fs.rename(`${city.root}/qualification-release.next`, `${city.root}/qualification-release.json`)
        if (changed) {
          const refusal = yield* Effect.gen(function* () {
            const path = `${city.root}/native-error-${newQualifier.session}`
            if (!(yield* city.fs.exists(path)))
              return yield* new BoundaryFailure({ message: "qualification refusal pending" })
            return yield* city.fs.readFileString(path)
          }).pipe(Effect.retry({ schedule: poll }))
          expect(refusal).toContain("qualification changed HEAD")
          expect(yield* ownedGit("rev-parse", "HEAD")).toBe(candidate)
          expect(yield* ownedGit("status", "--porcelain")).toBe("")
          expect(yield* city.git("rev-parse", "HEAD")).toBe(originalHead)
          expect(yield* city.git("rev-parse", "refs/remotes/origin/master")).toBe(originalHead)
          expect(yield* city.git("ls-remote", "origin", "refs/heads/master")).toBe(`${originalHead}\trefs/heads/master`)
          expect(yield* city.worktreeEntries()).toHaveLength(1)
        } else {
          yield* city.rows().pipe(
            Effect.flatMap((rows) =>
              rows.some((row) => row.id === before.work.id && row.metadata?.["dalph.native_settled"])
                ? Effect.void
                : Effect.fail(new BoundaryFailure({ message: "resumed delivery pending" }))
            ),
            Effect.retry({ schedule: poll })
          )
          expect(yield* city.git("rev-parse", "HEAD")).toBe(yield* city.git("rev-parse", "refs/remotes/origin/master"))
          expect(yield* city.git("ls-remote", "origin", "refs/heads/master")).toBe(
            `${yield* city.git("rev-parse", "HEAD")}\trefs/heads/master`
          )
          expect(yield* city.worktreeEntries()).toEqual([])
        }
        const rows = yield* city.rows()
        const work = rows.find((row) => row.id === before.work.id)
        expect(work?.metadata?.["dalph.native_attempt"]).toBe(metadata["dalph.native_attempt"])
        expect(work?.metadata?.["dalph.native_approved_initial_1"]).toBe(metadata["dalph.native_approved_initial_1"])
        expect(work?.metadata?.["dalph.native_review_initial_1"]).toBe(metadata["dalph.native_review_initial_1"])
        expect(
          rows.filter((row) => row.metadata?.["dalph.phase"] === "review" && isExecutionMetadata(row.metadata))
        ).toHaveLength(1)
        if (changed) {
          expect(work?.metadata?.["dalph.result"]).toBeUndefined()
          expect(work?.metadata?.["dalph.native_settled"]).toBeUndefined()
        } else expect(work?.metadata?.["dalph.result"]).toBeDefined()
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    600000
  )
}

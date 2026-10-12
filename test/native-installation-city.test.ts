import { Effect, Layer, Schema } from "effect"
import { NodeHttpClient, NodeServices } from "@effect/platform-node"
import * as HttpClient from "effect/http/HttpClient"
import * as Request from "effect/http/HttpClientRequest"
import * as Response from "effect/http/HttpClientResponse"
import { expect, it } from "@effect/vitest"
import { makeNativeCity } from "./helpers/native-city.ts"
import { NativeConfig } from "../src/native/contract.ts"

it.live(
  "S11/S12 fresh native installation passes full preflight without launch and refuses legacy resume",
  () =>
    Effect.gen(function* () {
      const city = yield* makeNativeCity("installation")
      const retainedPath = `${city.root}/legacy-worktree`
      yield* city.git("worktree", "add", "-b", "retained-legacy", retainedPath, "HEAD")
      const retainedEvidence = `${retainedPath}/unfinished-command-receipt.json`
      yield* city.fs.writeFileString(retainedEvidence, '{"status":"uncertain","version":"legacy-v1"}\n')
      const before = yield* city.rows()
      const result = yield* city
        .native("preflight")
        .pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(
              Schema.fromJsonString(
                Schema.Struct({ ok: Schema.Boolean, mode: Schema.String, retainedWorktrees: Schema.String })
              )
            )
          )
        )
      expect(result).toMatchObject({ ok: true, mode: "preflight" })
      expect(result.retainedWorktrees).toContain(retainedPath)
      yield* city.native("preflight")
      const resolved = yield* city
        .gc("config", "show", "--json")
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(NativeConfig))))
      expect(
        resolved.config.Agents.filter((agent) => agent.Dir === "fixture" && agent.Name.startsWith("native-"))
      ).toHaveLength(6)
      expect((yield* city.rows()).filter((row) => row.metadata?.["dalph.native_launch"])).toEqual([])
      expect(before.filter((row) => row.metadata?.["dalph.native_launch"])).toEqual([])
      const ownedEntries = (yield* city.fs.exists(city.env.DALPH_WORKTREE_ROOT)) ? yield* city.worktreeEntries() : []
      expect(ownedEntries).toEqual([])
      const legacy = yield* Request.post(`${city.env.DALPH_TRACKER_ENDPOINT}/v0/city/native-acceptance/beads`).pipe(
        Request.setHeader("X-GC-Request", "1"),
        Request.bodyJson({ rig: "fixture", title: "Retained legacy installation record", type: "task" }),
        Effect.flatMap(HttpClient.execute),
        Effect.flatMap(Response.filterStatusOk),
        Effect.flatMap(Response.schemaBodyJson(Schema.Struct({ id: Schema.String })))
      )
      const failure = yield* Effect.flip(city.native("resume", legacy.id))
      expect(String(failure)).toContain("legacy workflow has no native-v1 launch")
      const retained = (yield* city.rows()).find((row) => row.id === legacy.id)
      expect(retained?.status).toBe("open")
      expect(retained?.metadata?.["dalph.native_launch"]).toBeUndefined()
      expect(yield* city.fs.readFileString(retainedEvidence)).toBe('{"status":"uncertain","version":"legacy-v1"}\n')
      expect(yield* city.git("worktree", "list", "--porcelain")).toContain(retainedPath)
      expect(yield* city.git("branch", "--list", "retained-legacy")).toContain("retained-legacy")
    }).pipe(Effect.provide(Layer.merge(NodeHttpClient.layerUndici, NodeServices.layer)), Effect.scoped),
  300000
)

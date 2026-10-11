import { Effect, Layer, FileSystem, Schema } from "effect"
import * as HttpResponse from "effect/http/HttpClientResponse"
import * as HttpClient from "effect/http/HttpClient"
import { makeFixture } from "./workflow-fixture.ts"
import { BeadId, BoundaryFailure } from "../../src/domain/shared.ts"
import { makeTracker } from "../../src/delivery/tracker.ts"
import { makeNativeWorkflow } from "../../src/native/workflow.ts"
import { NativeContract } from "../../src/native/contract.ts"
import type { Commands } from "../../src/delivery/tracker.ts"

export const nativeFixture = Effect.gen(function* () {
  const fixture = yield* makeFixture
  const config = { ...fixture.config, executionVersion: "native-v1" as const }
  const contract = yield* Schema.decodeUnknownEffect(NativeContract)({
    version: 1,
    agent: "fixture/dalph.native-worker",
    harness: "fixture",
    harnessVersion: "fixture-1",
    runtime: "tmux",
    runtimeVersion: "tmux 3.3a",
    readiness: ["ready-fixture"],
    check: { command: ["node", "--test"], timeoutSeconds: 7 }
  })
  for (const row of fixture.rows.values()) row.metadata["dalph.runtime"] = "native-v1"
  const initialWork = fixture.rows.get("work")
  if (initialWork) initialWork.metadata["gc.kind"] = "run"
  fixture.rows.set("root", { id: BeadId.make("root"), status: "open", metadata: {} })
  fixture.rows.set("prepare", {
    id: BeadId.make("prepare"),
    status: "open",
    metadata: {
      "dalph.runtime": "native-v1",
      "dalph.task": "task",
      "dalph.phase": "prepare",
      "gc.root_bead_id": "root"
    }
  })
  fixture.rows.set("control", {
    id: BeadId.make("control"),
    status: "open",
    metadata: { "gc.root_bead_id": "root", "dalph.task": "task", "dalph.phase": "work", "gc.kind": "ralph" }
  })
  fixture.rows.set("spec", {
    id: BeadId.make("spec"),
    status: "open",
    metadata: { "gc.root_bead_id": "root", "gc.kind": "spec" }
  })
  fixture.rows.set("session", {
    id: BeadId.make("session"),
    status: "closed",
    metadata: {
      state: "closed",
      template: contract.agent,
      work_dir: "/fixture/worktrees/work-work",
      "gc.trigger_bead_id": "work"
    }
  })
  const settings = {
    config: {
      Agents: [
        {
          Name: "native-worker",
          Dir: "fixture",
          Provider: "fixture",
          StartCommand: "",
          OptionDefaults: Schema.decodeUnknownSync(Schema.NullOr(Schema.Record(Schema.String, Schema.String)))(null)
        }
      ],
      Session: { Provider: "tmux" },
      Beads: { Provider: "bd", ConditionalWrites: "require", GuardedRelease: "require" },
      Workspace: { Provider: "fixture", Env: { DALPH_TRIAL_ROOT: "/fixture" } }
    }
  }
  const state = {
    configured: true,
    wrongRead: false,
    readiness: true,
    runtime: "tmux 3.3a",
    version: "fixture-1",
    providerPermission: "",
    permissionModes: {},
    metadataAcknowledged: true
  }
  const commands: Commands = {
    ...fixture.commands,
    execute: (root, args, cwd, timeout, logs) =>
      Effect.gen(function* () {
        if (args.includes("sling")) return JSON.stringify({ workflow_id: "root" })
        if (args.includes("resume")) {
          fixture.events.push("native-resume")
          return "resumed"
        }
        if (args.includes("hook") && args.includes("current"))
          return fixture.state.role === "worker" ? "work" : "delivery"
        if (args.includes("session") && args.includes("list"))
          return JSON.stringify({
            sessions: [
              { id: "session", template: contract.agent, closed: fixture.rows.get("session")?.status === "closed" }
            ]
          })
        if (args.includes("show") && args.includes("beads")) {
          const id = args[args.indexOf("show") + 1]
          const row = fixture.rows.get(String(id))
          return JSON.stringify(state.wrongRead ? { ...row, id: "foreign" } : row)
        }
        if (args.includes("list") && args.includes("beads")) return JSON.stringify([...fixture.rows.values()])
        if (args.includes("config") && args.includes("show")) return JSON.stringify(settings)
        if (args.includes("agent") && args.includes("list"))
          return JSON.stringify({
            agents: state.configured ? [{ qualified_name: contract.agent, provider: contract.harness }] : []
          })
        if (args.includes("explain"))
          return JSON.stringify({
            resolved: {
              option_defaults: state.providerPermission ? { permission_mode: state.providerPermission } : null,
              permission_modes: state.permissionModes
            }
          })
        if (args[0] === "tmux") return state.runtime
        if (args[0] === "node" && args[1] === "--version") return state.version
        if (args[0] === "ready-fixture") {
          if (!state.readiness) return yield* new BoundaryFailure({ message: "harness not ready" })
          return "ready"
        }
        if (args[0] === "sh" || args.includes("health")) return "capable"
        if (args[0] === "node")
          return yield* fixture.commands.execute(root, ["mise", ...args.slice(1)], cwd, timeout, logs)
        return yield* fixture.commands.execute(root, args, cwd, timeout, logs)
      })
  }
  const http = HttpClient.make((request) => {
    if (request.method !== "GET") return fixture.http.execute(request)
    const id = decodeURIComponent(request.url.split("/").at(-1) ?? "")
    const row = fixture.rows.get(id)
    return Effect.succeed(
      HttpResponse.fromWeb(request, new Response(JSON.stringify(state.wrongRead ? { ...row, id: "foreign" } : row)))
    )
  })
  const tracker = makeTracker(config, commands, http)
  const workflow = makeNativeWorkflow(config, contract, commands, tracker, fixture.git)
  const files = new Map<string, string>()
  const fs = {
    ...fixture.fs,
    exists: (path: string) => Effect.succeed(files.has(path) || fixture.paths.has(path)),
    writeFileString: (path: string, source: string) =>
      Effect.sync(() => {
        files.set(path, source)
      }),
    readFileString: (path: string) =>
      files.has(path) ? Effect.succeed(files.get(path) ?? "") : fixture.fs.readFileString(path)
  }
  const layer = Layer.merge(Layer.succeed(FileSystem.FileSystem, fs), Layer.succeed(HttpClient.HttpClient, http))
  const row = (id: string) =>
    Effect.gen(function* () {
      return yield* tracker.bead(BeadId.make(id))
    }).pipe(Effect.provide(layer))
  const raw = (id: string) => {
    const value = fixture.rows.get(id)
    if (!value) throw new Error(`Missing fixture row ${id}`)
    return value
  }
  return {
    ...fixture,
    legacyWorkflow: fixture.workflow,
    fs,
    files,
    config,
    contract,
    commands,
    tracker,
    workflow,
    layer,
    row,
    raw,
    nativeState: state,
    settings
  }
})

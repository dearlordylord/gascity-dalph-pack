import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { makeNativeController } from "../src/native/controller.ts"

it.effect("native launch refuses missing, indirect, shared or unbounded reviewer roles before admission", () =>
  Effect.gen(function* () {
    for (const fault of [
      "same-agent",
      "missing-agent",
      "missing-role",
      "workspace-root",
      "wrapper",
      "reviewer-cap",
      "reviewer-zero",
      "rig-cap",
      "rig-zero",
      "missing-rig",
      "worker-minimum",
      "reviewer-minimum",
      "named-worker",
      "named-reviewer"
    ] as const) {
      const f = yield* nativeFixture
      const reviewer = f.settings.config.Agents.find((agent) => agent.Name === "native-reviewer")
      const worker = f.settings.config.Agents.find((agent) => agent.Name === "native-worker")
      const rig = f.settings.config.Rigs[0]
      if (!reviewer || !worker || !rig) throw new Error("missing fixture capacity")
      const contract = {
        ...f.contract,
        ...(fault === "same-agent" ? { reviewer: f.contract.agent } : {}),
        ...(fault === "missing-agent" ? { reviewer: "fixture/missing" } : {})
      }
      if (fault === "missing-role") reviewer.Name = "unconfigured"
      if (fault === "workspace-root") reviewer.WorkDir = "/foreign/worktrees"
      if (fault === "wrapper") reviewer.StartCommand = "nested-reviewer"
      if (fault === "reviewer-cap") reviewer.MaxActiveSessions = 3
      if (fault === "reviewer-zero") reviewer.MaxActiveSessions = 0
      if (fault === "rig-cap") rig.MaxActiveSessions = 6
      if (fault === "rig-zero") rig.MaxActiveSessions = 0
      if (fault === "missing-rig") f.settings.config.Rigs.length = 0
      if (fault === "worker-minimum") worker.MinActiveSessions = 1
      if (fault === "reviewer-minimum") reviewer.MinActiveSessions = 1
      if (fault === "named-worker")
        f.settings.config.NamedSessions.push({ Template: "dalph.native-worker", Dir: "fixture" })
      if (fault === "named-reviewer")
        f.settings.config.NamedSessions.push({ Template: "dalph.native-reviewer", Dir: "fixture" })
      const controller = makeNativeController(f.config, contract, f.commands, f.tracker, process.execPath)
      yield* Effect.flip(controller.launch("Task")).pipe(Effect.provide(f.layer))
      expect(f.raw("root").metadata["dalph.native_launch"]).toBeUndefined()
      expect(f.paths.size).toBe(0)
      expect(f.events.some((event) => event.includes("native-cook"))).toBe(false)
      expect(f.state.modelCalls).toBe(0)
    }
  })
)

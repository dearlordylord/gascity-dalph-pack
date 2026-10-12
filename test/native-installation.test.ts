import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { makeNativeController } from "../src/native/controller.ts"

it.effect("native installation refuses incomplete deterministic composition before workflow mutation", () =>
  Effect.gen(function* () {
    for (const name of ["native-prepare", "native-review-prepare", "native-qualifier", "native-integrator"]) {
      for (const fault of ["missing", "duplicate", "command", "lifecycle", "capacity", "zero", "minimum", "named"]) {
        const f = yield* nativeFixture
        const role = f.settings.config.Agents.find((entry) => entry.Name === name)
        if (!role) throw new Error("missing test role")
        if (fault === "missing") role.Name = "foreign"
        if (fault === "duplicate") f.settings.config.Agents.push({ ...role })
        if (fault === "command") role.StartCommand = " "
        if (fault === "lifecycle") role.Lifecycle = "interactive"
        if (fault === "capacity") role.MaxActiveSessions = name === "native-integrator" ? 2 : 3
        if (fault === "zero") role.MaxActiveSessions = 0
        if (fault === "minimum") role.MinActiveSessions = 1
        if (fault === "named") f.settings.config.NamedSessions.push({ Template: `dalph.${name}`, Dir: "fixture" })
        const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
        yield* Effect.flip(controller.launch("Installation task")).pipe(Effect.provide(f.layer))
        expect(f.events).not.toContain("native-cook")
        expect(f.paths.size).toBe(0)
        expect(f.state.modelCalls).toBe(0)
        expect(f.raw("root").metadata["dalph.native_launch"]).toBeUndefined()
      }
    }
  })
)

it.effect("native installation refuses an unqualified reviewer harness or permission and unbounded worker", () =>
  Effect.gen(function* () {
    for (const fault of ["harness", "permission", "worker-cap", "worker-zero"]) {
      const f = yield* nativeFixture
      const reviewer = f.settings.config.Agents.find((role) => role.Name === "native-reviewer")
      const worker = f.settings.config.Agents.find((role) => role.Name === "native-worker")
      if (!reviewer || !worker) throw new Error("missing interactive test roles")
      if (fault === "harness") reviewer.Provider = "unqualified"
      if (fault === "permission") reviewer.OptionDefaults = { permission_mode: "unknown" }
      if (fault === "worker-cap") worker.MaxActiveSessions = 3
      if (fault === "worker-zero") worker.MaxActiveSessions = 0
      const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
      yield* Effect.flip(controller.launch("Installation task")).pipe(Effect.provide(f.layer))
      expect(f.events).not.toContain("native-cook")
      expect(f.paths.size).toBe(0)
    }
  })
)

it.effect("native installation refuses effective native suspension on every required role before cook", () =>
  Effect.gen(function* () {
    for (const role of [
      "native-worker",
      "native-reviewer",
      "native-prepare",
      "native-review-prepare",
      "native-qualifier",
      "native-integrator"
    ]) {
      const f = yield* nativeFixture
      f.nativeState.suspendedRole = role
      const controller = makeNativeController(f.config, f.contract, f.commands, f.tracker, process.execPath)
      yield* Effect.flip(controller.launch("Installation task")).pipe(Effect.provide(f.layer))
      expect(f.events).not.toContain("native-cook")
      expect(f.paths.size).toBe(0)
      expect(f.state.modelCalls).toBe(0)
    }
  })
)

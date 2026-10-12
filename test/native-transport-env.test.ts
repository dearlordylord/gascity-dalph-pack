import { ConfigProvider, Duration, Effect, FileSystem } from "effect"
import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { nativeTransportEnvironment } from "../src/native/transport-environment.ts"
import { nativeLauncherSource } from "../src/native/launcher.ts"
import { runCommand } from "../src/quality/command.ts"

it.live("explicit native transport choices survive a clean native check environment", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const root = yield* fs.makeTempDirectoryScoped()
    const environment = yield* nativeTransportEnvironment.pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ GC_BEADS_PROXIED_NATIVE: "1", GC_BEADS_PROXIED_IDLE_TIMEOUT: "0" })
        )
      )
    )
    const helper = `${root}/observe.sh`
    yield* fs.writeFileString(helper, 'printf "%s,%s" "$GC_BEADS_PROXIED_NATIVE" "$GC_BEADS_PROXIED_IDLE_TIMEOUT"\n')
    const launcher = `${root}/check.sh`
    yield* fs.writeFileString(launcher, nativeLauncherSource(environment, "/bin/sh", helper, "review-gate"))
    const result = yield* runCommand({
      executable: "env",
      args: ["-i", "/bin/sh", launcher],
      timeout: Duration.seconds(5)
    })
    expect(result.stdout).toBe("1,0")
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
)

it.effect("native transport fixture defaults preserve the native rollout and idle defaults", () =>
  Effect.gen(function* () {
    const environment = yield* nativeTransportEnvironment.pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({})))
    )
    expect(environment).toEqual({ GC_BEADS_PROXIED_NATIVE: "0", GC_BEADS_PROXIED_IDLE_TIMEOUT: "30m" })
  })
)

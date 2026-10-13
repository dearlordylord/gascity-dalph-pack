import { defineConfig } from "vitest/config"
import { nativeAcceptanceFiles } from "./vitest.config.ts"
import { NativeCaseSequencer } from "./scripts/native-case-sequencer.ts"

export default defineConfig({
  test: {
    include: nativeAcceptanceFiles,
    maxWorkers: 2,
    maxConcurrency: 1,
    sequence: { concurrent: false, sequencer: NativeCaseSequencer },
    reporters: ["verbose"]
  }
})

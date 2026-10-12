import { defineConfig } from "vitest/config"
import { nativeAcceptanceFiles } from "./vitest.config.ts"

export default defineConfig({
  test: {
    include: nativeAcceptanceFiles,
    maxWorkers: 6,
    maxConcurrency: 4,
    sequence: { concurrent: true },
    reporters: ["verbose"]
  }
})

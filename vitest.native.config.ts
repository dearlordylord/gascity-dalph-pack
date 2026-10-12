import { defineConfig } from "vitest/config"
import { nativeAcceptanceFiles } from "./vitest.config.ts"

export default defineConfig({
  test: {
    include: nativeAcceptanceFiles,
    maxWorkers: 2,
    maxConcurrency: 2,
    sequence: { concurrent: true },
    reporters: ["verbose"]
  }
})

import { defineConfig } from "vitest/config"

const MINIMUM_COVERAGE = 99
/** Real city compatibility runs belong to the full native acceptance stage. */
export const nativeAcceptanceFiles = [
  "test/native-city.test.ts",
  "test/native-*-city.test.ts",
  "test/native-delivery.test.ts",
  "test/native-tracker-workflow.test.ts"
]
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: nativeAcceptanceFiles,
    maxWorkers: 3,
    pool: "forks",
    isolate: false,
    fsModuleCache: true,
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text-summary", "json", "html"],
      thresholds: {
        lines: MINIMUM_COVERAGE,
        functions: MINIMUM_COVERAGE,
        branches: MINIMUM_COVERAGE,
        statements: MINIMUM_COVERAGE
      }
    }
  }
})

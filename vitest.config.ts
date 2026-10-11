import { defineConfig } from "vitest/config"

const MINIMUM_COVERAGE = 99
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    maxWorkers: 2,
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

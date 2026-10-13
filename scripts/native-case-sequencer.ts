import { BaseSequencer, type TestSpecification } from "vitest/node"

// Start the measured critical paths before short compatibility fixtures.
// Ordering uses no cached outcome and never omits a scenario.
const criticalPaths = [
  "/test/native-review-blocking-city.test.ts",
  "/test/native-delivery.test.ts",
  "/test/native-review-restart-city.test.ts",
  "/test/native-review-restart-changed-city.test.ts",
  "/test/native-review-city.test.ts",
  "/test/native-city.test.ts"
]
const priority = (file: TestSpecification) => {
  const index = criticalPaths.findIndex((suffix) => file.moduleId.endsWith(suffix))
  return index < 0 ? criticalPaths.length : index
}

export class NativeCaseSequencer extends BaseSequencer {
  override sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return Promise.resolve(
      [...files].sort((left, right) => priority(left) - priority(right) || left.moduleId.localeCompare(right.moduleId))
    )
  }
}

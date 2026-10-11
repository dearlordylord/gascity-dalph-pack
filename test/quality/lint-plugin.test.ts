import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "../../src/quality/lint-plugin.ts"

RuleTester.describe = describe
RuleTester.it = it
const tester = new RuleTester({ languageOptions: { sourceType: "module" } })
const error = { messageId: "violation" }
tester.run("no-clock-read", plugin.rules["no-clock-read"], {
  valid: ["new Date(0)", "Clock.currentTimeMillis", "clock.now()"],
  invalid: ["Date.now()", "performance.now()", "new Date()"].map((code) => ({ code, errors: [error] }))
})
tester.run("no-double-type-assertion", plugin.rules["no-double-type-assertion"], {
  valid: [{ code: "const a = 1 as const", filename: "valid.ts" }],
  invalid: [{ code: "const a = x as unknown as string", filename: "invalid.ts", errors: [error] }]
})
tester.run("no-type-assertion", plugin.rules["no-type-assertion"], {
  valid: [{ code: "const a = 1 as const", filename: "valid.ts" }],
  invalid: ["const a = x as string", "const a = x as 'literal'"].map((code) => ({
    code,
    filename: "invalid.ts",
    errors: [error]
  }))
})
tester.run("no-test-mocks", plugin.rules["no-test-mocks"], {
  valid: ["other.mock()", "vi.expect()"],
  invalid: ["vi.mock()", "vi.spyOn()", "jest.mock()"].map((code) => ({ code, errors: [error] }))
})
tester.run("property-test-placement", plugin.rules["property-test-placement"], {
  valid: [{ code: "import fc from 'fast-check'", filename: "valid.property.test.ts" }, "import fc from 'other'"],
  invalid: ["import fc from 'fast-check'", "fc.property()"].map((code) => ({
    code,
    filename: "invalid.test.ts",
    errors: [error]
  }))
})
tester.run("require-canonical-effect-schema-import", plugin.rules["require-canonical-effect-schema-import"], {
  valid: ["import { Schema } from 'effect'", "import * as other from 'other'", "import { Effect } from 'effect'"],
  invalid: ["import * as other from 'effect'", "import { Schema as Other } from 'effect'"].map((code) => ({
    code,
    errors: [error]
  }))
})
tester.run("no-schema-primitive", plugin.rules["no-schema-primitive"], {
  valid: ["Schema.Number", "const { Number } = Schema"],
  invalid: ["Schema.NonNegativeInt", "const { NonNegativeInt } = Schema"].map((code) => ({ code, errors: [error] }))
})
tester.run("sort-destructure-keys", plugin.rules["sort-destructure-keys"], {
  valid: [
    "const { a, b } = obj",
    "const { b, a = b } = obj",
    "const { a, ...rest } = obj",
    "const { [key]: b } = obj",
    "const { 'a': a, 'b': b } = obj",
    "const { [true]: a } = obj"
  ],
  invalid: ["const { b, a } = obj", "const { 'b': b, 'a': a } = obj"].map((code) => ({ code, errors: [error] }))
})

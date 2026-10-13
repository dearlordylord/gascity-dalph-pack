import fc from "fast-check"
import { Schema } from "effect"
import { expect, it } from "vitest"
import { AbsolutePath } from "../src/domain/attempt.ts"
import { nativeProviderHealthArgs, nativeProviderRecovery } from "../src/native/provider-health.ts"
import { operationalRead } from "../src/native/operational-read.ts"

it("native recovery delegation cannot be granted by extra operands or environment overrides", () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom("a", "b", "1", "-"), { minLength: 1, maxLength: 12 }),
      fc.string({ maxLength: 30 }),
      (parts, operand) => {
        const request = nativeProviderHealthArgs(Schema.decodeUnknownSync(AbsolutePath)(`/city/${parts.join("")}`))
        expect(nativeProviderRecovery(request)).toBe(true)
        expect(operationalRead(request)).toBe(false)
        expect(nativeProviderRecovery([...request, operand])).toBe(false)
        expect(nativeProviderRecovery(["env", `GC_BEADS=${operand}`, ...request])).toBe(false)
        expect(nativeProviderRecovery(["sh", "-c", ...request])).toBe(false)
      }
    ),
    { numRuns: 40 }
  )
})

it("provider lifecycle effects require the exact scrubbed JSON health boundary", () => {
  const request = nativeProviderHealthArgs(Schema.decodeUnknownSync(AbsolutePath)("/city"))
  for (const args of [
    [],
    request.slice(1),
    request.slice(0, -1),
    request.slice(13),
    request.map((value) => (value === "/city" ? "relative" : value)),
    request.map((value) => (value === "health" ? "recover" : value)),
    request.map((value) => (value === "GC_SESSION_NAME" ? "GC_OTHER" : value)),
    request.map((value) => (value === "--json" ? "--quiet" : value))
  ])
    expect(nativeProviderRecovery(args)).toBe(false)
})

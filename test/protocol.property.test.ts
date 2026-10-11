import fc from "fast-check"
import { expect, it } from "vitest"
import { exactParents } from "../src/domain/candidate.ts"
import { canonical } from "../src/delivery/files.ts"
import { Schema } from "effect"

it("candidate parent order and cardinality are exact for arbitrary identities", () => {
  fc.assert(
    fc.property(fc.string(), fc.string(), (target, result) => {
      expect(exactParents([target, result], target, result)).toBe(true)
      expect(exactParents([target, result, target], target, result)).toBe(false)
      if (target !== result) expect(exactParents([result, target], target, result)).toBe(false)
    })
  )
})
it("canonical JSON retains every generated value", () => {
  fc.assert(
    fc.property(fc.jsonValue(), (value) => {
      const parsed = Schema.decodeUnknownSync(Schema.Json)(value)
      expect(JSON.parse(canonical(parsed))).toEqual(JSON.parse(JSON.stringify(value)))
    })
  )
})

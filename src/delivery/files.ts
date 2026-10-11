import { randomUUID } from "node:crypto"
import { open, rename } from "node:fs/promises"
import { dirname } from "node:path"
import type { Schema } from "effect"
import { Effect } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"

/** Atomic execution evidence; concurrent writers each own their staging file. */
export const persistReceipt = Effect.fn("Execution.persistReceipt")((path: string, value: Schema.Json) =>
  Effect.tryPromise({
    try: async () => {
      const temporary = `${path}.${randomUUID()}.pending`
      const file = await open(temporary, "wx")
      try {
        await file.writeFile(JSON.stringify(value))
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temporary, path)
      const directory = await open(dirname(path), "r")
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    },
    catch: (error) => new BoundaryFailure({ message: `Could not durably persist ${path}: ${String(error)}` })
  })
)

export function canonical(value: Schema.Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  return `{${Object.entries<Schema.Json>(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`
}

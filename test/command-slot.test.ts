import { Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { AttemptId, BirthTicks, CommitSha } from "../src/domain/shared.ts"
import { commandSlot, type CommandFacts, type CommandHistory } from "../src/delivery/command-slot.ts"

const attempt = AttemptId.make("attempt")
const birth = BirthTicks.make(1)
const commit = CommitSha.make("a".repeat(40))
const other = CommitSha.make("b".repeat(40))
const fixture = (facts: Readonly<Record<string, CommandFacts>>, writers: ReadonlyArray<number> = []) => {
  const reconciled: string[] = []
  const history: CommandHistory = {
    read: (prefix) => Effect.succeed(facts[prefix] ?? { reconciled: false }),
    writers: () => Effect.succeed(writers),
    reconcile: (prefix) =>
      Effect.sync(() => {
        reconciled.push(prefix)
      })
  }
  return { history, reconciled }
}
it.effect("admits a fresh exact execution", () =>
  Effect.gen(function* () {
    const { history } = fixture({})
    expect(yield* commandSlot(history, attempt, "model")).toEqual({ prefix: "model", ordinal: 1, accepted: false })
  })
)
it.effect("live writers fence even a retained success", () =>
  Effect.gen(function* () {
    const { history } = fixture(
      { model: { intent: { birth_ticks: birth }, finished: { exit: 0 }, reconciled: false } },
      [42]
    )
    expect((yield* Effect.flip(commandSlot(history, attempt, "model"))).message).toContain("active")
  })
)
it.effect("reconciles missing exit before another ordinal without fabricating success", () =>
  Effect.gen(function* () {
    const { history, reconciled } = fixture({ model: { intent: { birth_ticks: birth }, reconciled: false } })
    expect((yield* commandSlot(history, attempt, "model")).ordinal).toBe(2)
    expect(reconciled).toEqual(["model"])
  })
)
it.effect("accepts only the exact qualified commit", () =>
  Effect.gen(function* () {
    const { history } = fixture({ qualification: { finished: { exit: 0, commit }, reconciled: false } })
    expect((yield* commandSlot(history, attempt, "qualification", commit)).accepted).toBe(true)
    expect((yield* Effect.flip(commandSlot(history, attempt, "qualification", other))).message).toContain(
      "exact commit"
    )
  })
)
it.effect("a failed qualification requires diagnosis", () =>
  Effect.gen(function* () {
    const { history } = fixture({ qualification: { finished: { exit: 1, commit }, reconciled: false } })
    expect((yield* Effect.flip(commandSlot(history, attempt, "qualification", commit))).message).toContain("diagnose")
  })
)
it.effect("exhausts the finite model budget and respects prior reconciliation", () =>
  Effect.gen(function* () {
    const facts = {
      model: { finished: { exit: 1 }, reconciled: false },
      model_2: { reconciled: true },
      model_3: { finished: { exit: 1 }, reconciled: false }
    }
    const { history } = fixture(facts)
    expect((yield* Effect.flip(commandSlot(history, attempt, "model"))).message).toContain("exhausted")
  })
)

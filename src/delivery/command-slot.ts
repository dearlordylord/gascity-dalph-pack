import { Clock, Effect } from "effect"
import type { AttemptId, BirthTicks, CommitSha } from "../domain/shared.ts"
import { BoundaryFailure } from "../domain/shared.ts"

const COMMAND_BUDGET = 3
// Internal service ports; persisted input is decoded by the tracker adapter.
export interface CommandFacts {
  readonly intent?: { readonly birth_ticks: BirthTicks }
  readonly finished?: { readonly exit: number; readonly commit?: CommitSha }
  readonly reconciled: boolean
}
export interface CommandHistory<E = BoundaryFailure, R = never> {
  readonly read: (prefix: string) => Effect.Effect<CommandFacts, E, R>
  readonly writers: (attempt: AttemptId, birth: BirthTicks) => Effect.Effect<ReadonlyArray<number>, E, R>
  readonly reconcile: (
    prefix: string,
    attempt: AttemptId,
    birth: BirthTicks,
    observed: number
  ) => Effect.Effect<void, E, R>
}

const completed = (kind: "model" | "qualification", facts: CommandFacts, commit?: CommitSha) => {
  if (!facts.finished) return Effect.succeed(false)
  if (facts.finished.exit !== 0)
    return kind === "qualification"
      ? Effect.fail(
          new BoundaryFailure({ message: "qualification failed; diagnose retained gate evidence before repair" })
        )
      : Effect.succeed(false)
  if (commit !== undefined && facts.finished.commit !== commit) {
    return Effect.fail(new BoundaryFailure({ message: "qualification receipt does not accept this exact commit" }))
  }
  return Effect.succeed(true)
}

const guardWriters = Effect.fn("Delivery.guardWriters")(function* <E, R>(
  history: CommandHistory<E, R>,
  attempt: AttemptId,
  kind: string,
  facts: CommandFacts
) {
  if (facts.intent && (yield* history.writers(attempt, facts.intent.birth_ticks)).length > 0) {
    return yield* new BoundaryFailure({ message: `exact ${kind} writers still active; retain attempt` })
  }
})

export const commandSlot = Effect.fn("Delivery.commandSlot")(function* <E, R>(
  history: CommandHistory<E, R>,
  attempt: AttemptId,
  kind: "model" | "qualification",
  commit?: CommitSha
) {
  for (let ordinal = 1; ordinal <= COMMAND_BUDGET; ordinal++) {
    const prefix = ordinal === 1 ? kind : `${kind}_${ordinal}`
    const facts = yield* history.read(prefix)
    yield* guardWriters(history, attempt, kind, facts)
    if (yield* completed(kind, facts, commit)) return { prefix, ordinal, accepted: true }
    if (facts.finished || facts.reconciled) continue
    if (facts.intent) {
      const observed = yield* Clock.currentTimeMillis
      yield* history.reconcile(prefix, attempt, facts.intent.birth_ticks, observed)
      continue
    }
    return { prefix, ordinal, accepted: false }
  }
  return yield* new BoundaryFailure({ message: `${kind} command budget exhausted; retain task and evidence` })
})

import { Effect } from "effect"
import { BoundaryFailure } from "../domain/shared.ts"
import type { Bead, Commands, makeTracker } from "../delivery/tracker.ts"
import type { RuntimeConfig } from "../delivery/config.ts"
import { NativeAttempt, NativeProposal, type NativeSession } from "./contract.ts"
import { completedReassignedProducer } from "./completed-producer.ts"
import { completedReassignedWork } from "./completed-work.ts"
import { isExecutionMetadata } from "./nodes.ts"

const historicalWriter = (row: Bead, session: typeof NativeSession.Type) => {
  const metadata = row.metadata ?? {}
  return (
    metadata["gc.session_id"] === session.id &&
    ["work", "fix", "review"].includes(metadata["dalph.phase"] ?? "") &&
    isExecutionMetadata(metadata)
  )
}
/** Native completed nodes remain observable when their pool session moves outside this graph. */
export const historicalWritersStopped = Effect.fn("Native.historicalWritersStopped")(function* (
  config: RuntimeConfig,
  commands: Commands,
  tracker: ReturnType<typeof makeTracker>,
  rows: ReadonlyArray<Bead>,
  path: string,
  session: typeof NativeSession.Type
) {
  const original = rows.filter((row) => historicalWriter(row, session))
  for (const row of original) {
    if (row.metadata?.["dalph.phase"] === "work") {
      const attempt = yield* tracker.fact(row.id, "native_attempt", NativeAttempt)
      const proposal = yield* tracker.fact(row.id, "native_proposal", NativeProposal)
      if (!attempt || !proposal)
        return yield* new BoundaryFailure({ message: "historical native producer facts are missing" })
      yield* completedReassignedProducer(config, commands, tracker, attempt, proposal, session)
    } else
      yield* completedReassignedWork(
        config,
        commands,
        tracker,
        { node: row.id, path, template: row.metadata?.["gc.run_target"] },
        session
      )
  }
  return original.length > 0
})

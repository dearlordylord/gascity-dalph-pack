import { basename } from "node:path"
import { Effect, Schema } from "effect"
import { AbsolutePath } from "../domain/attempt.ts"
import type { Bead, makeTracker } from "../delivery/tracker.ts"
import { NativeAttempt } from "./contract.ts"

/** Reviewer/fix nodes declare their original attempt and native workspace slug, not a duplicated locator. */
export const nodeWorkspaceMatches = Effect.fn("Native.nodeWorkspaceMatches")(function* (
  tracker: ReturnType<typeof makeTracker>,
  node: Bead,
  pathInput: string
) {
  const path = yield* Schema.decodeUnknownEffect(AbsolutePath)(pathInput)
  const metadata = node.metadata ?? {}
  if (metadata["gc.work_dir"] !== undefined) return metadata["gc.work_dir"] === path
  const attempt = yield* tracker.fact(node.id, "native_attempt", NativeAttempt)
  return attempt?.plan.path === path && metadata["gc.pack_workspace"] === basename(path)
})

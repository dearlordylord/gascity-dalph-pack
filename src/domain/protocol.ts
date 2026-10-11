import { Effect } from "effect"
import { BoundaryFailure } from "./shared.ts"

export const worktreeAction = (prepared: boolean, exists: boolean) =>
  prepared && !exists
    ? Effect.fail(new BoundaryFailure({ message: "prepared attempt worktree lost; preserve the attempt" }))
    : Effect.succeed(exists ? "verify" : "ensure")

export const authorizeCleanup = (published: boolean, stopped: boolean) =>
  published && stopped
    ? Effect.void
    : Effect.fail(
        new BoundaryFailure({ message: "cleanup retains resources until publication and stopped-writer proof" })
      )

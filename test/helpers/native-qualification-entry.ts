import { Effect } from "effect"
import { NodeServices } from "@effect/platform-node"
import { holdQualification } from "./native-qualification-cut.ts"

// This ESM entry is the fixture's foreign integration boundary. Await only
// here: injecting an async module into CJS dependencies changes their loading.
// The real CLI retains its own NodeRuntime lifecycle after the barrier.
if (process.argv[2] === "qualify")
  await Effect.runPromise(holdQualification.pipe(Effect.scoped, Effect.provide(NodeServices.layer)))

await import("../../scripts/native.ts")

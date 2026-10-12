import { Effect, Schema } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { qualityGate } from "./quality-gate.ts"
import { qualityOutput } from "./quality-output.ts"

NodeRuntime.runMain(
  Schema.decodeUnknownEffect(Schema.Literals(["fast", "all"]))(process.argv[2] ?? "fast").pipe(
    Effect.flatMap((mode) => qualityGate(mode, qualityOutput)),
    Effect.provide(NodeServices.layer)
  )
)

import { Effect } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { qualityGate } from "./quality-gate.ts"
import { qualityOutput } from "./quality-output.ts"

NodeRuntime.runMain(qualityGate("fast", qualityOutput).pipe(Effect.provide(NodeServices.layer)))

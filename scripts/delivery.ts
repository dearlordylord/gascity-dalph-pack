import { Config, Effect, FileSystem, Option, Layer, Schema, Logger } from "effect"
import { NodeHttpClient, NodeRuntime, NodeServices } from "@effect/platform-node"
import { AbsolutePath } from "../src/domain/attempt.ts"
import { BoundaryFailure } from "../src/domain/shared.ts"
import { configuration } from "../src/delivery/config.ts"
import { makeCommands } from "../src/delivery/command.ts"
import { makeTracker } from "../src/delivery/tracker.ts"
import { makeGit } from "../src/delivery/git.ts"
import { makeWorktrees } from "../src/delivery/worktrees.ts"
import { makeStages } from "../src/delivery/stages.ts"
import { makeWorkflow } from "../src/delivery/workflow.ts"

const main = Effect.gen(function* () {
  const role = yield* Schema.decodeUnknownEffect(Schema.Literals(["worker", "integrator"]))(process.argv[2])
  const configured = yield* configuration
  const contract = yield* Config.option(Config.schema(AbsolutePath, "DALPH_PROJECT_CONTRACT_PATH"))
  const fault = yield* Config.option(Config.String("DALPH_FAULT_AFTER_PUSH"))
  const config = {
    ...configured,
    ...(Option.isSome(contract) ? { contract: contract.value } : {}),
    ...(Option.isSome(fault) ? { faultAfterPush: fault.value } : {})
  }
  const fs = yield* FileSystem.FileSystem
  yield* fs.makeDirectory(`${config.root}/evidence`, { recursive: true })
  const commands = yield* makeCommands
  if ((yield* commands.execute(config.root, ["getconf", "CLK_TCK"])) !== "100") {
    return yield* new BoundaryFailure({ message: "Unsupported Linux clock tick profile" })
  }
  const tracker = makeTracker(config, commands)
  const git = makeGit(config, commands)
  const worktrees = makeWorktrees(config, commands, tracker, git)
  const stages = makeStages(config, commands, tracker, git)
  yield* Effect.log(`Native Gas City ${role} turn started`)
  const session = yield* Config.schema(Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_.-]+$/)), "GC_SESSION_ID")
  const logdir = `${config.root}/evidence/sessions`
  yield* fs.makeDirectory(logdir, { recursive: true })
  yield* makeWorkflow(config, commands, tracker, git, stages, worktrees)
    .run(role)
    .pipe(
      Effect.tapCause((cause) => Effect.logError(cause)),
      Effect.provide(
        Logger.layer(
          [Logger.toFile(Logger.formatLogFmt, `${logdir}/${session}.log`, { flag: "a", batchWindow: "100 millis" })],
          { mergeWithExisting: true }
        )
      )
    )
  yield* Effect.log("Exact claimed turn completed")
})
NodeRuntime.runMain(main.pipe(Effect.provide(Layer.merge(NodeHttpClient.layerUndici, NodeServices.layer))))

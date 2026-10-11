import { Duration, Effect } from "effect"
import { expect, it } from "@effect/vitest"
import { BoundaryFailure } from "../src/domain/shared.ts"
import { CommandRejected } from "../src/delivery/command.ts"
import type { Commands } from "../src/delivery/tracker.ts"
import type { Claim } from "../src/delivery/tracker-observation.ts"
import { nativeClaimBoundary } from "./helpers/native-tracker-fixture.ts"

const receipt = {
  schema_version: "1",
  ok: true,
  command: "hook",
  action: "work",
  reason: "claimed",
  bead_id: "task",
  assignee: "fixture/dalph.worker",
  route: "fixture/dalph.worker"
}
const gc = ["gc", "--city", "/city", "--rig", "fixture"]
const claim = [...gc, "hook", "--claim", "--drain-ack", "--json"]
const ready = [...gc, "ready", "--status", "in_progress", "--limit", "0", "--json"]
const stateFor = () => ({ readsFail: true, claims: [] as Array<typeof Claim.Type> })

it.effect("F1 forwards discovery verbatim without claim decoding or observation", () =>
  Effect.gen(function* () {
    const state = stateFor()
    const calls: Array<Parameters<Commands["execute"]>> = []
    const response = '[{"id":"task","metadata":{"dalph.runtime":"native-v1"}}]'
    const execute = nativeClaimBoundary(state, (...args) => {
      calls.push(args)
      return Effect.succeed(response)
    })
    const args = [...gc, "hook", "--json"]
    const timeout = Duration.seconds(30)
    expect(yield* execute("/root", args, "/cwd", timeout)).toBe(response)
    expect(calls).toEqual([["/root", args, "/cwd", timeout, undefined]])
    expect(state.claims).toEqual([])
  })
)

for (const discovery of [false, true])
  it.effect(`F2/F4 preserves ${discovery ? "discovery-then-claim" : "claim-first"} chronology and resume`, () =>
    Effect.gen(function* () {
      const state = stateFor()
      const calls: Array<ReadonlyArray<string>> = []
      const execute = nativeClaimBoundary(state, (_root, args) => {
        calls.push(args)
        return Effect.succeed(
          args.includes("--claim")
            ? JSON.stringify({ ...receipt, reason: state.claims.length ? "existing_assignment" : "claimed" })
            : "[]"
        )
      })
      if (discovery) {
        expect(yield* execute("/root", [...gc, "hook", "--json"])).toBe("[]")
        expect(yield* execute("/root", ready)).toBe("[]")
        expect(state.claims).toEqual([])
      }
      expect(yield* execute("/root", claim)).toBe(JSON.stringify(receipt))
      expect(state.claims).toEqual([receipt])
      expect((yield* Effect.flip(execute("/root", ready))).message).toBe("tracker unavailable")
      expect(calls).toEqual(discovery ? [[...gc, "hook", "--json"], ready, claim] : [claim])
      state.readsFail = false
      expect(yield* execute("/root", ready)).toBe("[]")
      yield* execute("/root", claim)
      expect(state.claims).toEqual([receipt, { ...receipt, reason: "existing_assignment" }])
    })
  )

it.effect("F3 failed, ambiguous and malformed claims cannot arm injection or fabricate receipts", () =>
  Effect.gen(function* () {
    const state = stateFor()
    for (const failure of [
      new BoundaryFailure({ message: "native failed" }),
      new CommandRejected({ message: "ambiguous native response", receipt: "/receipt" })
    ]) {
      const execute = nativeClaimBoundary(state, () => Effect.fail(failure))
      expect(yield* Effect.flip(execute("/root", claim))).toBe(failure)
    }
    for (const response of ["[]", JSON.stringify({ ...receipt, ok: false }), JSON.stringify({ action: "work" })]) {
      const execute = nativeClaimBoundary(state, () => Effect.succeed(response))
      expect((yield* Effect.flip(execute("/root", claim)))._tag).toBe("SchemaError")
    }
    expect(state.claims).toEqual([])
    const execute = nativeClaimBoundary(state, () => Effect.succeed("[]"))
    expect(yield* execute("/root", ready)).toBe("[]")
    expect(yield* execute("/root", ["git", "hook", "--claim"])).toBe("[]")
    expect(state.claims).toEqual([])
  })
)

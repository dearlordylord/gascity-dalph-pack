import { Effect, Schema } from "effect"
import { expect, it } from "@effect/vitest"
import { nativeFixture } from "./helpers/native-fixture.ts"
import { BeadId } from "../src/domain/shared.ts"
import { ProductLaunchIntent } from "../src/native/product-contract.ts"
import { observeProductBatch } from "../src/native/product-observation.ts"
import { validateRetainedLaunch } from "../src/native/product-controller.ts"
import type { Bead } from "../src/delivery/tracker.ts"

const productFixture = Effect.gen(function* () {
  const f = yield* nativeFixture
  f.rows.clear()
  const intent = yield* Schema.decodeUnknownEffect(ProductLaunchIntent)({
    version: 1,
    workflow: "product",
    completion: "completion",
    launch: "launch",
    task: "a",
    instruction: "Implement only A",
    workspace: "work-a",
    check: "/fixture/check",
    reviewCheck: "/fixture/review",
    contract: f.contract
  })
  const variables = {
    instruction: intent.instruction,
    workspace: intent.workspace,
    agent: f.contract.agent,
    reviewer: "fixture/dalph.native-reviewer",
    pack: f.config.pack,
    check: intent.check,
    review_check: intent.reviewCheck,
    product_workflow: intent.workflow,
    product_completion: intent.completion,
    product_launch: intent.launch
  }
  f.rows.set("batch", {
    id: BeadId.make("batch"),
    status: "open",
    metadata: {
      "gc.kind": "workflow",
      "gc.formula_name": "native-product-task",
      ...Object.fromEntries(Object.entries(variables).map(([key, value]) => [`gc.var.${key}`, value]))
    }
  })
  const binding = {
    "gc.root_bead_id": "batch",
    "dalph.product_workflow": "product",
    "dalph.product_completion": "completion",
    "dalph.product_launch": "launch"
  }
  for (const phase of ["activation", "prepare", "work", "qualify", "deliver", "product-settlement", "scope"]) {
    f.rows.set(phase, {
      id: BeadId.make(phase),
      status: "open",
      metadata: { ...binding, "dalph.phase": phase === "activation" ? "product-activation" : phase }
    })
  }
  Object.assign(f.raw("prepare"), { needs: ["activation"] })
  f.raw("work").description = intent.instruction
  f.raw("work").metadata["gc.pack_workspace"] = intent.workspace
  f.raw("work").metadata["gc.run_target"] = f.contract.agent
  f.raw("scope").metadata["gc.kind"] = "scope"
  f.raw("scope").metadata["gc.scope_name"] = "delivery"
  f.rows.set("review-control", {
    id: BeadId.make("review-control"),
    status: "open",
    metadata: {
      ...binding,
      "gc.kind": "ralph",
      "gc.step_id": "review",
      "gc.step_ref": "native-product-task.review",
      "gc.max_attempts": "4",
      "dalph.phase": "review-control"
    }
  })
  f.rows.set("review", { id: BeadId.make("review"), status: "open", metadata: { ...binding, "dalph.phase": "review" } })
  Object.assign(f.raw("work"), { needs: ["prepare"] })
  Object.assign(f.raw("review"), { needs: ["work"] })
  Object.assign(f.raw("review-control"), { needs: ["review"] })
  Object.assign(f.raw("qualify"), { needs: ["review-control"] })
  Object.assign(f.raw("deliver"), { needs: ["qualify"] })
  return { f, intent }
})
for (const foreign of [false, true]) {
  it.effect(`recovery ${foreign ? "refuses foreign" : "accepts exact"} native Ralph iteration ownership`, () =>
    Effect.gen(function* () {
      const { f, intent } = yield* productFixture
      f.rows.set("iteration", {
        id: BeadId.make("iteration"),
        status: "closed",
        metadata: {
          "gc.root_bead_id": "batch",
          "gc.kind": "scope",
          "gc.logical_bead_id": foreign ? "foreign-owner" : "review-control"
        }
      })
      Object.assign(f.raw("iteration"), { needs: ["review"] })
      Object.assign(f.raw("review-control"), { needs: ["work", "iteration"] })
      Object.assign(f.raw("review"), {
        needs: [],
        dependencies: [{ issue_id: "review", depends_on_id: "iteration", type: "tracks" }]
      })
      const result = yield* observeProductBatch(f.config, intent).pipe(Effect.result, Effect.provide(f.layer))
      expect(result._tag).toBe(foreign ? "Failure" : "Success")
    })
  )
}
it.effect("recovery refuses foreign retained intent even before batch observation exists", () =>
  Effect.gen(function* () {
    const { intent } = yield* productFixture
    const launcher: Bead = {
      id: BeadId.make("launch"),
      status: "open",
      description: intent.instruction,
      metadata: { "dalph.product_task": "a" }
    }
    const result = yield* validateRetainedLaunch(BeadId.make("different-product"), launcher, intent, null, []).pipe(
      Effect.result
    )
    expect(result._tag).toBe("Failure")
  })
)
it.effect("product observation accepts one complete exact authored batch", () =>
  Effect.gen(function* () {
    const { f, intent } = yield* productFixture
    expect(yield* observeProductBatch(f.config, intent).pipe(Effect.provide(f.layer))).toEqual({
      root: "batch",
      activation: "activation"
    })
  })
)
for (const fault of [
  "partial",
  "workspace",
  "variables",
  "unblocked",
  "failed",
  "foreign",
  "missing-review",
  "broken-chain"
] as const) {
  it.effect(`product observation refuses ${fault} before activation or resume`, () =>
    Effect.gen(function* () {
      const { f, intent } = yield* productFixture
      if (fault === "missing-review") f.rows.delete("review-control")
      if (fault === "broken-chain") Object.assign(f.raw("deliver"), { needs: [] })
      if (fault === "partial") f.rows.delete("deliver")
      if (fault === "workspace") f.raw("work").metadata["gc.pack_workspace"] = "work-other"
      if (fault === "variables") f.raw("batch").metadata["gc.var.check"] = "/foreign/check"
      if (fault === "unblocked") Object.assign(f.raw("prepare"), { needs: [] })
      if (fault === "failed") f.raw("batch").metadata.molecule_failed = "true"
      if (fault === "foreign") f.raw("work").metadata["dalph.product_completion"] = "other-completion"
      yield* Effect.flip(observeProductBatch(f.config, intent).pipe(Effect.provide(f.layer)))
      expect(f.events).not.toContain("native-cook")
      expect(f.raw("activation").status).toBe("open")
    })
  )
}

import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { productFrame, ProductBeadsResponse } from "../src/dashboard/product.ts"
import { RunDetail } from "../src/dashboard/run.ts"
import { project } from "../src/dashboard/projection.ts"
const detail = Schema.decodeUnknownSync(RunDetail)({
  runId: "product",
  title: "native-product-diamond",
  nodes: [],
  edges: [],
  progress: { terminal: false },
  completeness: { kind: "complete" }
})
const rows = Schema.decodeUnknownSync(ProductBeadsResponse)({
  schema_version: "1",
  ok: true,
  store_ref: "rig:demo",
  beads: [
    { id: "product", status: "open", metadata: { "gc.formula_name": "native-product-diamond" } },
    ...["a", "b", "c", "d"].flatMap((task) => [
      {
        id: task,
        status: "open",
        title: `Task ${task}`,
        metadata: { "gc.root_bead_id": "product", "dalph.phase": "product-completion", "dalph.product_task": task }
      },
      {
        id: task + "-launch",
        status: "open",
        metadata: { "gc.root_bead_id": "product", "dalph.phase": "product-launch", "dalph.product_task": task },
        dependencies: (task === "a" ? [] : task === "d" ? ["b", "c"] : ["a"]).map((id) => ({
          issue_id: task + "-launch",
          depends_on_id: id,
          type: "blocks"
        }))
      }
    ]),
    {
      id: "b-work",
      status: "open",
      assignee: "worker",
      metadata: {
        "dalph.product_workflow": "product",
        "dalph.product_completion": "b",
        "dalph.phase": "work",
        "gc.session_id": "session"
      }
    }
  ]
}).beads
it("four product squares preserve fork/join and claimed phase detail", () => {
  const productTasks = productFrame(detail, rows)
  if (!productTasks) throw Error("missing product frame")
  const result = project({ ...detail, productTasks })
  expect(result.tasks).toHaveLength(4)
  expect(result.edges).toHaveLength(4)
  expect(result.tasks.find((task) => task.id === "b")?.display?.tone).toBe("running")
  expect(productTasks.find((task) => task.id === "d")?.status).toBe("pending")
})
it("partial product metadata cannot replace a complete observed frame", () => {
  expect(() =>
    productFrame(
      detail,
      rows.filter((row) => row.id !== "c")
    )
  ).toThrow("Incomplete product completion")
})
it("missing all completion rows retains the authored product identity as incomplete", () => {
  expect(() =>
    productFrame(
      detail,
      rows.filter((row) => row.metadata?.["dalph.phase"] !== "product-completion")
    )
  ).toThrow("Incomplete product completion")
})

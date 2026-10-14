import { Schema } from "effect"
import { Bead } from "../delivery/tracker-observation.ts"
import { Identity, type RunDetail } from "./run.ts"
const PRODUCT_TASK_COUNT = 4
const ProductBead = Schema.Struct({ ...Bead.fields, title: Schema.optionalKey(Schema.String) })
type Row = typeof ProductBead.Type
export const ProductBeadsResponse = Schema.Struct({
  schema_version: Schema.Literal("1"),
  ok: Schema.Literal(true),
  store_ref: Schema.String,
  beads: Schema.Array(ProductBead)
})
const metadata = (row: Row) => row.metadata ?? {}
const status = (row: Row) => {
  if (row.status === "closed")
    return ["fail", "skipped"].includes(metadata(row)["gc.outcome"] ?? "") ? "failed" : "completed"
  return row.status === "in_progress" ? "running" : "pending"
}
const activeClaim = (row: Row) =>
  row.status === "in_progress" || (row.status !== "closed" && !!row.assignee && !!metadata(row)["gc.session_id"])
const phasesFor = (rows: ReadonlyArray<Row>, root: string, completion: string) =>
  rows.filter((row) => {
    const meta = metadata(row)
    return (
      meta["dalph.product_completion"] === completion &&
      meta["dalph.product_workflow"] === root &&
      !!meta["dalph.phase"] &&
      !["spec", "ralph", "retry", "check", "scope", "scope-check"].includes(meta["gc.kind"] ?? "")
    )
  })
const launchFor = (rows: ReadonlyArray<Row>, root: string, task: string) => {
  const matches = rows.filter((row) => {
    const meta = metadata(row)
    return (
      meta["gc.root_bead_id"] === root &&
      meta["dalph.phase"] === "product-launch" &&
      meta["dalph.product_task"] === task
    )
  })
  if (matches.length !== 1 || !matches[0]) throw new Error("Missing exact product launch observation")
  return matches[0]
}
const dependencies = (launch: Row, completions: ReadonlyArray<Row>) => {
  const blockers = new Set([
    ...(launch.needs ?? []),
    ...(launch.dependencies ?? []).filter((dep) => dep.type === "blocks").map((dep) => dep.depends_on_id)
  ])
  return completions.filter((row) => blockers.has(row.id)).map((row) => Identity.make(row.id))
}
const taskStatus = (
  completion: Row,
  phases: ReadonlyArray<Row>,
  prerequisites: ReadonlyArray<string>,
  completions: ReadonlyArray<Row>
) => {
  if (completion.status === "closed" && metadata(completion)["dalph.product_delivery"]) return "completed"
  if (phases.some(activeClaim)) return "running"
  if (phases.some((row) => row.status === "closed" && metadata(row)["gc.outcome"] === "fail")) return "failed"
  return prerequisites.every((id) => completions.find((row) => row.id.toString() === id)?.status === "closed")
    ? "ready"
    : "pending"
}
const phaseLabel = (row: Row) => {
  const meta = metadata(row)
  return [meta["dalph.phase"], meta["gc.outcome"], meta["gc.failure_class"], meta["gc.controller_error"]]
    .filter(Boolean)
    .join(" · ")
}
const phaseNode = (row: Row) => ({
  id: Identity.make(row.id),
  title: row.title ?? phaseLabel(row),
  status: status(row),
  currentBeadId: row.id,
  visibleInGraph: false,
  constructKind: metadata(row)["gc.kind"] ?? "task",
  executionInstances: [{ beadId: row.id, status: status(row), label: phaseLabel(row) }]
})
const taskFrame = (detail: RunDetail, rows: ReadonlyArray<Row>, completions: ReadonlyArray<Row>, completion: Row) => {
  const task = metadata(completion)["dalph.product_task"] ?? ""
  const launch = launchFor(rows, detail.runId, task)
  const phases = phasesFor(rows, detail.runId, completion.id)
  const prerequisites = dependencies(launch, completions)
  const observedStatus = taskStatus(completion, phases, prerequisites, completions)
  const active = phases.find(activeClaim)
  const phase = active ? (metadata(active)["dalph.phase"] ?? "work") : "work"
  return {
    id: Identity.make(completion.id),
    title: completion.title ?? `Product task ${task.toUpperCase()}`,
    status: observedStatus,
    phase: observedStatus === "completed" ? "delivery" : phase,
    prerequisites,
    nodes: phases.map(phaseNode)
  }
}
/** Join authored product barriers with exact native task phases; no scheduling authority. */
export const productFrame = (detail: RunDetail, rows: ReadonlyArray<Row>) => {
  const completions = rows.filter(
    (row) => metadata(row)["gc.root_bead_id"] === detail.runId && metadata(row)["dalph.phase"] === "product-completion"
  )
  if (!completions.length) {
    const root = rows.find((row) => row.id.toString() === detail.runId.toString())
    if (!root) throw new Error("Missing exact workflow identity")
    if (metadata(root)["gc.formula_name"] === "native-product-diamond" || metadata(root)["dalph.product_graph"])
      throw new Error("Incomplete product completion observation")
    return undefined
  }
  const tasks = new Set(completions.map((row) => metadata(row)["dalph.product_task"]))
  if (completions.length !== PRODUCT_TASK_COUNT || tasks.size !== PRODUCT_TASK_COUNT)
    throw new Error("Incomplete product completion observation")
  return completions.map((completion) => taskFrame(detail, rows, completions, completion))
}

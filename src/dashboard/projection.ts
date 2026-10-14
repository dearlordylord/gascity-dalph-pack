import type { RunDetail } from "./run.ts"
import { observedTasks, taskId } from "./tasks.ts"
import type { DeliveryGraphProjection } from "../../dashboard/vendor/delivery-graph-element.ts"
const positionClasses = (status: string): ReadonlyArray<"frontier" | "held"> =>
  status === "ready" ? ["frontier"] : ["running", "active"].includes(status) ? ["held"] : []

// Read-only display facts; the native supervisor remains workflow authority.
export const project = (detail: RunDetail): DeliveryGraphProjection => {
  const nodes = observedTasks(detail)
  const ids = new Set(nodes.map((node) => node.id))
  const sourceEdges = detail.productTasks
    ? detail.productTasks.flatMap((task) => task.prerequisites.map((from) => ({ from, to: task.id, kind: "blocks" })))
    : detail.edges
  const edges = sourceEdges
    .filter((edge) => !["parent", "parent-child", "contains"].includes(edge.kind))
    .map((edge) => ({ from: taskId(edge.from), to: taskId(edge.to), kind: "Prerequisite" as const }))
    .filter((edge) => edge.from !== edge.to && ids.has(edge.from) && ids.has(edge.to))
  const uniqueEdges = Array.from(new Map(edges.map((edge) => [JSON.stringify(edge), edge])).values())
  return {
    key: detail.runId,
    fingerprint: JSON.stringify([nodes, uniqueEdges]),
    status: detail.progress.terminal ? "Run finished" : "Live Gas City observation",
    tasks: nodes.map((n) => ({
      id: n.id,
      title: n.title,
      lifecycle: `${n.phase} · ${n.status}`,
      display: {
        tone: ["completed", "done"].includes(n.status)
          ? "settled"
          : ["running", "active"].includes(n.status)
            ? n.phase === "delivery"
              ? "integrating"
              : "running"
            : n.status === "ready"
              ? "desired"
              : n.status === "failed"
                ? "paused"
                : "blocked",
        classes: positionClasses(n.status),
        labels: [n.phase, ...(n.status === "ready" ? ["Frontier: ready"] : [])]
      }
    })),
    edges: uniqueEdges
  }
}

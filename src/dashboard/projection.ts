import type { RunDetail } from "./run.ts"
import type { DeliveryGraphProjection } from "../../dashboard/vendor/delivery-graph-element.ts"
const positionClasses = (status: string): ReadonlyArray<"frontier" | "held"> =>
  status === "ready" ? ["frontier"] : ["running", "active"].includes(status) ? ["held"] : []

// Read-only display facts; the native supervisor remains workflow authority.
export const project = (detail: RunDetail, showGrouping = false): DeliveryGraphProjection => {
  const nodes = detail.nodes.filter(
    (n) => n.visibleInGraph !== false && (showGrouping || n.constructKind !== "run-root")
  )
  const edges = detail.edges.filter((e) => showGrouping || !["parent", "parent-child", "contains"].includes(e.kind))
  return {
    key: detail.runId,
    fingerprint: JSON.stringify([nodes, edges]),
    status: detail.progress.terminal ? "Run finished" : "Live Gas City observation",
    tasks: nodes.map((n) => ({
      id: n.id,
      title: n.title,
      lifecycle: n.status,
      display: {
        tone: ["completed", "done"].includes(n.status)
          ? "settled"
          : ["running", "active"].includes(n.status)
            ? n.title.includes("deliver")
              ? "integrating"
              : "running"
            : n.status === "ready"
              ? "desired"
              : n.status === "failed"
                ? "paused"
                : "blocked",
        classes: positionClasses(n.status),
        labels: n.status === "ready" ? ["Frontier: ready"] : []
      }
    })),
    edges: edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: ["parent", "parent-child", "contains"].includes(e.kind) ? "Grouping" : "Prerequisite"
    }))
  }
}

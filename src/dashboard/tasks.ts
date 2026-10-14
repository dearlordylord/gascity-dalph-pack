import type { GraphNode, RunDetail } from "./run.ts"

/** Pack formula step identities pair work and delivery for one product task. */
export const taskId = (id: string): string => id.replace(/-(work|deliver)$/, "")
export const completed = (status: string): boolean => ["completed", "done"].includes(status)
export interface ObservedTask {
  readonly id: string
  readonly title: string
  readonly status: string
  readonly phase: string
  readonly nodes: ReadonlyArray<GraphNode>
}
const phaseNode = (nodes: readonly [GraphNode, ...GraphNode[]]): GraphNode => {
  const work = nodes.find((node) => node.id.endsWith("-work"))
  if (work && !completed(work.status)) return work
  return nodes.find((node) => node.id.endsWith("-deliver")) ?? work ?? nodes[0]
}
/** Derives a display frame only; it cannot claim, schedule, or persist workflow facts. */
export const observedTasks = (detail: RunDetail): ReadonlyArray<ObservedTask> => {
  if (detail.productTasks) return detail.productTasks
  const groups = new Map<string, [GraphNode, ...GraphNode[]]>()
  for (const node of detail.nodes) {
    if (!node.visibleInGraph || node.constructKind === "run-root" || node.id.endsWith(".workflow-finalize")) continue
    const id = taskId(node.id)
    const group = groups.get(id)
    if (group) group.push(node)
    else groups.set(id, [node])
  }
  return Array.from(groups, ([id, nodes]) => {
    const current = phaseNode(nodes)
    return {
      id,
      title: nodes[0].title.replace(/: (work|deliver)$/, ""),
      status: current.id.endsWith("-work") && completed(current.status) ? "pending" : current.status,
      phase: current.id.endsWith("-deliver") ? ("delivery" as const) : ("work" as const),
      nodes
    }
  })
}

import type { ElementDefinition } from "cytoscape"
import type dagre from "cytoscape-dagre"
import {
  deliveryGraphEncoding,
  type DeliveryGraphEdge,
  type DeliveryGraphProjection,
  type DeliveryGraphTask
} from "./delivery-graph-element.ts"

const MAXIMUM_TITLE_LENGTH = 42
const TRUNCATED_TITLE_LENGTH = 39
interface RenderedTask extends DeliveryGraphTask {
  readonly missing: boolean
}

interface CytoscapeTaskData {
  readonly id: string
  readonly label: string
  readonly lifecycle: string
  readonly missing: "false" | "true"
}

export type DeliveryGraphPalette = "original" | "trace-fill"

export const deliveryGraphPalette = (value: string | undefined): DeliveryGraphPalette =>
  value === "trace-fill" ? value : "original"

const placeholderTask = (id: string): RenderedTask => ({
  id,
  lifecycle: "Missing endpoint",
  missing: true,
  title: "Referenced by an edge but absent from this projection"
})

export const renderedTasks = (projection: DeliveryGraphProjection): ReadonlyArray<RenderedTask> => {
  const taskById = new Map<string, RenderedTask>(projection.tasks.map((task) => [task.id, { ...task, missing: false }]))
  for (const edge of projection.edges) {
    if (!taskById.has(edge.from)) taskById.set(edge.from, placeholderTask(edge.from))
    if (!taskById.has(edge.to)) taskById.set(edge.to, placeholderTask(edge.to))
  }
  return [...taskById.values()]
}

const safeClassToken = (value: string): string | undefined => {
  const token = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
  return token.length === 0 ? undefined : `display-${token}`
}

export const taskLabel = (task: RenderedTask): string =>
  [task.id, task.title, task.lifecycle, ...(task.display?.labels ?? [])]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join("\n")

const compactVisualFact = (label: string): string | undefined => {
  if (label === "Held position: none" || label === "Delivery: none" || label === "Settlement: none") return undefined
  if (label.startsWith("Held position:")) return "Held: active"
  if (label.startsWith("Settlement:")) return "Settlement: established"
  if (label.startsWith("Desired ticket:")) return label.replace("Desired ticket:", "Ticket:")
  if (label.startsWith("Delivery:")) {
    const standings = /standings: ([^·]+)/u.exec(label)?.[1]?.trim()
    return standings === undefined ? "Delivery: retained" : `Delivery: ${standings}`
  }
  return label
}

/**
 * The canvas is an at-a-glance map. Exact locators, evidence, and obligations
 * remain available in the adjacent task table and the non-canvas summary.
 */
const visualTaskLabel = (task: RenderedTask): string =>
  [
    task.id,
    task.title === undefined
      ? undefined
      : task.title.length > MAXIMUM_TITLE_LENGTH
        ? `${task.title.slice(0, TRUNCATED_TITLE_LENGTH)}…`
        : task.title,
    task.lifecycle,
    ...(task.display?.labels ?? []).map(compactVisualFact)
  ]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join("\n")

export const graphElements = (
  projection: DeliveryGraphProjection,
  selectedTaskId: string | null,
  highlightedTaskIds: ReadonlyArray<string>,
  palette: DeliveryGraphPalette
): ReadonlyArray<ElementDefinition> => {
  const highlighted = new Set(
    highlightedTaskIds.length > 0 ? highlightedTaskIds : selectedTaskId === null ? [] : [selectedTaskId]
  )
  const nodes: ReadonlyArray<ElementDefinition> = renderedTasks(projection).map((task) => ({
    classes: [
      task.missing ? "missing-endpoint" : undefined,
      selectedTaskId === task.id ? deliveryGraphEncoding.selectedTask.className : undefined,
      highlighted.size === 0 ? undefined : highlighted.has(task.id) ? "selection-related" : "selection-muted",
      `palette-${palette}`,
      task.display?.labels?.some((label) => label.startsWith("Git:") || label.startsWith("Tracker:"))
        ? "display-observed-progress"
        : undefined,
      task.display?.tone === undefined ? undefined : `tone-${task.display.tone}`,
      ...(task.display?.classes ?? []).map(safeClassToken)
    ]
      .filter((value): value is string => value !== undefined)
      .join(" "),
    data: {
      id: task.id,
      label: visualTaskLabel(task),
      lifecycle: task.lifecycle,
      missing: task.missing ? "true" : "false"
    } satisfies CytoscapeTaskData,
    group: "nodes"
  }))
  const edges: ReadonlyArray<ElementDefinition> = projection.edges.map((edge, index) => ({
    classes: [
      edge.kind === "Prerequisite" ? "prerequisite-edge" : "grouping-edge",
      highlighted.size === 0
        ? undefined
        : highlighted.has(edge.from) || highlighted.has(edge.to)
          ? "selection-related"
          : "selection-muted"
    ]
      .filter((value): value is string => value !== undefined)
      .join(" "),
    data: {
      id: `${edge.kind}:${edge.from}->${edge.to}:${index}`,
      label: edge.kind === "Prerequisite" ? "blocks" : "contains",
      source: edge.from,
      target: edge.to
    },
    group: "edges"
  }))
  return [...nodes, ...edges]
}

export const edgeDescription = (edge: DeliveryGraphEdge): string =>
  edge.kind === "Prerequisite" ? `${edge.from} blocks ${edge.to}` : `${edge.from} contains ${edge.to}`

export const topologyIdentity = (projection: DeliveryGraphProjection | null): string | undefined =>
  projection === null
    ? undefined
    : JSON.stringify({
        edges: projection.edges.map(({ from, kind, to }) => ({ from, kind, to })),
        tasks: renderedTasks(projection).map(({ id }) => id)
      })

export const deliveryGraphLayout = (): dagre.DagreLayoutOptions =>
  ({ name: "dagre", nodeSep: 44, padding: 28, rankDir: "LR", rankSep: 60 }) satisfies dagre.DagreLayoutOptions

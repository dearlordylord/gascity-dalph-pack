import cytoscape, { type Core, type EventObjectNode } from "cytoscape"
import dagre from "cytoscape-dagre"
import {
  type DeliveryGraphProjection,
  type DeliveryGraphViewport,
  deliveryGraphEncoding,
  deliveryGraphTag
} from "./delivery-graph-element.ts"

import { shadowCss, cytoscapeStyle } from "./graph-styles.ts"
import {
  deliveryGraphPalette,
  renderedTasks,
  taskLabel,
  graphElements,
  edgeDescription,
  topologyIdentity,
  deliveryGraphLayout
} from "./graph-elements.ts"

const FIT_PADDING = 28
const FOCUS_PADDING = 72
cytoscape.use(dagre)

class DalphDeliveryGraphElement extends HTMLElement {
  #canvas: HTMLDivElement
  #core: Core | null = null
  #empty: HTMLDivElement
  #emptyFooter: HTMLDivElement
  #highlightedTaskIds: ReadonlyArray<string> = []
  #projection: DeliveryGraphProjection | null = null
  #panGesture: {
    readonly pointerId: number
    readonly startX: number
    readonly startY: number
    readonly pan: cytoscape.Position
  } | null = null
  #preserveViewport = false
  #resizeObserver: ResizeObserver | null = null
  #selectedTaskId: string | null = null
  #summary: HTMLDetailsElement

  constructor() {
    super()
    const shadow = this.attachShadow({ mode: "open" })
    const style = document.createElement("style")
    style.textContent = shadowCss
    this.#canvas = document.createElement("div")
    this.#canvas.id = "canvas"
    this.#canvas.setAttribute("aria-hidden", "true")
    this.#canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.#core === null) return
      this.#panGesture = {
        pan: this.#core.pan(),
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY
      }
      this.#canvas.setPointerCapture(event.pointerId)
    })
    this.#canvas.addEventListener("pointermove", (event) => {
      const gesture = this.#panGesture
      if (this.#core === null || gesture === null || gesture.pointerId !== event.pointerId) return
      this.#core.pan({
        x: gesture.pan.x + event.clientX - gesture.startX,
        y: gesture.pan.y + event.clientY - gesture.startY
      })
    })
    const finishPan = (event: PointerEvent): void => {
      if (this.#panGesture?.pointerId !== event.pointerId) return
      this.#panGesture = null
      if (this.#canvas.hasPointerCapture(event.pointerId)) this.#canvas.releasePointerCapture(event.pointerId)
    }
    this.#canvas.addEventListener("pointercancel", finishPan)
    this.#canvas.addEventListener("pointerup", finishPan)
    this.#empty = document.createElement("div")
    this.#empty.id = "empty"
    this.#empty.textContent = "No tasks or relationships in this projection."
    this.#emptyFooter = document.createElement("div")
    this.#emptyFooter.id = "empty-footer"
    this.#emptyFooter.textContent = "Task selection is unavailable until production establishes the graph."
    this.#summary = document.createElement("details")
    this.#summary.id = "summary"
    shadow.append(style, this.#canvas, this.#empty, this.#emptyFooter, this.#summary)
  }

  set projection(value: DeliveryGraphProjection | null) {
    const changed =
      this.#projection?.fingerprint !== value?.fingerprint ||
      this.#projection?.key !== value?.key ||
      this.#projection?.status !== value?.status
    this.#preserveViewport = topologyIdentity(this.#projection) === topologyIdentity(value)
    this.#projection = value
    if (this.isConnected && changed) this.#render()
  }

  get projection(): DeliveryGraphProjection | null {
    return this.#projection
  }

  set highlightedTaskIds(value: ReadonlyArray<string>) {
    this.#highlightedTaskIds = value
    this.#applyGraphSelection()
  }

  get highlightedTaskIds(): ReadonlyArray<string> {
    return this.#highlightedTaskIds
  }

  set selectedTaskId(value: string | null) {
    this.#selectedTaskId = value
    if (this.#core !== null) {
      this.#core.nodes().unselect().removeClass(deliveryGraphEncoding.selectedTask.className)
      if (value !== null) {
        this.#core.getElementById(value).addClass(deliveryGraphEncoding.selectedTask.className).select()
      }
    }
    this.#applyGraphSelection()
    this.#updateSummarySelection()
  }

  get selectedTaskId(): string | null {
    return this.#selectedTaskId
  }

  captureViewport(): DeliveryGraphViewport | null {
    if (this.#core === null) return null
    const pan = this.#core.pan()
    return { pan: { x: pan.x, y: pan.y }, zoom: this.#core.zoom() }
  }

  restoreViewport(viewport: DeliveryGraphViewport): void {
    if (this.#core === null) return
    this.#core.zoom(viewport.zoom)
    this.#core.pan(viewport.pan)
  }

  resetView(): void {
    if (this.#core === null) return
    this.#core.layout(deliveryGraphLayout()).run()
    this.#core.fit(this.#core.elements(), FIT_PADDING)
  }

  focusTask(taskId: string): void {
    this.selectedTaskId = taskId
    this.dataset.focusedTaskId = taskId
    if (this.#core === null) return
    const task = this.#core.getElementById(taskId)
    if (task.empty()) return
    this.#core.fit(task, FOCUS_PADDING)
  }

  connectedCallback(): void {
    if (typeof ResizeObserver !== "undefined") {
      this.#resizeObserver = new ResizeObserver(() => this.#core?.resize())
      this.#resizeObserver.observe(this)
    }
    this.#render()
  }

  disconnectedCallback(): void {
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
    this.#core?.destroy()
    this.#core = null
  }

  #dispatchTaskSelected(taskId: string): void {
    this.dispatchEvent(new CustomEvent("task-selected", { bubbles: true, composed: true, detail: { taskId } }))
  }

  #renderSummary(projection: DeliveryGraphProjection | null): void {
    const focusedTaskId =
      this.shadowRoot?.activeElement instanceof HTMLButtonElement
        ? this.shadowRoot.activeElement.dataset.taskId
        : undefined
    this.#summary.replaceChildren()
    const heading = document.createElement("summary")
    heading.textContent =
      projection === null
        ? "Graph summary unavailable"
        : `Graph summary · ${projection.tasks.length} ${projection.tasks.length === 1 ? "task" : "tasks"} · ${projection.edges.length} ${projection.edges.length === 1 ? "relationship" : "relationships"}`
    this.#summary.append(heading)
    if (projection === null) return

    const status = document.createElement("p")
    status.textContent = `${projection.status} · ${projection.key}`
    this.#summary.append(status)

    const tasksHeading = document.createElement("h4")
    tasksHeading.textContent = "Tasks"
    const taskList = document.createElement("ul")
    for (const task of renderedTasks(projection)) {
      const item = document.createElement("li")
      const button = document.createElement("button")
      button.type = "button"
      button.dataset.taskId = task.id
      button.textContent = taskLabel(task).replaceAll("\n", " · ")
      button.addEventListener("click", () => this.#dispatchTaskSelected(task.id))
      item.append(button)
      taskList.append(item)
    }
    this.#summary.append(tasksHeading, taskList)

    const edgesHeading = document.createElement("h4")
    edgesHeading.textContent = "Relationships"
    const edgeList = document.createElement("ul")
    for (const edge of projection.edges) {
      const item = document.createElement("li")
      item.dataset.edgeFrom = edge.from
      item.dataset.edgeTo = edge.to
      item.textContent = edgeDescription(edge)
      edgeList.append(item)
    }
    if (projection.edges.length === 0) {
      const item = document.createElement("li")
      item.textContent = "No relationships"
      edgeList.append(item)
    }
    this.#summary.append(edgesHeading, edgeList)
    this.#updateSummarySelection()
    if (focusedTaskId !== undefined) {
      this.#summary
        .querySelector<HTMLButtonElement>(`button[data-task-id="${CSS.escape(focusedTaskId)}"]`)
        ?.focus({ preventScroll: true })
    }
  }

  #updateSummarySelection(): void {
    for (const button of this.#summary.querySelectorAll<HTMLButtonElement>("button[data-task-id]")) {
      button.setAttribute("aria-current", String(button.dataset.taskId === this.#selectedTaskId))
    }
    const highlighted = new Set(
      this.#highlightedTaskIds.length > 0
        ? this.#highlightedTaskIds
        : this.#selectedTaskId === null
          ? []
          : [this.#selectedTaskId]
    )
    for (const edge of this.#summary.querySelectorAll<HTMLLIElement>("li[data-edge-from]")) {
      const related = highlighted.has(edge.dataset.edgeFrom ?? "") || highlighted.has(edge.dataset.edgeTo ?? "")
      edge.classList.toggle("selection-related", highlighted.size > 0 && related)
      edge.classList.toggle("selection-muted", highlighted.size > 0 && !related)
    }
  }

  #applyGraphSelection(): void {
    const highlighted = new Set(
      this.#highlightedTaskIds.length > 0
        ? this.#highlightedTaskIds
        : this.#selectedTaskId === null
          ? []
          : [this.#selectedTaskId]
    )
    this.#updateSummarySelection()
    if (this.#core === null) return
    for (const node of this.#core.nodes()) {
      node.toggleClass("selection-related", highlighted.size > 0 && highlighted.has(node.id()))
      node.toggleClass("selection-muted", highlighted.size > 0 && !highlighted.has(node.id()))
    }
    for (const edge of this.#core.edges()) {
      const related = highlighted.has(edge.source().id()) || highlighted.has(edge.target().id())
      edge.toggleClass("selection-related", highlighted.size > 0 && related)
      edge.toggleClass("selection-muted", highlighted.size > 0 && !related)
    }
  }

  #render(): void {
    const previousViewport =
      this.#preserveViewport && this.#core !== null ? { pan: this.#core.pan(), zoom: this.#core.zoom() } : undefined
    this.#preserveViewport = false
    this.#core?.destroy()
    this.#core = null
    const projection = this.#projection
    const empty = projection === null || (projection.tasks.length === 0 && projection.edges.length === 0)
    if (empty) this.setAttribute("data-empty", "")
    else this.removeAttribute("data-empty")
    this.#summary.hidden = empty
    this.#emptyFooter.hidden = !empty
    if (empty) {
      this.#summary.replaceChildren()
      this.#canvas.hidden = true
      this.#empty.hidden = false
      this.#empty.textContent = projection?.status ?? "Graph projection unavailable."
      return
    }
    this.#renderSummary(projection)
    if (typeof this.ownerDocument.defaultView?.getComputedStyle !== "function") {
      this.#canvas.hidden = true
      this.#empty.hidden = true
      return
    }
    this.#canvas.hidden = false
    this.#empty.hidden = true
    this.#core = cytoscape({
      autoungrabify: true,
      boxSelectionEnabled: false,
      container: this.#canvas,
      elements: [
        ...graphElements(
          projection,
          this.#selectedTaskId,
          this.#highlightedTaskIds,
          deliveryGraphPalette(this.dataset.palette)
        )
      ],
      layout: deliveryGraphLayout(),
      maxZoom: 2.4,
      minZoom: 0.28,
      panningEnabled: true,
      style: cytoscapeStyle,
      userPanningEnabled: true,
      userZoomingEnabled: true,
      zoomingEnabled: true
    })
    if (previousViewport !== undefined) {
      this.#core.zoom(previousViewport.zoom)
      this.#core.pan(previousViewport.pan)
    }
    this.#core.on("tap", "node", (event: EventObjectNode) => {
      this.#dispatchTaskSelected(event.target.id())
    })
  }
}

/** Registers the delivery graph renderer once at the browser boundary. */
export const registerDeliveryGraph = (): void => {
  if (customElements.get(deliveryGraphTag) !== undefined) return
  customElements.define(deliveryGraphTag, DalphDeliveryGraphElement)
}

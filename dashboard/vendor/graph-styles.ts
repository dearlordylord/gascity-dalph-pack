import type cytoscape from "cytoscape"
import { deliveryGraphEncoding } from "./delivery-graph-element.ts"

export const shadowCss = `
  :host {
    display: block;
    min-height: 430px;
    border: 1px solid #8e8578;
    background:
      linear-gradient(rgba(33, 31, 26, .045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(33, 31, 26, .045) 1px, transparent 1px),
      #fbf8f1;
    background-size: 24px 24px;
  }
  :host([data-empty]) {
    background: #fbf8f1;
  }
  #canvas { position: relative; width: 100%; height: var(--delivery-graph-height, 430px); touch-action: none; cursor: grab; }
  #canvas:active { cursor: grabbing; }
  #empty {
    box-sizing: border-box;
    height: var(--delivery-graph-height, 430px);
    min-height: var(--delivery-graph-height, 430px);
    display: grid;
    place-items: center;
    color: #726b60;
    font: italic 14px system-ui, sans-serif;
  }
  :host([data-empty]) #empty { padding: 1rem; text-align: center; }
  [hidden] { display: none !important; }
  #summary, #empty-footer {
    border-top: 1px solid #bdb5a8;
    padding: .65rem .8rem;
    color: #39352e;
    background: rgba(251, 248, 241, .94);
    font: 13px/1.45 system-ui, sans-serif;
  }
  #empty-footer { font-weight: 650; }
  #summary summary { cursor: pointer; font-weight: 650; }
  #summary p { margin: .45rem 0; overflow-wrap: anywhere; }
  #summary h4 { margin: .65rem 0 .2rem; }
  #summary ul { margin: .2rem 0 .5rem; padding-left: 1.4rem; }
  #summary button {
    border: 0;
    padding: .1rem .2rem;
    color: inherit;
    background: transparent;
    font: inherit;
    text-align: left;
    text-decoration: underline;
    cursor: pointer;
    max-width: 100%;
    overflow-wrap: anywhere;
    white-space: normal;
  }
  #summary button[aria-current="true"] { color: #295b46; font-weight: 700; }
  @media (max-width: 42rem) {
    :host { min-height: 340px; }
    #canvas { height: var(--delivery-graph-height, 340px); }
    #empty { height: var(--delivery-graph-height, 340px); min-height: var(--delivery-graph-height, 340px); }
  }
`

export const cytoscapeStyle: cytoscape.StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      "background-color": "#f7f3ea",
      "border-color": "#211f1a",
      "border-width": 2,
      color: "#211f1a",
      "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
      "font-size": 13,
      height: 116,
      label: "data(label)",
      "line-height": 1.35,
      padding: "8px",
      shape: "round-rectangle",
      "text-halign": "center",
      "text-max-width": "196px",
      "text-valign": "center",
      "text-wrap": "wrap",
      width: 204
    }
  },
  { selector: "node.display-observed-progress", style: { height: 190 } },
  {
    selector: "node[missing = 'true']",
    style: { "background-color": "#f5d2bd", "border-color": "#a44423", "border-style": "dashed" }
  },
  {
    selector: `node:selected, node.${deliveryGraphEncoding.selectedTask.className}`,
    style: { "outline-color": "#00a7c4", "outline-offset": 11, "outline-opacity": 1, "outline-width": 4 }
  },
  {
    selector: `node.display-${deliveryGraphEncoding.frontierEligible.className}`,
    style: { "border-color": "#2e6788" }
  },
  {
    selector: `node.display-${deliveryGraphEncoding.selectedTicket.className}`,
    style: {
      "underlay-color": "#7656a0",
      "underlay-opacity": 0.5,
      "underlay-padding": 7,
      "underlay-shape": "round-rectangle"
    }
  },
  {
    selector: `node.display-${deliveryGraphEncoding.heldPosition.className}`,
    style: { "border-style": "double", "border-width": 5 }
  },
  {
    selector: `node.display-${deliveryGraphEncoding.retainedStanding.className}`,
    style: { "background-color": "#f2e5be" }
  },
  {
    selector: "node.palette-trace-fill.tone-blocked",
    style: { "background-color": "#f3f4f2", "border-color": "#8d9691", opacity: 0.48 }
  },
  {
    selector: "node.palette-trace-fill.tone-waiting",
    style: { "background-color": "#fcf4e6", "border-color": "#a37a32", "border-style": "dashed" }
  },
  {
    selector: "node.palette-trace-fill.tone-desired",
    style: { "background-color": "#e5f1f8", "border-color": "#4b91b8" }
  },
  {
    selector: "node.palette-trace-fill.tone-running",
    style: { "background-color": "#e7f4ee", "border-color": "#3a9978" }
  },
  {
    selector: "node.palette-trace-fill.tone-integrating",
    style: { "background-color": "#e8f2f8", "border-color": "#477f9f" }
  },
  {
    selector: "node.palette-trace-fill.tone-settled",
    style: { "background-color": "#dff1e9", "border-color": "#3a9978" }
  },
  {
    selector: "node.palette-trace-fill.tone-paused",
    style: { "background-color": "#f5ecfa", "border-color": "#80639b" }
  },
  {
    selector: "edge",
    style: {
      "curve-style": "bezier",
      "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
      "font-size": 9,
      label: "data(label)",
      "line-color": "#295b46",
      "target-arrow-color": "#295b46",
      "target-arrow-shape": "triangle",
      "text-background-color": "#fbf8f1",
      "text-background-opacity": 1,
      "text-background-padding": "3px",
      width: 2
    }
  },
  {
    selector: "edge.grouping-edge",
    style: {
      "line-color": "#9b5b20",
      "line-style": "dashed",
      "target-arrow-color": "#9b5b20",
      "target-arrow-shape": "diamond"
    }
  },
  { selector: "edge:selected", style: { "line-color": "#211f1a", "target-arrow-color": "#211f1a", width: 4 } },
  {
    selector: "node.selection-related",
    style: { "outline-color": "#2b92ca", "outline-offset": 10, "outline-opacity": 1, "outline-width": 4 }
  },
  { selector: "node.selection-muted", style: { opacity: 0.16 } },
  { selector: "edge.selection-related", style: { "line-color": "#2b92ca", "target-arrow-color": "#2b92ca", width: 4 } },
  { selector: "edge.selection-muted", style: { opacity: 0.1 } }
]

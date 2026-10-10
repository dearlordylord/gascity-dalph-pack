import { Effect, Schedule, Schema } from 'effect'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as Request from 'effect/unstable/http/HttpClientRequest'
import * as Response from 'effect/unstable/http/HttpClientResponse'
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient'
import { registerDeliveryGraph } from './vendor/delivery-graph-renderer.ts'
import { project } from './projection.mjs'

const Identity = Schema.String.check(Schema.isMinLength(1)).pipe(Schema.brand('GraphIdentity'))
const Node = Schema.Struct({id:Identity,title:Schema.String,status:Schema.String,currentBeadId:Schema.String,visibleInGraph:Schema.Boolean,constructKind:Schema.String,executionInstances:Schema.Array(Schema.Record(Schema.String,Schema.Unknown))})
const Detail = Schema.Struct({runId:Identity,title:Schema.String,nodes:Schema.Array(Node),edges:Schema.Array(Schema.Struct({from:Identity,to:Identity,kind:Schema.String})),progress:Schema.Struct({terminal:Schema.Boolean}),completeness:Schema.Struct({kind:Schema.String,reasons:Schema.optionalKey(Schema.Array(Schema.String))})})
registerDeliveryGraph()
const graph = document.querySelector('dalph-delivery-graph')
const byId = id => document.getElementById(id)
const params = new URLSearchParams(location.search)
const city = params.get('city') || 'dalph-expenses'
const run = params.get('run') || 'ex-aly'
const scope = params.get('scope') || 'expenses'
let detail, selected
byId('run').value = run
byId('city').value = city
byId('scope').value = scope
byId('open').onclick = () => { location.search = new URLSearchParams({city:byId('city').value,run:byId('run').value,scope:byId('scope').value}) }
byId('fit').onclick = () => graph.resetView()
byId('grouping').onchange = () => render()
const element = (tag, text, className) => { const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e }
function nodeButton(n) {const b=element('button',n.title);b.onclick=()=>select(n.id);return b}
function select(id) {selected=id;graph.selectedTaskId=id;renderSelection()}
function renderSelection() {
  const panel=byId('facts');panel.replaceChildren()
  const n=detail?.nodes.find(n=>n.id===selected)
  if(!n){panel.append(element('p','Select a task to inspect its dependencies and execution.'));return}
  panel.append(element('h2',n.title),element('p',`${n.currentBeadId} · ${n.status}`,'mono'))
  const deps=detail.edges.filter(e=>e.to===n.id && !['parent','parent-child','contains'].includes(e.kind))
  panel.append(element('h3','Prerequisites'))
  for(const e of deps){const dep=detail.nodes.find(n=>n.id===e.from);panel.append(dep?nodeButton(dep):element('p',e.from))}
  if(!deps.length)panel.append(element('p','No prerequisites'))
  panel.append(element('h3','Execution observations'))
  for(const instance of n.executionInstances) {panel.append(element('p',`${instance.beadId} · ${instance.status} · ${instance.label}`, 'mono'));if(instance.session?.link)panel.append(element('p',instance.session.link.sessionName,'mono'))}
  const raw=element('details','');raw.append(element('summary','Raw observation'),element('pre',JSON.stringify(n.executionInstances,null,2)));panel.append(raw)
  const a=element('a','Open in Gas City ↗');a.href=`http://${location.hostname}:43596/city/${encodeURIComponent(city)}/runs/${encodeURIComponent(run)}`;a.target='_blank';panel.append(a)
}
function render() {
  if(!detail)return
  graph.projection=project(detail,byId('grouping').checked)
  byId('title').textContent=detail.title
  const visible=detail.nodes.filter(n=>n.visibleInGraph && n.constructKind !== 'run-root')
  const done=visible.filter(n=>['completed','done'].includes(n.status))
  const ready=visible.filter(n=>n.status==='ready')
  const active=visible.filter(n=>['running','active'].includes(n.status))
  byId('counts').textContent=`${done.length}/${visible.length} completed · ${ready.length} ready · ${active.length} active`
  byId('progress').style.width=`${visible.length?100*done.length/visible.length:0}%`
  for(const [id,rows,empty] of [['frontier',ready,'No ready steps'],['active',active,'No running steps']]){const p=byId(id);p.replaceChildren();for(const n of rows)p.append(nodeButton(n));if(!rows.length)p.append(element('p',empty))}
  byId('partial').textContent=detail.completeness.kind==='partial' ? `Partial observation: ${(detail.completeness.reasons||[]).join(', ')}` : ''
  renderSelection()
}
graph.addEventListener('task-selected',e=>select(e.detail.taskId))
const read = Effect.fn('PackDashboard.readRun')(function*(){
  yield* Effect.sync(()=>{byId('connection').textContent=detail?'Refreshing…':'Connecting to Gas City…'})
  const client=yield* HttpClient.HttpClient
  const response=yield* client.execute(Request.get(`${location.origin}/api/city/${encodeURIComponent(city)}/runs/${encodeURIComponent(run)}/detail?scope_kind=rig&scope_ref=${encodeURIComponent(scope)}`))
  const ok=yield* Response.filterStatusOk(response)
  return yield* Response.schemaBodyJson(Detail)(ok)
})
const pass=read().pipe(Effect.timeout('60 seconds'),Effect.tap(value=>Effect.sync(()=>{detail=value;render();byId('connection').textContent=`Live · observed ${new Date().toLocaleTimeString()}`})),Effect.catch(error=>Effect.sync(()=>{byId('connection').textContent=detail?'Stale · refresh failed':'Connection unavailable';byId('error').textContent=String(error)})),Effect.tap(()=>Effect.sync(()=>{if(byId('connection').textContent.startsWith('Live'))byId('error').textContent=''})))
Effect.runFork(pass.pipe(Effect.repeat(Schedule.spaced('15 seconds')),Effect.provide(FetchHttpClient.layer)))

import {test} from 'node:test'
import assert from 'node:assert/strict'
import {project} from './projection.mjs'
const node=(id,status,constructKind='step')=>({id,title:id,status,constructKind,visibleInGraph:true})
test('fork/join dependencies survive; grouping does not imply readiness',()=>{
 const detail={runId:'run',progress:{terminal:false},nodes:[node('root','ready','run-root'),node('a','completed'),node('b','ready'),node('c','running'),node('d','pending')],edges:[{from:'a',to:'b',kind:'blocks'},{from:'a',to:'c',kind:'blocks'},{from:'b',to:'d',kind:'blocks'},{from:'c',to:'d',kind:'blocks'},{from:'root',to:'a',kind:'parent'}]}
 const p=project(detail)
 assert.equal(p.tasks.length,4);assert.equal(p.edges.length,4)
 assert.deepEqual(p.tasks.find(n=>n.id==='b').display.classes,['frontier'])
 assert.deepEqual(p.tasks.find(n=>n.id==='c').display.classes,['held'])
 assert.deepEqual(p.tasks.find(n=>n.id==='d').display.classes,[])
 assert.equal(project(detail,true).edges.at(-1).kind,'Grouping')
 assert.equal(project(detail,true).tasks.length,5)
})

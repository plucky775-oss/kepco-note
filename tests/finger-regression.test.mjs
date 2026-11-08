import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as input from '../work/www/src/ink-input.js';
import {makeNote, History} from '../work/www/src/core.js';
import {sealCommittedStroke} from '../work/www/src/immutable-ink.js';
import {normalizePenKind} from '../work/www/src/pen-renderer.js';
import {mountPaperViewport} from '../work/www/src/paper-viewport.js';

const source=readFileSync(new URL('../work/www/src/app.js',import.meta.url),'utf8');
function harness(){
 const listeners=new Map(), elements=new Map(), rect={left:0,top:0,width:900,height:1200};
 const element=id=>{
  if(!elements.has(id))elements.set(id,{id,checked:id==='touch',value:id==='color'?'#223247':'3',children:[],hidden:false,
   contains:target=>target?.parentId===id,
   addEventListener(type,fn){const key=id+':'+type;listeners.set(key,[...(listeners.get(key)||[]),fn]);},
   getBoundingClientRect:()=>({...rect}),setPointerCapture(){},hasPointerCapture:()=>false,
   replaceChildren(...children){this.children=children;},setAttribute(){},toggleAttribute(){},
   classList:{toggle(){},remove(){}},focus(){}
  });
  return elements.get(id);
 };
 const note=makeNote(),history=new History();note.strokes=[];note.mode='ink';
 const document={hidden:false,addEventListener:(type,fn)=>element('document').addEventListener(type,fn)};
 const scope={...input,normalizePenKind,sealCommittedStroke,$:element,document,note,history,
  drawing:null,strokeRect:null,tool:'pen',selectedIds:[],selectedObjectIds:[],
  autoEngine:{setWriting(){}},photoTools:null,drawingTools:null,pageSwipe:{cancel(){}},
  flushEraserRender(){},cancelMovePreview(){},flushMovePreview(){},showEraser(){},
  clearSelection(){},buttons(){},stopAuto(){},isWriting:()=>true,
  dirty(){scope.saved++;},saved:0,autoChanged(){},renderCommittedStroke(s){scope.committed.push(s);},committed:[],
  path:s=>({count:s.points.length}),visibleGroups:()=>[],acceptDirectTouch:()=>false,
  id:()=>String(Math.random()),toast(){},lineHold:{start(){},update(){},cancel(){}}
 };
 vm.createContext(scope);
 vm.runInContext(source.slice(source.indexOf('function endStroke('),source.indexOf("$('pan-page').onchange")),scope);
 function send(type,x,y,extra={},owner='canvas'){
  const event={type,button:0,buttons:type==='pointerup'?0:1,pointerType:'touch',pointerId:11,isPrimary:true,
   width:12,height:12,pressure:.5,clientX:x,clientY:y,target:element(owner),cancelable:true,
   preventDefault(){},...extra};
  for(const fn of listeners.get(owner+':'+type)||[])fn(event);
  if(owner!=='document')for(const fn of listeners.get('document:'+type)||[])fn(event);
 }
 return {scope,send,element,rect};
}
test('finger stroke keeps samples when the platform cancels an accepted contact',()=>{
 const h=harness();h.send('pointerdown',100,100);h.send('pointermove',140,160);h.send('pointercancel',140,160);
 assert.equal(h.scope.note.strokes.length,1);assert.equal(h.scope.note.strokes[0].points.length,2);
 assert.equal(h.scope.history.past.length,1);assert.equal(h.scope.saved,1);
 h.send('pointerup',150,180);assert.equal(h.scope.note.strokes.length,1);
});
test('capture loss does not end a stroke and document fallback retains the endpoint',()=>{
 const h=harness();h.send('pointerdown',100,100);h.send('pointermove',140,160);h.send('lostpointercapture',140,160);
 h.send('pointermove',190,220,{},'document');h.send('pointerup',230,240,{},'document');
 assert.equal(h.scope.note.strokes.length,1);assert.equal(h.scope.note.strokes[0].points.length,4);
 assert.equal(h.scope.note.strokes[0].points.at(-1).x,230);assert.equal(h.scope.history.past.length,1);
});
test('explicit pinch handoff still discards only unfinished finger ink',()=>{
 const h=harness();h.send('pointerdown',100,100);h.send('pointermove',140,160);h.scope.endStroke(false,true);
 h.send('pointerup',200,210);assert.equal(h.scope.note.strokes.length,0);assert.equal(h.scope.history.past.length,0);
});
test('ordinary completion is recorded once with the last sample',()=>{
 const h=harness();h.send('pointerdown',100,100);h.send('pointermove',140,160);h.send('pointerup',190,220);
 assert.equal(h.scope.note.strokes.length,1);assert.equal(h.scope.note.strokes[0].points.at(-1).y,220);
 assert.equal(h.scope.saved,1);assert.equal(h.scope.history.past.length,1);
});
test('unchanged window resize notifications do not interrupt writing',()=>{
 const events={},container={clientWidth:500,clientHeight:600,getBoundingClientRect:()=>({left:0,top:100})},paper={offsetWidth:500,offsetHeight:667,style:{}};let ended=0;
 const ui=mountPaperViewport({container,paper,win:{addEventListener:(type,fn)=>events[type]=fn,removeEventListener(){}},beforeChange:()=>ended++});
 events.resize();events.resize();assert.equal(ended,0);assert.equal(ui.revision(),0);
 container.clientWidth=600;events.resize();assert.equal(ended,1);assert.equal(ui.revision(),1);
 events.resize();assert.equal(ended,1);
});

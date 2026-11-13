import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {eraseStrokes} from '../work/www/src/area-eraser.js';
import {eraseDrawingObjects} from '../work/www/src/drawing-objects.js';
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
 const scope={...input,eraseStrokes,eraseDrawingObjects,normalizePenKind,sealCommittedStroke,$:element,document,note,history,
  drawing:null,strokeRect:null,tool:'pen',selectedIds:[],selectedObjectIds:[],
  autoEngine:{setWriting(){}},photoTools:null,drawingTools:null,pageSwipe:{cancel(){}},
  flushEraserRender(){},cancelMovePreview(){},flushMovePreview(){},showEraser(){},
  clearSelection(){},buttons(){},stopAuto(){},isWriting:()=>true,
  dirty(){scope.saved++;},saved:0,autoChanged(){},renderInk(){},renderCommittedStroke(s){scope.committed.push(s);},committed:[],
  path:s=>({count:s.points.length}),visibleGroups:()=>[],acceptDirectTouch:()=>false,
  id:(()=>{let n=0;return ()=>'test-'+(++n);})(),toast(){},lineHold:{start(){},update(){},cancel(){}}
 };
 vm.createContext(scope);
 vm.runInContext(source.slice(source.indexOf('function eraserRadius('),source.indexOf("$('pan-page').onchange")),scope);
 function send(type,x,y,extra={},owner='canvas'){
  const event={type,button:0,buttons:type==='pointerup'?0:1,pointerType:'touch',pointerId:11,isPrimary:true,
   width:12,height:12,pressure:.5,clientX:x,clientY:y,target:element(owner),cancelable:true,
   preventDefault(){},...extra};
  for(const fn of listeners.get(owner+':'+type)||[])fn(event);
  if(owner!=='document')for(const fn of listeners.get('document:'+type)||[])fn(event);
 }
 return {scope,send,element,rect};
}

const pen={pointerType:'pen',pointerId:21};
function ink(h,y=100){h.send('pointerdown',20,y,pen);h.send('pointermove',100,y,pen);h.send('pointerup',150,y,{...pen,pressure:0});}
test('barrel eraser preserves toolbar and pen settings, changes ink with one undo',()=>{
 const h=harness();ink(h);const before=JSON.stringify(h.scope.note.strokes);h.element('eraser-size').value='12';
 h.send('pointerdown',80,100,{...pen,buttons:3});assert.equal(h.scope.drawing.kind,'erase');assert.equal(h.scope.tool,'pen');
 h.send('pointermove',90,100,{...pen,buttons:3});h.send('pointerup',90,100,{...pen,pressure:0});
 assert.notEqual(JSON.stringify(h.scope.note.strokes),before);assert.equal(h.scope.history.past.length,2);
 ink(h,200);assert.equal(h.scope.note.strokes.at(-1).color,'#223247');assert.equal(h.scope.note.strokes.at(-1).width,3);
});
test('mid-contact barrel release remains eraser until lift without new ink',()=>{
 const h=harness();h.send('pointerdown',20,100,pen);h.send('pointermove',60,100,pen);
 h.send('pointermove',80,100,{...pen,buttons:3,button:2});assert.equal(h.scope.drawing.kind,'erase');
 h.send('pointermove',120,100,{...pen,buttons:1,button:2});assert.equal(h.scope.drawing.kind,'erase');
 h.send('pointerup',160,100,{...pen,pressure:0});assert.equal(h.scope.drawing,null);assert.equal(h.scope.note.strokes.length,1);
});
test('held barrel hover is harmless and tip-down/up pointermove works',()=>{
 const h=harness();ink(h);const before=JSON.stringify(h.scope.note.strokes);
 h.send('pointerdown',80,100,{...pen,buttons:2,button:2,pressure:0});assert.equal(h.scope.drawing,null);assert.equal(JSON.stringify(h.scope.note.strokes),before);
 h.send('pointermove',80,100,{...pen,buttons:3,button:0});assert.equal(h.scope.drawing.kind,'erase');
 h.send('pointermove',90,100,{...pen,buttons:2,button:0,pressure:0});assert.equal(h.scope.drawing,null);
 h.send('pointerup',90,100,{...pen,pressure:0});ink(h,200);assert.equal(h.scope.tool,'pen');
});
test('eraser end, lost capture/document fallback, cancellation and repeated switches',()=>{
 const h=harness();ink(h);h.send('pointerdown',80,100,{...pen,buttons:32,button:5});assert.equal(h.scope.drawing.kind,'erase');
 h.send('lostpointercapture',80,100,pen);assert.equal(h.scope.drawing.kind,'erase');h.send('pointermove',100,100,{...pen,buttons:32,button:-1},'document');
 h.send('pointercancel',100,100,pen,'document');assert.equal(h.scope.drawing,null);
 for(let i=0;i<3;i++){h.send('pointerdown',200,200,pen);h.send('pointermove',220,200,{...pen,buttons:3,button:2});h.send('pointermove',240,200,{...pen,buttons:1,button:2});h.send('pointerup',260,200,{...pen,pressure:0});}assert.equal(h.scope.drawing,null);assert.equal(h.scope.tool,'pen');
});
test('manual eraser stays selected; mouse right click and finger are unchanged',()=>{
 const h=harness();h.send('pointerdown',20,20,{pointerType:'mouse',button:2,buttons:2});assert.equal(h.scope.drawing,null);
 h.send('pointerdown',20,20,{buttons:3});assert.equal(h.scope.drawing.kind,undefined);h.send('pointerup',30,30);
 h.scope.tool='eraser';h.send('pointerdown',20,20,pen);h.send('pointermove',30,30,{...pen,buttons:3});h.send('pointermove',40,40,pen);assert.equal(h.scope.drawing.kind,'erase');h.send('pointerup',40,40,{...pen,pressure:0});assert.equal(h.scope.tool,'eraser');
});
test('pan lock rejects button erasing',()=>{const h=harness();h.element('pan-page').checked=true;h.send('pointerdown',20,20,{...pen,buttons:3});assert.equal(h.scope.drawing,null);});

// Android's native adapter reports barrel strokes as TOOL_TYPE_ERASER, which
// Chromium exposes as pen + buttons 32, including move-only contact recovery.
test('native eraser move contact recovers and waits for next contact to ink',()=>{
 const h=harness();ink(h);const before=JSON.stringify(h.scope.note.strokes);
 h.send('pointermove',80,100,{...pen,buttons:32,button:-1});
 assert.equal(h.scope.drawing.kind,'erase');assert.notEqual(JSON.stringify(h.scope.note.strokes),before);
 h.send('pointermove',90,100,{...pen,buttons:1,button:-1});
 assert.equal(h.scope.drawing.kind,'erase');
 h.send('pointerup',100,100,{...pen,pressure:0});assert.equal(h.scope.tool,'pen');
});
test('move-only hover never starts erasure or ink',()=>{
 const h=harness();h.send('pointermove',50,50,{...pen,buttons:0,button:-1,pressure:0});
 assert.equal(h.scope.drawing,null);
 h.send('pointermove',50,50,{...pen,buttons:2,button:-1,pressure:0});
 assert.equal(h.scope.drawing,null);
});

test('zero-pressure eraser/contact flags never draw or erase during hover',()=>{
 const h=harness();ink(h);const before=JSON.stringify(h.scope.note.strokes);
 for(const buttons of [0,1,2,3,32,33,34]) {
  for(const type of ['pointerdown','pointermove'])h.send(type,80,100,{...pen,buttons,button:buttons===32?5:-1,pressure:0});
  assert.equal(h.scope.drawing,null);assert.equal(JSON.stringify(h.scope.note.strokes),before);
 }
});
test('erase lift and button release never commit a ghost stroke',()=>{
 const h=harness();ink(h);h.element('eraser-size').value='80';
 h.send('pointerdown',80,100,{...pen,buttons:32,button:5});
 h.send('pointermove',90,100,{...pen,buttons:1,pressure:0});
 assert.equal(h.scope.drawing,null);const before=JSON.stringify(h.scope.note.strokes);
 h.send('pointermove',110,100,{...pen,buttons:1,pressure:0});
 h.send('pointerdown',110,100,{...pen,buttons:1,pressure:0});
 h.send('pointerup',110,100,{...pen,pressure:0});
 assert.equal(JSON.stringify(h.scope.note.strokes),before);
 ink(h,300);assert.equal(h.scope.note.strokes.at(-1).points[0].y,300);
});
test('idle pen move cannot begin a new stroke from stray pressure',()=>{
 const h=harness();h.send('pointermove',50,50,{...pen,buttons:1});assert.equal(h.scope.drawing,null);
});

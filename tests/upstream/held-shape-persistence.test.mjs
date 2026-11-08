import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeNote,validateNote,parseBackup,smoothPoints} from '../src/core.js';
import {correctShape} from '../src/shapes.js';
import {moveSelection} from '../src/selection.js';
import {eraseStrokes} from '../src/area-eraser.js';
import {strokeGeometry,PEN_KINDS} from '../src/pen-renderer.js';
const source=readFileSync('src/app.js','utf8');
const points=[{x:100,y:100,pressure:.2},{x:300,y:100,pressure:.4},{x:300,y:300,pressure:.6},{x:100,y:300,pressure:.8},{x:100,y:100,pressure:1}];
for(const {id:penKind} of PEN_KINDS)test(`held shape ${penKind} backup, selection, eraser and render preserve style`,()=>{
 const stroke={id:'closed-shape',heldShape:'polygon',penKind,color:'#3978d4',width:4,points:structuredClone(points)},page={...makeNote(),strokes:[stroke]};
 const read=parseBackup(JSON.stringify({version:1,notes:[page]}))[0];assert.deepEqual(read.strokes[0],stroke);assert.deepEqual(validateNote(page).strokes[0],stroke);
 const moved=moveSelection(read,['closed-shape'],20,30).note.strokes[0];assert.equal(moved.heldShape,'polygon');assert.equal(moved.penKind,penKind);moved.points.forEach((p,i)=>{assert.equal(p.x,points[i].x+20);assert.equal(p.y,points[i].y+30);assert.equal(p.pressure,points[i].pressure);});
 const parts=eraseStrokes([stroke],{x:200,y:90},{x:200,y:110},10).strokes;assert.ok(parts.length);for(const p of parts){assert.equal(p.heldShape,'polygon');assert.equal(p.penKind,penKind);assert.equal(p.color,stroke.color);assert.equal(p.width,4);}
 assert.deepEqual(strokeGeometry(stroke),strokeGeometry(read.strokes[0]));
});
test('display and export pipeline use exact corrected points regardless of smoothing or optional release cleanup',async()=>{
 const ink={id:'closed',heldShape:'polygon',penKind:'pencil',color:'#223247',width:3,points},page={...makeNote(),strokes:[ink],smooth:.85,shapeCorrection:true};
 const scope={note:page,tool:'pen',correctShape,smoothPoints,WeakMap};vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('const displayCache='),source.indexOf('function path(')),scope);assert.equal(scope.displayPoints(ink),points);assert.equal(scope.displayPoints(ink,true),points);
 let rendered;const canvas={getContext:()=>({scale(){}})};Object.assign(scope,{PAGE:{width:900,height:1200},document:{createElement:()=>canvas},drawPaperBackground(){},drawPageImages:async()=>{},activeConvertedGroups:()=>[],drawStyledStroke:(ctx,s,p)=>{rendered={s,p};}});
 vm.runInContext(source.slice(source.indexOf('export async function renderPageCanvas('),source.indexOf('\nasync function ',source.indexOf('export async function renderPageCanvas(')+1)).replace('export async','async'),scope);
 await scope.renderPageCanvas(page);assert.equal(rendered.s,ink);assert.equal(rendered.p,points);
});


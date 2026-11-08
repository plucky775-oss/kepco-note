import test from 'node:test';import assert from 'node:assert/strict';
import {strokeGeometry,strokeSvg,maxStrokeRadius}from'../src/pen-renderer.js';
import {makeNote,parseBackup}from'../src/core.js';
const base={id:'graphite',penKind:'pencil',width:3,color:'#223247',points:[{x:30,y:100,pressure:.5},{x:430,y:100,pressure:.5}]};
const diameter=poly=>Math.max(...poly.map(p=>p[1]))-Math.min(...poly.map(p=>p[1]));
test('graphite keeps continuous full-width coverage and subtle sub-nib tooth',()=>{for(const width of [2/3,1,2,3,5,12,32,64]){
 const g=strokeGeometry({...base,width});assert.equal(g.length,4);assert.ok(g[0].opacity>=.2);assert.ok(g[3].opacity<.5);assert.equal(g[0].polygons.length,3);
 const sweep=g[0].polygons[1];assert.equal(Math.min(...sweep.map(p=>p[0])),30);assert.equal(Math.max(...sweep.map(p=>p[0])),430);
 for(const poly of g[2].polygons)assert.ok(diameter(poly)<Math.min(width*1.25,3.0));
}});
test('pressure changes width and deposition density without a new stored field',()=>{
 const g=p=>strokeGeometry({...base,points:[{x:100,y:100,pressure:p},{x:400,y:100,pressure:p}]});const low=g(0),high=g(1);
 assert.ok(diameter(high[0].polygons[0])>diameter(low[0].polygons[0])*3);
 assert.ok(high[3].polygons.length>low[3].polygons.length);
 assert.deepEqual(g(undefined),g(.5));
});
test('uncapped live interior grain stays stable as a stroke grows, with no regular stamps',()=>{
 const a=strokeGeometry({...base,points:[base.points[0],{x:230,y:100,pressure:.5}]}),b=strokeGeometry(base);
 const interior=g=>g.slice(1).map(layer=>layer.polygons.filter(poly=>{const x=poly.reduce((s,p)=>s+p[0],0)/3;return x>40&&x<200;}));
 assert.deepEqual(interior(a),interior(b));
 const xs=a[2].polygons.map(poly=>poly.reduce((s,p)=>s+p[0],0)/3);const steps=xs.slice(1).map((x,i)=>Math.round((x-xs[i])*100));assert.ok(new Set(steps).size>30);
});
test('backup/reload redraw and custom smoothing remain deterministic without sample mutation',()=>{
 const note={...makeNote(),strokes:[structuredClone(base)]},raw=JSON.stringify(note),saved=JSON.stringify({version:1,notes:[note]}),before=strokeSvg(base);
 const restored=parseBackup(saved)[0];assert.equal(strokeSvg(restored.strokes[0]),before);assert.equal(JSON.stringify(note),raw);
 const custom=[{x:35,y:100,pressure:.2},{x:200,y:120,pressure:.8}],copy=JSON.stringify(custom);strokeSvg(base,custom);assert.equal(JSON.stringify(custom),copy);
 assert.notEqual(strokeSvg({...base,id:'another'}),before);
});
test('texture stays inside historical nib bounds on horizontal strokes, including taps and extreme pressures',()=>{
 for(const width of [2/3,3,64])for(const p of [0,.5,1])for(const points of [[{x:100,y:100,pressure:p}],[{x:100,y:100,pressure:p},{x:700,y:100,pressure:p}]]){
 const s={...base,width,points},r=maxStrokeRadius(s);for(const layer of strokeGeometry(s))for(const poly of layer.polygons)for(const[x,y]of poly){assert.ok(x>=100-r-.001&&x<=points.at(-1).x+r+.001);assert.ok(y>=100-r-.001&&y<=100+r+.001);}
 }
});
test('12000 raw samples have bounded geometry, finite output, and remain intact',()=>{
 const s={...base,points:Array.from({length:12000},(_,i)=>({x:i/14,y:600+Math.sin(i/20)*30,pressure:(i%100)/100}))},before=JSON.stringify(s),g=strokeGeometry(s);
 assert.ok(g[0].polygons.length<=4095);assert.ok(g.slice(1).reduce((sum,l)=>sum+l.polygons.length,0)<=4096);assert.equal(JSON.stringify(s),before);
 assert.ok(!/NaN|Infinity/.test(strokeSvg(s)));
});
test('broad graphite carries grain into both round caps and across the full nib',()=>{
 const s={...base,width:16,points:[{x:100,y:100,pressure:.5},{x:300,y:100,pressure:.5}]},g=strokeGeometry(s),grain=g.slice(1).flatMap(l=>l.polygons),centers=grain.map(poly=>poly.reduce(([x,y],p)=>[x+p[0]/3,y+p[1]/3],[0,0]));
 assert.ok(grain.length<=8192);assert.ok(centers.some(([x])=>x<97));assert.ok(centers.some(([x])=>x>303));assert.ok(centers.some(([,y])=>y<95));assert.ok(centers.some(([,y])=>y>105));
 assert.ok(new Set(grain.map(poly=>JSON.stringify(poly))).size>grain.length*.99);
});
test('fine and broad total texture budgets remain bounded independently of length',()=>{
 for(const width of [2/3,3,8,12,64]){
  const s={...base,width,points:Array.from({length:2500},(_,i)=>({x:30+i/3,y:600+200*Math.sin(i/50),pressure:.5}))},g=strokeGeometry(s);
  assert.ok(g.slice(1).reduce((sum,l)=>sum+l.polygons.length,0)<=(width<=8?4096:8192));
 }
});


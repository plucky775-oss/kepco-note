import test from 'node:test';
import assert from 'node:assert/strict';
import {correctHeldShape} from '../src/held-shapes.js';
const ellipse=(rx=100,ry=100,rotation=0,count=241,turn=2*Math.PI,jitter=0)=>Array.from({length:count},(_,i)=>{const a=turn*i/(count-1),r=1+jitter*Math.sin(a*3)+jitter*.2*Math.sin(i*1.7),x=rx*r*Math.cos(a),y=ry*r*Math.sin(a);return {x:350+x*Math.cos(rotation)-y*Math.sin(rotation),y:400+x*Math.sin(rotation)+y*Math.cos(rotation),pressure:.1+.8*i/count,time:i,tiltX:i%31};});
const polygon=(n=4,rotation=0,jitter=0,count=30)=>{
 const vertices=Array.from({length:n},(_,i)=>({x:350+120*Math.cos(rotation+i/n*2*Math.PI),y:400+120*Math.sin(rotation+i/n*2*Math.PI)}));
 const points=[];for(let i=0;i<n;i++)for(let k=0;k<count;k++){const a=vertices[i],b=vertices[(i+1)%n],t=k/count;points.push({x:a.x+(b.x-a.x)*t+jitter*Math.sin(k*.8),y:a.y+(b.y-a.y)*t+jitter*Math.cos(k*.8),pressure:.2+k*.01,time:points.length});}points.push({...points[0],time:points.length});return points;
};
for(const rotation of [0,.3,.8,1.5,2.7])for(const reverse of [false,true])for(const shape of ['circle','ellipse'])test(`${shape} rotated ${rotation} reverse ${reverse} preserves samples`,()=>{
 let points=ellipse(110,shape==='circle'?110:65,rotation,401,2*Math.PI,.025);if(reverse)points.reverse();const before=structuredClone(points),result=correctHeldShape(points);assert.equal(result?.kind,shape);assert.equal(result.points.length,points.length);assert.deepEqual(points,before);result.points.forEach((p,i)=>{for(const key of ['pressure','time','tiltX'])assert.equal(p[key],points[i][key]);assert.notEqual(p,points[i]);});assert.equal(result.points[0].x,result.points.at(-1).x);assert.equal(result.points[0].y,result.points.at(-1).y);
});
for(const n of [3,4,5,6,7,8])for(const rotation of [0,.3,.9])for(const jitter of [0,1.5])test(`recognizes ${n} sided polygon ${rotation} jitter ${jitter}`,()=>{const result=correctHeldShape(polygon(n,rotation,jitter));assert.equal(result?.kind,'polygon');});
for(const n of [3,4,5,6])test(`polygon ${n} may begin halfway along an edge`,()=>{const points=polygon(n,.2,1),open=points.slice(0,-1),rotated=[...open.slice(15),...open.slice(0,15)];rotated.push({...rotated[0]});assert.equal(correctHeldShape(rotated)?.kind,'polygon');});
test('near closure is intentional and tolerant, but open C shapes stay unchanged',()=>{
 for(const turn of [1.91,1.95,1.99,2.02])assert.equal(correctHeldShape(ellipse(100,100,.3,201,turn*Math.PI,.02))?.kind,'circle');
 for(const turn of [1.4,1.65,1.8])assert.equal(correctHeldShape(ellipse(100,100,0,201,turn*Math.PI)),null);
});
test('negative handwriting, multiple loops, crossing, small shapes and malformed input',()=>{
 const cases=[[],[{x:0,y:0}],ellipse(25,25),ellipse(100,100,0,400,4*Math.PI),ellipse(100,100,0,400,6*Math.PI),ellipse(120,20),Array.from({length:240},(_,i)=>({x:300+100*Math.sin(i/239*2*Math.PI),y:400+80*Math.sin(i/239*4*Math.PI)})),Array.from({length:240},(_,i)=>({x:100+i,y:200+50*Math.sin(i/239*8*Math.PI)})),ellipse().map((p,i)=>i===10?{...p,x:NaN}:p),ellipse().map(p=>({...p,x:Infinity})),ellipse().slice(0,80)];
 for(const points of cases)assert.equal(correctHeldShape(points),null);
});
test('backtracking loop and concave notches are not silently replaced',()=>{
 const points=ellipse(),backtrack=[...points.slice(0,100),...points.slice(40,100).reverse(),...points.slice(40)];assert.equal(correctHeldShape(backtrack),null);
 const notched=ellipse(100,100,0,241).map((p,i)=>i>80&&i<110?{...p,x:350+(p.x-350)*.45,y:400+(p.y-400)*.45}:p);assert.equal(correctHeldShape(notched),null);
});
test('bounded dense jitter and sample rates do not change successful classification',()=>{
 for(const count of [60,240,1000,12000])assert.equal(correctHeldShape(ellipse(100,100,0,count,2*Math.PI,.007))?.kind,'circle');
 const points=Array.from({length:12000},(_,i)=>({x:100+200*i/11999,y:100+(i%2?50:-50)}));assert.equal(correctHeldShape(points),null);assert.equal(correctHeldShape(Array(12001).fill({x:1,y:2})),null);
});

test('high-frequency two-unit polling jitter is stable across dense sample rates',()=>{
 for(const count of [120,500,12000]){const points=ellipse(100,100,0,count).map((p,i)=>({ ...p,x:p.x+2*Math.sin(i*1.7),y:p.y+2*Math.cos(i*1.7)}));assert.equal(correctHeldShape(points)?.kind,'circle');}
});
test('fitting never introduces out-of-page ink, nor clamps a partial shape',()=>{
 const outside=ellipse(100,100).map(p=>({...p,x:p.x-300}));assert.equal(correctHeldShape(outside),null);
 const inside=ellipse(100,100).map(p=>({...p,x:p.x-245,y:p.y-295}));const result=correctHeldShape(inside);assert.ok(result);assert.ok(result.points.every(p=>p.x>=0&&p.x<=900&&p.y>=0&&p.y<=1200));
 for(const dx of [-1e308,1e308])assert.equal(correctHeldShape(ellipse().map(p=>({...p,x:p.x+dx}))),null);
});
test('nonregular triangles, rectangles and quadrilaterals retain their own layout',()=>{
 for(const vertices of [[{x:100,y:200},{x:270,y:220},{x:150,y:370}],[{x:100,y:200},{x:300,y:200},{x:300,y:330},{x:100,y:330}],[{x:100,y:200},{x:300,y:230},{x:260,y:360},{x:110,y:330}]]){
  const points=[];for(let i=0;i<vertices.length;i++)for(let k=0;k<35;k++){const a=vertices[i],b=vertices[(i+1)%vertices.length],t=k/35;points.push({x:a.x+(b.x-a.x)*t+.5*Math.sin(k),y:a.y+(b.y-a.y)*t,pressure:k/35});}points.push({...points[0]});
  const result=correctHeldShape(points);assert.equal(result?.kind,'polygon');for(const v of vertices)assert.ok(result.points.some(p=>Math.hypot(p.x-v.x,p.y-v.y)<2));
 }
});
test('polygon metadata is preserved at corners and at the closing endpoint',()=>{
 const points=polygon(4,.2,1),before=structuredClone(points),result=correctHeldShape(points);assert.equal(result?.kind,'polygon');assert.deepEqual(points,before);assert.equal(result.points.length,points.length);result.points.forEach((p,i)=>{assert.equal(p.pressure,points[i].pressure);assert.equal(p.time,points[i].time);});
});

test('deliberately held rough circles tolerate seven to nine percent radial wobble',()=>{
 for(const wobble of [.07,.09])for(const reverse of [false,true]){
  const points=ellipse(100,100,.4,241,Math.PI*2,0).map((p,i)=>{const r=1+wobble*Math.sin(i/240*Math.PI*6);return {...p,x:350+(p.x-350)*r,y:400+(p.y-400)*r};});
  if(reverse)points.reverse();const result=correctHeldShape(points);assert.equal(result?.kind,'circle');
  assert.equal(result.points.length,points.length);result.points.forEach((p,i)=>assert.equal(p.pressure,points[i].pressure));
 }
});
test('held rectangles allow a three percent bow without accepting severely distorted loops',()=>{
 const make=bow=>{const vertices=[[200,200],[400,200],[400,400],[200,400],[200,200]],points=[];
  for(let edge=0;edge<4;edge++)for(let i=0;i<60;i++){const t=i/60,a=vertices[edge],b=vertices[edge+1];points.push({x:a[0]+t*(b[0]-a[0])+(edge%2?bow*Math.sin(t*Math.PI):0),y:a[1]+t*(b[1]-a[1])+(edge%2?0:bow*Math.sin(t*Math.PI)),pressure:i/60});}points.push({...points[0]});return points;};
 assert.equal(correctHeldShape(make(6))?.kind,'polygon');assert.equal(correctHeldShape(make(30)),null);
});
test('large radial distortions are still rejected despite the explicit hold',()=>{
 for(const wobble of [.15,.2,.3])assert.equal(correctHeldShape(ellipse(100,100,0,241,Math.PI*2,wobble)),null);
});


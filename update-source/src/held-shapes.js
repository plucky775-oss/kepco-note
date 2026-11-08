/** Local geometry for deliberately held CLOSED ink, never release-time cleanup.
 * Coordinates are 900 x 1200 page units. No stroke or sample metadata is changed.
 * Intentionally excludes small handwriting, concave/complex loops and open curves.
 */
const TAU = Math.PI * 2;
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
function projection(p,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y,sq=dx*dx+dy*dy;
  const t=sq?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/sq)):0;
  const x=a.x+t*dx,y=a.y+t*dy;
  return {x,y,error:Math.hypot(p.x-x,p.y-y),t};
}
// Work and output bounds protect the interactive pointer path from imported or
// pathological dense strokes. Classification alone is simplified, never ink.
function simplify(points,tolerance) {
  const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
  let budget=points.length*18+1024;
  while(stack.length){const [a,b]=stack.pop();let error=tolerance,index=-1;
    for(let i=a+1;i<b;i++){if(--budget<0)return null;const e=projection(points[i],points[a],points[b]).error;if(e>error){error=e;index=i;}}
    if(index>=0){keep.add(index);if(keep.size>256)return null;stack.push([a,index],[index,b]);}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
function resample(points,count=128) {
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+distance(points[i-1],points[i]));
  const total=lengths.at(-1),out=[];let j=1;
  for(let i=0;i<count;i++){const target=total*i/(count-1);while(j<points.length-1&&lengths[j]<target)j++;const t=(target-lengths[j-1])/(lengths[j]-lengths[j-1]||1);out.push({x:points[j-1].x+(points[j].x-points[j-1].x)*t,y:points[j-1].y+(points[j].y-points[j-1].y)*t});}
  return {points:out,length:total};
}
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function intersects(points, closureRadius) {
  for(let i=0;i<points.length-1;i++)for(let j=i+2;j<points.length-1;j++){
    if(i===0&&j===points.length-2)continue;
    // A tiny finishing overshoot may cross the first edge; it is still one
    // loop. Only exempt adjacent closure-region segments, not internal knots.
    if(i<=1&&j>=points.length-4&&[points[i],points[i+1],points[j],points[j+1]].every(p=>distance(p,points[0])<=closureRadius))continue;
    const a=points[i],b=points[i+1],c=points[j],d=points[j+1];
    if(cross(a,b,c)*cross(a,b,d)<-1e-6&&cross(c,d,a)*cross(c,d,b)<-1e-6)return true;
  }return false;
}
function winding(points,cx,cy) {
  let total=0,back=0;const deltas=[];
  for(let i=1;i<points.length;i++){const a=Math.atan2(points[i-1].y-cy,points[i-1].x-cx),b=Math.atan2(points[i].y-cy,points[i].x-cx);const d=Math.atan2(Math.sin(b-a),Math.cos(b-a));deltas.push(d);total+=d;}
  const sign=Math.sign(total);for(const d of deltas)if(d*sign<0)back-=d*sign;
  return Math.abs(total)>=5.7&&Math.abs(total)<=6.65&&back<.22;
}
function polygon(guide,samples,extent) {
  const closed=[...guide.slice(0,-1),guide[0]];
  let opposite=1;for(let i=2;i<closed.length-1;i++)if(distance(closed[0],closed[i])>distance(closed[0],closed[opposite]))opposite=i;
  const a=simplify(closed.slice(0,opposite+1),extent*.035),b=simplify(closed.slice(opposite),extent*.035);
  if(!a||!b)return null;
  const vertices=[...a.slice(0,-1),...b.slice(0,-1)];
  // A stroke may start in the middle of an edge, not necessarily at a corner.
  for(let i=vertices.length-1;i>=0&&vertices.length>3;i--){const n=vertices.length;if(projection(vertices[i],vertices[(i+n-1)%n],vertices[(i+1)%n]).error<extent*.035)vertices.splice(i,1);}
  if(vertices.length<3||vertices.length>8)return null;
  let direction=0,perimeter=0;
  for(let i=0;i<vertices.length;i++){
    const a=vertices[(i+vertices.length-1)%vertices.length],b=vertices[i],c=vertices[(i+1)%vertices.length];
    const side=distance(b,c);perimeter+=side;
    const turn=Math.atan2(cross(a,b,c),(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y));
    if(Math.abs(turn)<.42||Math.abs(turn)>2.65||side<Math.max(18,extent*.12))return null;
    if(direction&&Math.sign(turn)!==direction)return null;direction=Math.sign(turn);
  }
  let sum=0,max=0;
  for(const p of samples){const error=Math.min(...vertices.map((a,i)=>projection(p,a,vertices[(i+1)%vertices.length]).error));sum+=error*error;max=Math.max(max,error);}
  // A deliberately held triangle/quadrilateral can have naturally bowed
  // sides. Keep tighter fitting for many-sided polygons so rounded ellipses
  // are not replaced by an accidental octagon.
  const simple=vertices.length<=4;
  if(Math.sqrt(sum/samples.length)>extent*(simple?.028:.014)||max>extent*(simple?.065:.04))return null;
  const pathLength=guide.slice(1).reduce((s,p,i)=>s+distance(guide[i],p),0);
  if(pathLength/perimeter<.87||pathLength/perimeter>1.13)return null;
  return vertices;
}
function polygonOutput(source,vertices) {
  // Project each original sample onto its nearest edge. Force each actual
  // corner into the closest original sample so the renderer cannot round a
  // missed vertex across an edge, while retaining pressure/timestamps/count.
  const out=source.map(p=>{let best=null;for(let i=0;i<vertices.length;i++){const q=projection(p,vertices[i],vertices[(i+1)%vertices.length]);if(!best||q.error<best.error)best=q;}return {...p,x:best.x,y:best.y};});
  for(const vertex of vertices){let at=0;for(let i=1;i<source.length-1;i++)if(distance(source[i],vertex)<distance(source[at],vertex))at=i;out[at]={...out[at],x:vertex.x,y:vertex.y};}
  out.at(-1).x=out[0].x;out.at(-1).y=out[0].y;return out;
}
function ellipse(samples,source) {
  // Uniform arc-length samples avoid bias from dwelling or drawing one side
  // slowly. PCA supplies rotation; projected extrema supply ellipse radii.
  const n=samples.length,cx0=samples.reduce((s,p)=>s+p.x,0)/n,cy0=samples.reduce((s,p)=>s+p.y,0)/n;
  let xx=0,xy=0,yy=0;for(const p of samples){const x=p.x-cx0,y=p.y-cy0;xx+=x*x;xy+=x*y;yy+=y*y;}
  const rotation=.5*Math.atan2(2*xy,xx-yy),cos=Math.cos(rotation),sin=Math.sin(rotation);
  const local=samples.map(p=>({x:(p.x-cx0)*cos+(p.y-cy0)*sin,y:-(p.x-cx0)*sin+(p.y-cy0)*cos}));
  const xs=local.map(p=>p.x),ys=local.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  let rx=(right-left)/2,ry=(bottom-top)/2;const mx=(right+left)/2,my=(bottom+top)/2,cx=cx0+mx*cos-my*sin,cy=cy0+mx*sin+my*cos;
  if(Math.min(rx,ry)<32||Math.min(rx,ry)/Math.max(rx,ry)<.3)return null;
  const errors=local.map(p=>Math.abs(Math.hypot((p.x-mx)/rx,(p.y-my)/ry)-1));
  if(Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/n)>.10||Math.max(...errors)>.24)return null;
  const kind=Math.min(rx,ry)/Math.max(rx,ry)>.9?'circle':'ellipse';
  if(kind==='circle')rx=ry=(rx+ry)/2;
  const out=source.map(p=>{const x=(p.x-cx)*cos+(p.y-cy)*sin,y=-(p.x-cx)*sin+(p.y-cy)*cos,a=Math.atan2(y/ry,x/rx);return {...p,x:cx+rx*Math.cos(a)*cos-ry*Math.sin(a)*sin,y:cy+rx*Math.cos(a)*sin+ry*Math.sin(a)*cos};});
  out.at(-1).x=out[0].x;out.at(-1).y=out[0].y;return {kind,points:out};
}
export function correctHeldShape(source) {
  if(!Array.isArray(source)||source.length<12||source.length>12000||!source.every(valid))return null;
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(const p of source){left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);}
  const extent=Math.max(right-left,bottom-top);
  if(!Number.isFinite(extent)||Math.min(right-left,bottom-top)<64)return null;
  // Admit a natural near-closure gap (~18 degrees on a circle), not a C/U.
  if(distance(source[0],source.at(-1))>extent*.16)return null;
  const guide=simplify(source,Math.max(1.5,extent*.02));if(!guide||guide.length<4)return null;
  const sampled=resample(guide),samples=sampled.points;
  if(sampled.length<extent*2.1||sampled.length>extent*4.8)return null;
  const cx=samples.reduce((s,p)=>s+p.x,0)/samples.length,cy=samples.reduce((s,p)=>s+p.y,0)/samples.length;
  if(!winding(guide,cx,cy)||intersects([...guide,guide[0]],extent*.2))return null;
  const vertices=polygon(guide,samples,extent);
  const result=vertices?{kind:'polygon',points:polygonOutput(source,vertices)}:ellipse(samples,source);
  // Do not clamp a fitted shape: it would distort its geometry and could make
  // persisted ink fail the same page-bound validation used for ordinary ink.
  if(!result||result.points.some(p=>!valid(p)||p.x<0||p.x>900||p.y<0||p.y>1200))return null;
  return result;
}


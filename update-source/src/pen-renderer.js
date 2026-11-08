import {MIN_PEN_WIDTH,MAX_PEN_WIDTH} from './pen-width.js';
export const PEN_KINDS=Object.freeze([
 {id:'pencil',label:'연필'},{id:'fountain',label:'만년필'},{id:'brush',label:'붓펜'},{id:'ballpoint',label:'볼펜'},
 {id:'highlighter',label:'형광펜'},{id:'marker',label:'사인펜'},{id:'colored-pencil',label:'색연필'},{id:'chalk',label:'분필'}
].map(Object.freeze));
export function normalizePenKind(id){return PEN_KINDS.some(p=>p.id===id)?id:'legacy';}
const LIMIT=2048,GRAIN_LIMIT=1600;
const widthOf=s=>Number.isFinite(s?.width)?Math.max(MIN_PEN_WIDTH,Math.min(MAX_PEN_WIDTH,s.width)):3;
const pressure=p=>Number.isFinite(p?.pressure)?Math.max(0,Math.min(1,p.pressure)):.5;
function factor(kind,p){switch(kind){case'brush':return .16+2.84*Math.pow(p,1.25);case'fountain':return .45+.65*Math.pow(p,.7);case'ballpoint':return .8+.4*p;case'marker':return .65+.85*p;case'highlighter':return 3;case'chalk':return 1.1+.9*p;case'pencil':case'colored-pencil':return .45+1.1*p;default:return 1;}}
export function maxStrokeRadius(stroke){return widthOf(stroke)*factor(normalizePenKind(stroke?.penKind),1)/2;}
const round=n=>Math.round(n*1000)/1000;
const point=(x,y)=>[round(x),round(y)];
function disc(x,y,r,steps=10){return Array.from({length:steps},(_,i)=>point(x+Math.cos(i*Math.PI*2/steps)*r,y+Math.sin(i*Math.PI*2/steps)*r));}
function hash(value){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0;}
function random(seed){let x=seed||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296}}
/** Deterministic bounded display geometry. Raw samples are never mutated.
 * Each layer is one nonzero compound fill: self crossings within a highlighter
 * stroke do not multiply alpha. Separate highlighter strokes do accumulate.
 * Samples above 2048 are evenly reduced only for display, including endpoints.
 */
export function strokeGeometry(stroke,points=stroke?.points){
 const valid=(Array.isArray(points)?points:[]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=900&&p.y>=0&&p.y<=1200);
 if(!valid.length)return [];
 const samples=valid.length<=LIMIT?valid:Array.from({length:LIMIT},(_,i)=>valid[Math.round(i*(valid.length-1)/(LIMIT-1))]);
 const kind=normalizePenKind(stroke?.penKind),width=widthOf(stroke),color=typeof stroke?.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(stroke.color)?stroke.color:'#223247';
 if(kind==='legacy')return [{type:'stroke',color,opacity:1,width,points:valid.map(p=>({x:p.x,y:p.y}))}];
 if(kind==='pencil')return pencilGeometry(stroke,samples,width,color);
 if(kind==='chalk')return chalkGeometry(stroke,samples,width,color);
 if(kind==='fountain')return fountainGeometry(samples,width,color,stroke);
 if(kind==='brush')return brushGeometry(samples,width,color,stroke?.brushTaper);
 const grainy=kind==='pencil'||kind==='colored-pencil';const polygons=[],segments=[];
 for(let i=0;i<samples.length;i++){
  const a=samples[i],r=width*factor(kind,pressure(a))/2;polygons.push(disc(a.x,a.y,r));
  if(i+1<samples.length){const b=samples[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)continue;const nx=-dy/len,ny=dx/len,rb=width*factor(kind,pressure(b))/2;
   polygons.push([point(a.x-nx*r,a.y-ny*r),point(b.x-nx*rb,b.y-ny*rb),point(b.x+nx*rb,b.y+ny*rb),point(a.x+nx*r,a.y+ny*r)]);segments.push({a,b,len,r,rb,nx,ny});}
 }
 const layers=[{color,opacity:kind==='highlighter'?.32:grainy?(kind==='pencil'?.11:.14):1,polygons}];
 if(grainy){
  const total=segments.reduce((sum,s)=>sum+s.len,0),count=Math.min(GRAIN_LIMIT,Math.max(12,Math.ceil(total*(kind==='colored-pencil'?1.6:1.05)))),grain=[];
  let index=0,offset=0;const seed=hash(String(stroke?.id||'').slice(0,100));
  for(let i=0;i<count;i++){
   const distance=total*(i+.5)/count;while(index<segments.length-1&&offset+segments[index].len<distance){offset+=segments[index].len;index++;}
   const seg=segments[index],t=seg?Math.max(0,Math.min(1,(distance-offset)/seg.len)):0,a=seg?.a||samples[0],b=seg?.b||a;
   const cx=a.x+(b.x-a.x)*t,cy=a.y+(b.y-a.y)*t,r=seg?seg.r+(seg.rb-seg.r)*t:width*factor(kind,pressure(a))/2;
   const rng=random(seed^hash(`${round(cx)},${round(cy)},${i}`)),angle=rng()*Math.PI*2,grainRadius=Math.min(r*.8,Math.max(.22,Math.min(.9,width*.13))*(.8+rng()*.4)),radial=Math.sqrt(rng())*Math.max(0,r-grainRadius);
   grain.push(disc(cx+Math.cos(angle)*radial,cy+Math.sin(angle)*radial,grainRadius,5));
  }
  layers.push({color,opacity:kind==='colored-pencil'?.84:.9,polygons:grain});
 }
 return layers;
}
/** Independently generated graphite deposition, not a sampled photograph.
 * A continuous low-contrast bed keeps fine lines legible. Irregular overlapping
 * paper-tooth flakes cover the full nib instead of a smooth central stripe.
 * Arc-length distribution, fixed seeds and bounded geometry are shared by
 * Canvas, previews and SVG/PDF; raw saved samples and nib bounds stay unchanged.
 */
function pencilGeometry(stroke,samples,width,color){
 const bed=[],grains=[[],[],[]],segments=[];
 const seed=hash(String(stroke?.id||'').slice(0,100));let total=0;
 for(let i=0;i<samples.length;i++){
  const a=samples[i],r=width*factor('pencil',pressure(a))/2;
  bed.push(disc(a.x,a.y,r));
  if(i+1===samples.length)continue;
  const b=samples[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)continue;
  const nx=-dy/len,ny=dx/len,rb=width*factor('pencil',pressure(b))/2;
  bed.push([point(a.x-nx*r,a.y-ny*r),point(b.x-nx*rb,b.y-ny*rb),point(b.x+nx*rb,b.y+ny*rb),point(a.x+nx*r,a.y+ny*r)]);
  segments.push({a,b,len,r,rb,nx,ny,start:total});total+=len;
 }
 const budget=width<=8?4096:8192,spacing=1/Math.max(3.5,width*2.5);
 const first=samples[0],last=samples.at(-1),firstRadius=width*factor('pencil',pressure(first))/2,lastRadius=width*factor('pencil',pressure(last))/2;
 const startCap=total?Math.PI*firstRadius/4:0,endCap=total?Math.PI*lastRadius/4:0,extent=total+startCap+endCap;
 const count=total?Math.min(budget,Math.max(1,Math.floor(extent/spacing))):Math.min(budget,Math.max(12,Math.ceil(Math.PI*(width/2)**2*12)));
 const step=total?Math.max(spacing,extent/budget):0;
 let index=0;
 for(let i=0;i<count;i++){
  const rng=random(seed^Math.imul(i+1,2654435761)),distance=(i+.05+.9*rng())*step-startCap;
  while(index<segments.length-1&&segments[index].start+segments[index].len<distance)index++;
  const cap=total&&(distance<0||distance>total),seg=cap?(distance<0?segments[0]:segments.at(-1)):segments[index];
  const a=cap?(distance<0?first:last):seg?.a||first,b=cap?a:seg?.b||a,t=cap?0:seg?Math.max(0,Math.min(1,(distance-seg.start)/seg.len)):0;
  const p=pressure(a)+(pressure(b)-pressure(a))*t,r=cap?width*factor('pencil',p)/2:seg?seg.r+(seg.rb-seg.r)*t:width*factor('pencil',p)/2;
  // As coverage reaches its cap, broaden each irregular flake modestly rather
  // than increasing paths without bound. Fine writing never gets coarse dots.
  const areaPerFlake=total?width*step:Math.PI*r*r/count;
  const size=Math.min(r*.48,1.15,Math.max(.19,Math.sqrt(areaPerFlake)*.85))*(.6+.65*rng())*(.7+.3*p);
  const angle=rng()*Math.PI*2;
  let cx=a.x+(b.x-a.x)*t,cy=a.y+(b.y-a.y)*t;
  if(cap){const radial=Math.sqrt(rng())*Math.max(0,r-size),theta=(rng()-.5)*Math.PI;const tx=(seg.b.x-seg.a.x)/seg.len,ty=(seg.b.y-seg.a.y)/seg.len,sign=distance<0?-1:1;cx+=sign*tx*Math.cos(theta)*radial+seg.nx*Math.sin(theta)*radial;cy+=sign*ty*Math.cos(theta)*radial+seg.ny*Math.sin(theta)*radial;}
  else if(seg){const cross=(rng()*2-1)*Math.max(0,r-size);cx+=seg.nx*cross;cy+=seg.ny*cross;}
  else{const radial=Math.sqrt(rng())*Math.max(0,r-size);cx+=Math.cos(angle)*radial;cy+=Math.sin(angle)*radial;}
  // Low-frequency, non-periodic spatial variation changes graphite density;
  // independent fine flakes avoid rows, stamps and a repeating texture tile.
  const cell=hash(`${Math.floor(cx/7)},${Math.floor(cy/7)}`)^seed;
  const density=(cell>>>0)/4294967296;
  const tone=Math.min(2,Math.floor(rng()*2+p*.65+density*.45));
  grains[tone].push(Array.from({length:3},(_,j)=>{const theta=angle+j*Math.PI*2/3,rad=size*(.7+.3*rng());return point(cx+Math.cos(theta)*rad,cy+Math.sin(theta)*rad);}));
 }
 const baseOpacity=.20+.10*Math.max(0,1-width/6);
 return [{color,opacity:baseOpacity,polygons:bed},...grains.map((polygons,i)=>({color,opacity:[.24,.36,.48][i],polygons}))];
}
/** A soft oval nib held at 22.5 degrees keeps directional character without
 * the flat shoulders of a capsule. Swept convex footprints share one opaque
 * fill, so pressure changes and turns do not accumulate dark overlapping ink.
 */
function fountainNib(x,y,r){
 const angle=Math.PI/8,ux=Math.cos(angle),uy=Math.sin(angle);
 return Array.from({length:16},(_,i)=>{
  const theta=i*Math.PI/8,a=r*Math.cos(theta),b=r*.5*Math.sin(theta);
  return [x+ux*a-uy*b,y+uy*a+ux*b];
 });
}
function fountainHull(vertices){
 const sorted=vertices.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const half=points=>{const result=[];for(const p of points){while(result.length>1&&cross(result.at(-2),result.at(-1),p)<=0)result.pop();result.push(p);}return result;};
 const low=half(sorted),high=half(sorted.slice().reverse());low.pop();high.pop();return [...low,...high].map(p=>point(...p));
}
export function normalizeFountainTaper(value){return normalizeBrushTaper(value);}
function fountainGeometry(samples,width,color,stroke){
 const distances=[0];
 for(let i=1;i<samples.length;i++)distances.push(distances[i-1]+Math.hypot(samples[i].x-samples[i-1].x,samples[i].y-samples[i-1].y));
 const total=distances.at(-1);
 if(total<.001)return [{color,opacity:1,polygons:[fountainNib(samples[0].x,samples[0].y,width*factor('fountain',pressure(samples[0]))/2).map(p=>point(...p))]}];
 const count=Math.min(LIMIT,Math.max(2,Math.ceil(total/1.25)+1)),step=total/(count-1),centers=[];let segment=1;
 for(let i=0;i<count;i++){
  const distance=i*step;
  while(segment<samples.length-1&&distances[segment]<distance)segment++;
  const a=samples[segment-1],b=samples[segment],t=Math.max(0,Math.min(1,(distance-distances[segment-1])/(distances[segment]-distances[segment-1]||1)));
  centers.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,p:pressure(a)+(pressure(b)-pressure(a))*t});
 }
 // At most seven neighbors, at most four page units each side. Pressure
 // smoothing changes only the nib envelope, not the sampled centerline.
 const reach=Math.min(3,Math.floor(4/step)),radii=centers.map((p,i)=>{
  let sum=0,weight=0;
  for(let j=Math.max(0,i-reach);j<=Math.min(count-1,i+reach);j++){const w=reach+1-Math.abs(j-i);sum+=centers[j].p*w;weight+=w;}
  return width*factor('fountain',sum/weight)/2;
 });
 // Entry and exit easing live in the original arc domain. Erased cuts
 // therefore expose the existing nib rather than creating fresh pen lifts.
 const domain=normalizeFountainTaper(stroke?.fountainTaper)||{start:0,end:total,total};
 const shortLimit=Math.max(6,width*1.5),lift=Math.max(0,Math.min(1,(domain.total-shortLimit)/shortLimit));
 const entry=Math.min(domain.total*.12,Math.max(2,width*1.2),12);
 const tail=Math.min(domain.total*.22,Math.max(4,width*3),24);
 const closedShape=['circle','ellipse','polygon'].includes(stroke?.heldShape);
 const ease=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
 const nibs=centers.map((p,i)=>{
  const along=domain.start+(domain.end-domain.start)*i/(count-1),remaining=domain.total-along;
  const startScale=1-lift*.58*(1-ease(along/entry));
  const endScale=1-lift*.8*(1-ease(remaining/tail));
  return fountainNib(p.x,p.y,radii[i]*(closedShape?1:Math.min(startScale,endScale)));
 }),polygons=[];
 for(let i=0;i<count;i++){
  polygons.push(nibs[i].map(p=>point(...p)));
  if(i+1<count)polygons.push(fountainHull([...nibs[i],...nibs[i+1]]));
 }
 return [{color,opacity:1,polygons}];
}
/** Brush ink is ONE opaque fill, not stacked translucent passes. Resampling
 * by traveled distance makes the nib envelope independent of pointer event
 * density; fixed display budgets leave the original pressure samples untouched.
 * Mouse/non-pressure input uses the same .5 fallback as other pens. */
export function normalizeBrushTaper(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const {start,end,total}=value;
 return [start,end,total].every(Number.isFinite)&&start>=0&&end>start&&total>=end&&total<=18000000?{start,end,total}:null;
}
function brushGeometry(samples,width,color,taperMetadata){
 const distances=[0];
 for(let i=1;i<samples.length;i++)distances.push(distances[i-1]+Math.hypot(samples[i].x-samples[i-1].x,samples[i].y-samples[i-1].y));
 const total=distances.at(-1);
 if(total<.001)return [{color,opacity:1,polygons:[disc(samples[0].x,samples[0].y,width*factor('brush',pressure(samples[0]))/2,16)]}];
 const count=Math.min(LIMIT,Math.max(3,Math.ceil(total/1.25)+1)),centers=[];let segment=1;
 for(let i=0;i<count;i++){
  const distance=total*i/(count-1);
  while(segment<samples.length-1&&distances[segment]<distance)segment++;
  const a=samples[segment-1],b=samples[segment],t=(distance-distances[segment-1])/(distances[segment]-distances[segment-1]||1);
  centers.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,r:width*factor('brush',pressure(a)+(pressure(b)-pressure(a))*t)/2,distance});
 }
 const domain=normalizeBrushTaper(taperMetadata)||{start:0,end:total,total};
 const taperLength=Math.min(domain.total*.28,Math.max(5,width*2.5));
 const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 const radii=centers.map((p,i)=>{
  // A local three-sample filter suppresses pressure chatter without flattening
  // expressive pressure changes. Tapers use distance, not event counts.
  const r=(centers[Math.max(0,i-1)].r+2*p.r+centers[Math.min(count-1,i+1)].r)/4;
  const distance=domain.start+(domain.end-domain.start)*p.distance/total;
  return r*Math.min(.14+.86*ease(distance/taperLength),.05+.95*ease((domain.total-distance)/taperLength));
 });
 const polygons=[];
 for(let i=0;i<count;i++){
  const a=centers[i],r=radii[i];polygons.push(disc(a.x,a.y,r,12));
  if(i===count-1)continue;
  const b=centers[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(!len)continue;
  const nx=-dy/len,ny=dx/len,rb=radii[i+1];
  polygons.push([point(a.x-nx*r,a.y-ny*r),point(b.x-nx*rb,b.y-ny*rb),point(b.x+nx*rb,b.y+ny*rb),point(a.x+nx*r,a.y+ny*r)]);
 }
 return [{color,opacity:1,polygons}];
}
/** A single compound fill of deterministic chalk grains; no filters or masks.
 * Broad chalk stays porous: its grain radius grows with sqrt(area), not nib
 * width. A hard grain cap and a 6144-triangle broad-grain budget prevent both
 * marker-like coverage and export cost increasing with a thick nib. */
function chalkGeometry(stroke,samples,width,color){
 const segments=[];let total=0;
 for(let i=1;i<samples.length;i++){const a=samples[i-1],b=samples[i],len=Math.hypot(b.x-a.x,b.y-a.y);if(len){segments.push({a,b,len,start:total});total+=len;}}
 const count=width<=5?Math.min(2400,Math.max(24,Math.ceil(total*4))):Math.min(6144,Math.max(48,Math.ceil(total*10),Math.ceil(width*width*1.5))),polygons=[];
 const seed=hash(String(stroke?.id||'chalk').slice(0,100));let index=0;
 for(let i=0;i<count;i++){
  const along=total*(i+.5)/count;while(index<segments.length-1&&segments[index].start+segments[index].len<along)index++;
  const seg=segments[index],a=seg?.a||samples[0],b=seg?.b||a,t=seg?(along-seg.start)/seg.len:0;
  const r=width*factor('chalk',pressure(a)+(pressure(b)-pressure(a))*t)/2;
  const rng=random(seed^hash(String(i))),angle=rng()*Math.PI*2;
  // Retain historical fine chalk exactly. Broad grains use a coverage budget,
  // leaving real unpainted holes rather than simulated lighter solid ink.
  if(width<=5){
   const grain=Math.min(r*.52,Math.max(.28,width*.16))*(.7+rng()*.6),offset=Math.sqrt(rng())*Math.max(0,r-grain);
   const cx=a.x+(b.x-a.x)*t+Math.cos(angle)*offset,cy=a.y+(b.y-a.y)*t+Math.sin(angle)*offset;
   polygons.push(disc(cx,cy,grain,5));continue;
  }
  const area=total>0?total*2*r:Math.PI*r*r;
  const target=Math.sqrt(area*1.5/(count*Math.PI));
  const grain=Math.min(r*.35,1.5,Math.max(.18,target)*(.45+rng()*.7));
  let cx=a.x+(b.x-a.x)*t,cy=a.y+(b.y-a.y)*t;
  if(seg){
   // Uniform cross-nib placement avoids the center-heavy overlap of disks
   // scattered radially around every densely sampled centerline point.
   const offset=(rng()*2-1)*Math.max(0,r-grain),nx=-(b.y-a.y)/seg.len,ny=(b.x-a.x)/seg.len;
   cx+=nx*offset;cy+=ny*offset;
  }else{
   const offset=Math.sqrt(rng())*Math.max(0,r-grain);cx+=Math.cos(angle)*offset;cy+=Math.sin(angle)*offset;
  }
  // Three tiny, rotated points read as uneven powder rather than round confetti.
  // 6144×3 vertices stay close to the former 2400×5 path complexity.
  polygons.push(Array.from({length:3},(_,j)=>{const theta=angle+j*Math.PI*2/3;return point(cx+Math.cos(theta)*grain,cy+Math.sin(theta)*grain);}));
 }
 return [{color,opacity:.9,polygons}];
}
function legacyPath(points){if(points.length===1)return `M${points[0].x} ${points[0].y}l0.01 0`;return points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');}
function pathData(polygons){return polygons.map(p=>'M'+p.map(v=>v.join(' ')).join('L')+'Z').join('');}
export function strokeSvg(stroke,points=stroke?.points){return strokeGeometry(stroke,points).map(layer=>layer.type==='stroke'?`<path d="${legacyPath(layer.points)}" fill="none" stroke="${layer.color}" stroke-width="${layer.width}" stroke-linecap="round" stroke-linejoin="round"/>`:`<path d="${pathData(layer.polygons)}" fill="${layer.color}" fill-opacity="${layer.opacity}" fill-rule="nonzero"/>`).join('');}
export function drawStyledStroke(ctx,stroke,points=stroke?.points){ctx.save();try{ctx.globalCompositeOperation='source-over';for(const layer of strokeGeometry(stroke,points)){ctx.fillStyle=layer.color;ctx.globalAlpha=layer.opacity;ctx.beginPath();if(layer.type==='stroke'){ctx.strokeStyle=layer.color;ctx.lineWidth=layer.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash?.([]);layer.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(layer.points.length===1)ctx.lineTo(layer.points[0].x+.01,layer.points[0].y);ctx.stroke();continue;}for(const polygon of layer.polygons){ctx.moveTo(...polygon[0]);for(let i=1;i<polygon.length;i++)ctx.lineTo(...polygon[i]);ctx.closePath();}ctx.fill('nonzero');}}finally{ctx.restore();}}


export function liveStrokeSvg(stroke,points=stroke?.points){
 const kind=normalizePenKind(stroke?.penKind);
 if(stroke?.pointerType!=='touch'||!['ballpoint','marker','highlighter','legacy'].includes(kind))return strokeSvg(stroke,points);
 const valid=(Array.isArray(points)?points:[]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=900&&p.y>=0&&p.y<=1200);
 if(!valid.length)return '';
 const color=typeof stroke.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(stroke.color)?stroke.color:'#223247';
 return `<path d="${legacyPath(valid)}" fill="none" stroke="${color}" stroke-width="${widthOf(stroke)*factor(kind,.5)}" stroke-opacity="${kind==='highlighter'?.32:1}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

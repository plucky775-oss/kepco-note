const WIDTH=900,HEIGHT=1200;
// Persisted IDs: keep the original ruled/grid/plain geometry and IDs stable.
export const PAPER_TYPES=Object.freeze([
 ['ruled','줄 노트'],['ruled-narrow','좁은 줄'],['ruled-wide','넓은 줄'],['ruled-margin','여백 줄'],
 ['grid','모눈'],['grid-fine','작은 모눈'],['dots','도트'],['cornell','코넬 줄'],
 ['cornell-grid','코넬 모눈'],['music','오선지'],['handwriting','영어노트 (4선)'],['plain','무지']
].map(([id,label])=>Object.freeze({id,label})));
export function normalizePaperType(id){return PAPER_TYPES.some(p=>p.id===id)?id:'ruled';}
// Thin horizontal twin-wire loops, shared by covers, paper SVG and Canvas export.
// All hardware stays inside the existing 36px edge. No ink coordinate changes.
// Legacy binding metadata is retained in saved notes but no longer rendered.
function addBinding(shapes){return shapes;}
const families=[
 ['ivory','미색','#fffdf6','#c9b98c'],['blue','블루','#f5faff','#9ebbd1'],['green','그린','#f7fcf8','#a4bda9'],['red','로즈','#fff8f8','#d4a8ac'],
 // Append only: saved theme IDs and the original palette remain unchanged.
 ['peach','피치','#fff0e6','#d7ad91'],['butter','버터','#fff8d9','#cabb78'],
 ['mint','민트','#eaf8ef','#94bba5'],['sky','하늘','#eaf4ff','#96b6d6'],
 ['lavender','라벤더','#f2edff','#b3a0d0'],['pink','핑크','#ffeef4','#d1a0b4'],
 ['sand','샌드','#f5eedf','#bcb092'],['gray','그레이','#eef0f2','#adb5bd']
];
const variants=[['minimal','미니멀'],['frame','프레임'],['corner','코너']];
export const PAPER_THEMES=Object.freeze([{id:'white',label:'화이트',family:'white',color:'#ffffff'},{id:'chalkboard',label:'초록 칠판',family:'chalkboard',color:'#174b3b'},...families.flatMap(([family,label,color])=>variants.map(([variant,name])=>({id:family+'-'+variant,label:label+' · '+name,family,color})))].map(Object.freeze));
export function normalizePaperTheme(id){return PAPER_THEMES.some(theme=>theme.id===id)?id:'white';}
// All geometry is original, code-native and restricted to the page edges.
// A shared display list keeps SVG and downloaded PNG backgrounds identical.
function primitives(page={}){
 const theme=PAPER_THEMES.find(t=>t.id===normalizePaperTheme(page?.paperTheme));
 const paper=normalizePaperType(page?.paper);
 const shapes=[{type:'rect',x:0,y:0,width:WIDTH,height:HEIGHT,fill:theme.color}];
 const line=(x1,y1,x2,y2,stroke,width=1)=>shapes.push({type:'line',x1,y1,x2,y2,stroke,width});
 if(theme.id==='chalkboard'){
  shapes.push({type:'rect',x:12,y:12,width:876,height:1176,stroke:'#426e59',widthStroke:2});
  // Quiet code-native chalkboard grain; fixed display list shared by all outputs.
  for(let i=0;i<84;i++){const x=26+(i*137)%848,y=30+(i*193)%1138;line(x,y,x+3+(i%7),y,'#1c503f',.6);}
  return addBinding(shapes,page);
 }
 if(paper==='ruled')for(let y=144;y<=1128;y+=48)line(48,y,852,y,'#e0e6ec');
 if(paper==='grid'){for(let x=24;x<WIDTH;x+=24)line(x,0,x,HEIGHT,'#e8edf2');for(let y=24;y<HEIGHT;y+=24)line(0,y,WIDTH,y,'#e8edf2');}
 const ink='#d6dfe8',light='#e8edf2';
 if(paper==='ruled-narrow'||paper==='ruled-wide'||paper==='ruled-margin'){
  const gap=paper==='ruled-narrow'?32:paper==='ruled-wide'?64:48;
  for(let y=144;y<=1128;y+=gap)line(48,y,852,y,ink);
  if(paper==='ruled-margin')line(120,96,120,1140,'#dfb5b7',1.2);
 }
 if(paper==='grid-fine'){
  for(let x=24;x<=876;x+=12)line(x,24,x,1176,x%60===0?ink:light,x%60===0?1:.65);
  for(let y=24;y<=1176;y+=12)line(24,y,876,y,y%60===0?ink:light,y%60===0?1:.65);
 }
 if(paper==='dots')for(let y=48;y<=1152;y+=24)for(let x=48;x<=852;x+=24)shapes.push({type:'circle',cx:x,cy:y,r:1.25,fill:'#bbc8d4'});
 if(paper==='cornell'||paper==='cornell-grid'){
  line(48,120,852,120,ink,1.5);line(48,1008,852,1008,ink,1.5);line(240,120,240,1008,ink,1.5);
  if(paper==='cornell')for(let y=168;y<1008;y+=48)line(252,y,852,y,light);
  else{for(let x=264;x<=852;x+=24)line(x,120,x,1008,light);for(let y=144;y<1008;y+=24)line(240,y,852,y,light);}
  for(let y=1056;y<=1152;y+=48)line(48,y,852,y,light);
 }
 if(paper==='music')for(let top=132;top<=1092;top+=120)for(let n=0;n<5;n++)line(60,top+n*12,840,top+n*12,'#b9c5d1',1.2);
 if(paper==='handwriting')for(let top=120;top<=1080;top+=120){
  // Four English handwriting guides: ascender, dotted x-height, baseline, descender.
  line(48,top,852,top,'#b9cadb');line(48,top+48,852,top+48,'#cc9da6',1.2);line(48,top+72,852,top+72,'#b9cadb');
  for(let x=48;x<852;x+=12)line(x,top+24,Math.min(x+6,852),top+24,'#c6d2df');
 }
 if(theme.id==='white')return addBinding(shapes,page);
 const accent=families.find(([family])=>family===theme.family)[3],variant=theme.id.slice(theme.family.length+1);
 if(variant==='minimal'){
  line(24,72,24,1128,accent,2);line(876,72,876,1128,accent,2);
  line(72,24,828,24,accent,1);line(72,1176,828,1176,accent,1);
 }else if(variant==='frame'){
  shapes.push({type:'rect',x:18,y:18,width:864,height:1164,stroke:accent,widthStroke:1.5});
  shapes.push({type:'rect',x:25,y:25,width:850,height:1150,stroke:accent,widthStroke:.5});
 }else{
  for(const [x,y,dx,dy] of [[24,24,1,1],[876,24,-1,1],[24,1176,1,-1],[876,1176,-1,-1]]){
   line(x,y,x+dx*48,y,accent,1.5);line(x,y,x,y+dy*48,accent,1.5);
   shapes.push({type:'circle',cx:x+dx*9,cy:y+dy*9,r:2.5,fill:accent});
  }
 }
 return addBinding(shapes,page);
}
function svgShape(s){
 if(s.type==='text')return `<text x="${s.x}" y="${s.y}" font-size="${s.size}" font-family="sans-serif" fill="${s.fill}">${s.text.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</text>`;
 if(s.type==='line')return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.stroke}" stroke-width="${s.width}"/>`;
 if(s.type==='ellipse')return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" fill="none" stroke="${s.stroke}" stroke-width="${s.width}"/>`;
 if(s.type==='circle')return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.fill}"/>`;
 return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="${s.fill||'none'}"${s.stroke?` stroke="${s.stroke}" stroke-width="${s.widthStroke}"`:''}/>`;
}
export function paperBackgroundSvg(page={}){return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">${primitives(page).map(svgShape).join('')}</svg>`;}
export function drawPaperBackground(ctx,page={}){
 ctx.save();try{ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.lineCap='butt';ctx.lineJoin='miter';ctx.setLineDash?.([]);
 for(const s of primitives(page)){
  if(s.type==='rect'){if(s.fill){ctx.fillStyle=s.fill;ctx.fillRect(s.x,s.y,s.width,s.height);}else{ctx.strokeStyle=s.stroke;ctx.lineWidth=s.widthStroke;ctx.strokeRect(s.x,s.y,s.width,s.height);}}
  else if(s.type==='line'){ctx.beginPath();ctx.strokeStyle=s.stroke;ctx.lineWidth=s.width;ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);ctx.stroke();}
  else if(s.type==='text'){ctx.fillStyle=s.fill;ctx.font=s.size+'px sans-serif';ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.direction='ltr';ctx.fillText(s.text,s.x,s.y);}
  else if(s.type==='ellipse'){ctx.beginPath();ctx.strokeStyle=s.stroke;ctx.lineWidth=s.width;ctx.ellipse(s.cx,s.cy,s.rx,s.ry,0,0,Math.PI*2);ctx.stroke();}
  else{ctx.beginPath();ctx.fillStyle=s.fill;ctx.arc(s.cx,s.cy,s.r,0,Math.PI*2);ctx.fill();}
 }
 }finally{ctx.restore();}
}


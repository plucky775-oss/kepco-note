/** Original, local-only cover designs. IDs are persisted; never rename old IDs.
 * Geometry and colors are fixed allowlisted constants, not imported CSS/artwork.
 */
const LEGACY_COVER_PRESETS=Object.freeze([
 {id:'midnight',label:'미드나이트',color:'#253348',ink:'#f5f3ed',design:'solid'},
 {id:'ivory',label:'아이보리',color:'#eee8dc',ink:'#3b3b38',design:'solid'},
 {id:'slate',label:'슬레이트',color:'#6b7783',ink:'#ffffff',design:'solid'},
 {id:'clay',label:'클레이',color:'#ac8070',ink:'#ffffff',design:'solid'},
 {id:'lavender',label:'라벤더',color:'#b5acc6',ink:'#302c40',design:'solid'},
 {id:'navy-block',label:'네이비 컬러블록',color:'#f1ece2',ink:'#24354b',design:'block',accent:'#344d68',secondary:'#b8c6d0'},
 {id:'clay-block',label:'클레이 컬러블록',color:'#eee3d7',ink:'#493c38',design:'diagonal',accent:'#ac7866',secondary:'#d0ad98'},
 {id:'ivory-stripe',label:'아이보리 스트라이프',color:'#f6f1e6',ink:'#374558',design:'stripe',accent:'#9aabb9'},
 {id:'blue-pinstripe',label:'블루 핀스트라이프',color:'#637b92',ink:'#fffaf0',design:'pinstripe',accent:'#d9e2e8'},
 {id:'navy-label',label:'네이비 프레임',color:'#253348',ink:'#f5f3ed',design:'frame',accent:'#c5c4b2'},
 {id:'ivory-label',label:'아이보리 라벨',color:'#f1e8d8',ink:'#454647',design:'label',accent:'#a78b68',secondary:'#fff9ed'},
 {id:'blue-grid',label:'미스트 블루 그리드',color:'#e7edf0',ink:'#30465b',design:'grid',accent:'#a2b2bf'},
 {id:'clay-arch',label:'클레이 아치',color:'#efe7de',ink:'#3d3330',design:'arch',accent:'#c7a28f',secondary:'#e0c6b3'},
 {id:'sand-speckle',label:'샌드 스페클',color:'#eee7db',ink:'#38434a',design:'speckle',accent:'#9b8d7f'},
 {id:'slate-orbit',label:'슬레이트 오빗',color:'#e6e9e8',ink:'#394e63',design:'orbit',accent:'#8398a9',secondary:'#d3b7a5'}
].map(Object.freeze));
/** Approved original cover artworks. Paths are allowlisted bundled assets, never imported URLs. */
export const COVER_CATEGORIES=Object.freeze([
 {id:'all',label:'전체'},{id:'power',label:'배전'},{id:'transmission',label:'송변전'},{id:'ai',label:'신경망'},{id:'masterpiece',label:'명화'},{id:'simple',label:'심플'},{id:'classic',label:'클래식'},{id:'natural',label:'내추럴'},{id:'modern',label:'모던'},{id:'art',label:'아트'}
].map(Object.freeze));
const ORIGINAL_ART_PRESETS=Object.freeze([
 ['네이비 골드','classic','#182331','#f1cb83'],
 ['아이보리 리넨','natural','#eee5d6','#45413b'],
 ['블루 오렌지 폴드','modern','#285a7f','#ffffff'],
 ['차콜 세이지','classic','#424943','#edf0df'],
 ['버건디 코퍼','classic','#592e39','#e7bd9e'],
 ['파우더 블루 실버','natural','#c4d5e1','#34495b'],
 ['크라프트 보태니컬','natural','#bba184','#334631'],
 ['플럼 라벤더','art','#69546e','#f0e7ee'],
 ['코냑 스웨이드','classic','#a86d45','#fff3de'],
 ['펄 마블','modern','#eeeae6','#43474c'],
 ['미드나이트 셀레스티얼','art','#1e2b46','#e5ce8d'],
 ['테라코타 위브','natural','#b5755b','#fff1dc'],
 ['아이스 그레이','modern','#dbe2e3','#39474d'],
 ['더스티 로즈','modern','#cba6a4','#523d43'],
 ['딥 틸','art','#205653','#e7d3a6'],
 ['아이보리 수묵 산수','art','#e5d8bf','#393936']
].map(([label,category,color,ink],index)=>{const number=String(index+1).padStart(2,'0');return Object.freeze({id:'art-'+number,label,category,color,ink,design:'image',image:'./notebook-covers/'+number+'.webp',thumbnail:'./notebook-covers/'+number+'-thumb.webp'});}));
// Museum artwork presets are append-only; original IDs and order stay unchanged.
export const MASTERPIECE_COVER_PRESETS=Object.freeze([{"id": "masterpiece-van-gogh-wheat-field", "label": "고흐 · 사이프러스가 있는 밀밭", "category": "masterpiece", "color": "#f3eee3", "ink": "#34312b", "design": "image", "image": "./notebook-covers/van-gogh-wheat-field.webp", "thumbnail": "./notebook-covers/van-gogh-wheat-field-thumb.webp"}, {"id": "masterpiece-van-gogh-sunflowers", "label": "고흐 · 해바라기", "category": "masterpiece", "color": "#f3eee3", "ink": "#34312b", "design": "image", "image": "./notebook-covers/van-gogh-sunflowers.webp", "thumbnail": "./notebook-covers/van-gogh-sunflowers-thumb.webp"}, {"id": "masterpiece-manet-monet-garden", "label": "마네 · 정원의 모네 가족", "category": "masterpiece", "color": "#f3eee3", "ink": "#34312b", "design": "image", "image": "./notebook-covers/manet-monet-garden.webp", "thumbnail": "./notebook-covers/manet-monet-garden-thumb.webp"}, {"id": "masterpiece-renoir", "label": "르누아르 · 바닷가에서", "category": "masterpiece", "color": "#f3eee3", "ink": "#34312b", "design": "image", "image": "./notebook-covers/renoir.webp", "thumbnail": "./notebook-covers/renoir-thumb.webp"}, {"id": "masterpiece-degas-vase-of-flowers", "label": "드가 · 꽃병 옆의 여인", "category": "masterpiece", "color": "#f3eee3", "ink": "#34312b", "design": "image", "image": "./notebook-covers/degas-vase-of-flowers.webp", "thumbnail": "./notebook-covers/degas-vase-of-flowers-thumb.webp"}, {"id": "masterpiece-david-death-of-socrates", "label": "다비드 · 소크라테스의 죽음", "category": "masterpiece", "color": "#f3eee3", "ink": "#34312b", "design": "image", "image": "./notebook-covers/david-death-of-socrates.webp", "thumbnail": "./notebook-covers/david-death-of-socrates-thumb.webp"}, {"id": "masterpiece-vermeer-water-pitcher", "label": "베르메르 · 물주전자를 든 여인", "category": "masterpiece", "color": "#f3eee3", "ink": "#34312b", "design": "image", "image": "./notebook-covers/vermeer-water-pitcher.webp", "thumbnail": "./notebook-covers/vermeer-water-pitcher-thumb.webp"}, {"id": "masterpiece-cezanne-card-players", "label": "세잔 · 카드놀이하는 사람들", "category": "masterpiece", "color": "#f3eee3", "ink": "#34312b", "design": "image", "image": "./notebook-covers/cezanne-card-players.webp", "thumbnail": "./notebook-covers/cezanne-card-players-thumb.webp"}, {"id": "masterpiece-seurat-circus-sideshow", "label": "쇠라 · 서커스의 객몰이", "category": "masterpiece", "color": "#f3eee3", "ink": "#34312b", "design": "image", "image": "./notebook-covers/seurat-circus-sideshow.webp", "thumbnail": "./notebook-covers/seurat-circus-sideshow-thumb.webp"}, {"id": "masterpiece-turner-venice", "label": "터너 · 베네치아", "category": "masterpiece", "color": "#f3eee3", "ink": "#34312b", "design": "image", "image": "./notebook-covers/turner-venice.webp", "thumbnail": "./notebook-covers/turner-venice-thumb.webp"}, {"id": "masterpiece-leutze-washington-delaware", "label": "로이체 · 워싱턴의 델라웨어강 도하", "category": "masterpiece", "color": "#f3eee3", "ink": "#34312b", "design": "image", "image": "./notebook-covers/leutze-washington-delaware.webp", "thumbnail": "./notebook-covers/leutze-washington-delaware-thumb.webp"}, {"id": "masterpiece-labille-guiard-self-portrait", "label": "라비유기아르 · 두 제자와 자화상", "category": "masterpiece", "color": "#f3eee3", "ink": "#34312b", "design": "image", "image": "./notebook-covers/labille-guiard-self-portrait.webp", "thumbnail": "./notebook-covers/labille-guiard-self-portrait-thumb.webp"}].map(Object.freeze));
export const AI_COVER_PRESETS=Object.freeze([
 ['블루 뉴럴 네트워크','#082344','#f0f8ff'],['바이올렛 시그널','#514269','#fcf6ff'],['아이보리 브레인','#e8dfd0','#51432e'],['딥 틸 코스모스','#07363e','#f6edce']
].map(([label,color,ink],i)=>{const n=String(i+1).padStart(2,'0');return Object.freeze({id:'ai-'+n,label,category:'ai',color,ink,design:'image',image:'./notebook-covers/ai-'+n+'.webp',thumbnail:'./notebook-covers/ai-'+n+'-thumb.webp'});}));
export const POWER_COVER_PRESETS=Object.freeze([
 ['배전선로의 아침'],['배전 현장 작업'],['주상변압기'],['지중 배전 공사']
].map(([label],i)=>{const n=String(i+1).padStart(2,'0');return Object.freeze({id:'power-'+n,label,imageWidth:1086,category:'power',color:'#102f56',ink:'#fff6db',design:'image',image:'./notebook-covers/power-'+n+'.webp',thumbnail:'./notebook-covers/power-'+n+'-thumb.webp'});}));
export const TRANSMISSION_COVER_PRESETS=Object.freeze([["송전선로의 노을", "#14263f", "#fff1cc"], ["산속 변전소", "#14263f", "#fff1cc"], ["송전 철탑 골드", "#14263f", "#fff1cc"], ["변전소 아이보리", "#eee5d4", "#584426"]].map(([label,color,ink],i)=>{const id='transmission-'+String(i+1).padStart(2,'0');return Object.freeze({id,label,category:'transmission',color,ink,design:'image',imageWidth:1086,image:'./notebook-covers/'+id+'.webp',thumbnail:'./notebook-covers/'+id+'-thumb.webp'});}));
export const ART_COVER_PRESETS=Object.freeze([...ORIGINAL_ART_PRESETS,...POWER_COVER_PRESETS,...TRANSMISSION_COVER_PRESETS,...AI_COVER_PRESETS,...MASTERPIECE_COVER_PRESETS]);
// Keep every old ID in place: old notebooks, copied imports and backups retain identity.
export const COVER_PRESETS=Object.freeze([...LEGACY_COVER_PRESETS,...ART_COVER_PRESETS]);
export function normalizeBinding(value){return value==='spring'?'spring':'bound';}
export function normalizeCoverTitleSize(value){return typeof value==='number'&&Number.isFinite(value)?Math.max(80,Math.min(180,Math.round(value/10)*10)):100;}
export function normalizeCover(value){return COVER_PRESETS.some(p=>p.id===value)?value:'midnight';}

// Place type in each artwork's quiet area, clear of its printed label and illustration.
const ART_TITLE_TOP=Object.freeze([38,38,29,40,40,34,33,25,38,38,32,38,29,42,38,34]);
export function coverTitleAppearance(value,titleSize){
 const sizing=titleSize===undefined?{}:{fontSize:'calc(var(--cover-title-base, 14px) * '+normalizeCoverTitleSize(titleSize)/100+')',lineHeight:'1.15',whiteSpace:'normal',overflowWrap:'anywhere'};
 const preset=COVER_PRESETS.find(p=>p.id===normalizeCover(value));
 const index=ORIGINAL_ART_PRESETS.findIndex(p=>p.id===preset.id);
 if(index<0&&preset.design==='image')return {...sizing,color:preset.ink,top:preset.category==='power'||preset.category==='transmission'?'92%':'86%',left:'50%',width:'76%'};
 return {...sizing,color:preset.id==='art-08'?'#352c3d':preset.ink,top:(index<0?50:ART_TITLE_TOP[index])+'%',left:preset.id==='art-06'?'62%':'50%',width:preset.id==='art-06'?'60%':'76%'};
}


/** Bounded deterministic decoration, with no title, URL, font or user markup. */
export function coverBackgroundSvg(value){
 const p=COVER_PRESETS.find(p=>p.id===normalizeCover(value));
 // Raster art is rendered from the approved asset, never replaced by a CSS/SVG imitation.
 if(p.design==='image')return '';
 let art='';
 if(p.design==='block')art=`<path d="M0 306H300V400H0Z" fill="${p.accent}"/><path d="M228 0H300V306H228Z" fill="${p.secondary}"/><path d="M0 292H300V306H0Z" fill="${p.secondary}"/>`;
 else if(p.design==='diagonal')art=`<path d="M0 300L300 222V400H0Z" fill="${p.accent}"/><path d="M0 283L300 205V222L0 300Z" fill="${p.secondary}"/>`;
 else if(p.design==='stripe'||p.design==='pinstripe'){
  const gap=p.design==='stripe'?22:15,width=p.design==='stripe'?3:.8;
  for(let x=10;x<300;x+=gap)art+=`<path d="M${x} 0V400" stroke="${p.accent}" stroke-width="${width}" opacity=".5"/>`;
 }
 else if(p.design==='frame')art=`<rect x="24" y="28" width="252" height="344" rx="2" fill="none" stroke="${p.accent}" stroke-width="1.5"/><rect x="30" y="34" width="240" height="332" rx="1" fill="none" stroke="${p.accent}" stroke-width=".5"/><path d="M110 78H190M110 322H190" stroke="${p.accent}" stroke-width="1"/>`;
 else if(p.design==='label')art=`<rect x="34" y="68" width="232" height="264" rx="3" fill="${p.secondary}" stroke="${p.accent}" stroke-width="1"/><rect x="40" y="74" width="220" height="252" rx="1" fill="none" stroke="${p.accent}" stroke-width=".5"/><path d="M112 102H188M112 298H188" stroke="${p.accent}"/>`;
 else if(p.design==='grid'){
  for(let x=0;x<=300;x+=25)art+=`<path d="M${x} 0V400" stroke="${p.accent}" stroke-width=".65" opacity=".55"/>`;
  for(let y=0;y<=400;y+=25)art+=`<path d="M0 ${y}H300" stroke="${p.accent}" stroke-width=".65" opacity=".55"/>`;
 }
 else if(p.design==='arch')art=`<path d="M38 400V158a112 112 0 0 1 224 0V400Z" fill="${p.accent}"/><path d="M58 400V158a92 92 0 0 1 184 0V400" fill="none" stroke="${p.secondary}" stroke-width="1.5"/>`;
 else if(p.design==='speckle'){
  for(let i=0;i<42;i++){const x=8+(i*73%284),y=8+(i*113%384),r=(i%3+2)/2;art+=`<circle cx="${x}" cy="${y}" r="${r}" fill="${p.accent}" opacity="${i%2?'.38':'.22'}"/>`;}
 }
 else if(p.design==='orbit')art=`<circle cx="280" cy="48" r="93" fill="none" stroke="${p.accent}" stroke-width="1.2"/><circle cx="280" cy="48" r="109" fill="none" stroke="${p.accent}" stroke-width=".6"/><circle cx="22" cy="372" r="78" fill="${p.secondary}"/><circle cx="22" cy="372" r="95" fill="none" stroke="${p.accent}" stroke-width=".8"/>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400"><rect width="300" height="400" fill="${p.color}"/>${art}</svg>`;
}

/** One rendering contract for editor preview, picker swatches and library. */
export function applyCoverAppearance(element,value,className='notebook-cover',{imageElement=false,thumbnail=false}={}){
 const preset=COVER_PRESETS.find(p=>p.id===normalizeCover(value));
 element.className=className+' cover-'+preset.id;
 element.setAttribute('data-cover-aspect',preset.id.startsWith('art-')?'portrait':'standard');
 element.setAttribute('data-cover-id',preset.id);element.setAttribute('data-cover-design',preset.design);
 element.style.backgroundColor=preset.color;element.style.color=preset.ink;
 element.style.backgroundImage=preset.design==='image'?(imageElement?'none':thumbnail?`url("${preset.thumbnail}")`:`url("${preset.image}"), url("${preset.thumbnail}")`):preset.design==='solid'?'none':`url("data:image/svg+xml,${encodeURIComponent(coverBackgroundSvg(preset.id))}")`;
 element.style.backgroundSize='100% 100%';element.style.backgroundPosition='center';element.style.backgroundRepeat='no-repeat';
 return preset;
}

// Stable persisted IDs, grouped only for browsing.
export const COVER_PICKER_PRESETS=Object.freeze([
 ...POWER_COVER_PRESETS,...TRANSMISSION_COVER_PRESETS,...AI_COVER_PRESETS,
 ...MASTERPIECE_COVER_PRESETS,...ORIGINAL_ART_PRESETS,
 ...LEGACY_COVER_PRESETS.map(p=>Object.freeze({...p,category:'simple'}))
]);
export function filterCoverPresets(category='all',query=''){
 const key=String(query).trim().toLocaleLowerCase('ko-KR').replace(/\s+/g,'');
 return COVER_PICKER_PRESETS.filter(p=>(category==='all'||p.category===category)&&(!key||(p.label+' '+COVER_CATEGORIES.find(c=>c.id===p.category)?.label).toLocaleLowerCase('ko-KR').replace(/\s+/g,'').includes(key)));
}
export function configureCoverImage(image,preset){
 image.src=preset.thumbnail;
 const original=preset.id.startsWith('art-');
 image.srcset=preset.thumbnail+' '+(original?160:180)+'w, '+preset.image+' '+(original?480:preset.imageWidth||900)+'w';
 image.sizes='(max-width: 600px) 40vw, 200px';
 image.onerror=()=>{image.onerror=null;image.srcset='';image.src=preset.thumbnail;};
}

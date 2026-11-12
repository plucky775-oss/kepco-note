/** Persist provider identifiers and placement, never media bytes, object URLs or iframe HTML. */
const ID=/^[A-Za-z0-9_-]{11}$/;
export function parseYouTubeURL(input){
 if(typeof input!=='string'||input.length>2048)return null;
 try{const u=new URL(input.trim());if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
 const host=u.hostname.toLowerCase(),parts=u.pathname.split('/').filter(Boolean);let videoId;
 if(host==='youtu.be'&&parts.length===1)videoId=parts[0];
 else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)){
 if(u.pathname==='/watch')videoId=u.searchParams.get('v');
 else if(parts.length===2&&['shorts','embed','live'].includes(parts[0]))videoId=parts[1];
 }else if(host==='www.youtube-nocookie.com'&&parts.length===2&&parts[0]==='embed')videoId=parts[1];
 if(!ID.test(videoId||''))return null;
 const time=u.searchParams.get('start')||u.searchParams.get('t')||'0';let start=0;
 if(/^\d+$/.test(time))start=Number(time);else{const m=/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(time);if(m)start=Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0);}
 return {videoId,start:Math.min(86400,Math.max(0,start))};
 }catch{return null;}
}
export function validateVideoObjects(input=[]){
 if(!Array.isArray(input)||input.length>12)throw Error('동영상은 한 페이지에 12개까지 넣을 수 있어요.');
 const ids=new Set();return input.map(o=>{const b=o?.bounds;
 if(!o||typeof o.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(o.id)||ids.has(o.id)||!b||!['x','y','width','height'].every(k=>Number.isFinite(b[k]))||b.x<0||b.y<0||b.width<160||b.height<90||b.x+b.width>900.001||b.y+b.height>1200.001)throw Error('동영상 정보 또는 크기가 올바르지 않습니다.');
 let media;
 if(o.provider==='local'){
 if(typeof o.fileName!=='string'||!o.fileName.length||o.fileName.length>255||!Number.isSafeInteger(o.fileSize)||o.fileSize<0||!Number.isSafeInteger(o.lastModified)||o.lastModified<0)throw Error('기기 영상 정보가 올바르지 않습니다.');
 media={provider:'local',fileName:o.fileName,fileSize:o.fileSize,lastModified:o.lastModified};
 if(o.assetId!==undefined||o.assetKey!==undefined){if(!/^[A-Za-z0-9_-]{20,100}$/.test(o.assetId||'')||!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(o.assetKey||''))throw Error('기기 영상 저장 정보가 올바르지 않습니다.');media.assetId=o.assetId;media.assetKey=o.assetKey;}
 }else{
 if((o.provider!==undefined&&o.provider!=='youtube')||!ID.test(o.videoId||'')||!Number.isInteger(o.start)||o.start<0||o.start>86400)throw Error('유튜브 동영상 정보가 올바르지 않습니다.');media={videoId:o.videoId,start:o.start};
 }
 ids.add(o.id);return {id:o.id,...media,bounds:{x:b.x,y:b.y,width:b.width,height:b.height}};});
}
const initialBounds=index=>({x:90+(index%4)*60,y:180+Math.floor(index/4)*80,width:480,height:270});
export function createVideoObject(url,id,index=0){const parsed=parseYouTubeURL(url);if(!parsed)throw Error('https://로 시작하는 유튜브 링크를 넣어주세요.');return validateVideoObjects([{id,...parsed,bounds:initialBounds(index)}])[0];}
export function createLocalVideoObject(file,id,index=0){if(file&&(!Number.isSafeInteger(file.size)||file.size<=0))throw Error('동영상 파일이 비어 있거나 읽을 수 없습니다. 기기에 내려받은 원본 파일을 선택해주세요.');if(!file||(!file.type?.startsWith('video/')&&!/\.(mp4|m4v|mov|webm|ogv)$/i.test(file.name||'')))throw Error('동영상 파일을 선택해주세요.');return validateVideoObjects([{id,provider:'local',fileName:file.name,fileSize:file.size,lastModified:file.lastModified,bounds:initialBounds(index)}])[0];}
export function videoURL(o,embed=false){const v=validateVideoObjects([o])[0];if(v.provider==='local')return '';return embed?`https://www.youtube-nocookie.com/embed/${v.videoId}?playsinline=1&start=${v.start}`:`https://www.youtube.com/watch?v=${v.videoId}&t=${v.start}s`;}
export function videoKey(o){return JSON.stringify([o.provider||'youtube',o.videoId,o.start,o.postId,o.fileName,o.fileSize,o.lastModified,o.assetId,o.assetKey]);}
export function transformVideo(o,dx,dy,resize=false){const v=validateVideoObjects([o])[0],b=v.bounds;if(!Number.isFinite(dx)||!Number.isFinite(dy))throw Error('잘못된 이동 값');return {...v,bounds:resize?{...b,width:Math.max(160,Math.min(900-b.x,b.width+dx)),height:Math.max(90,Math.min(1200-b.y,b.height+dy))}:{...b,x:Math.max(0,Math.min(900-b.width,b.x+dx)),y:Math.max(0,Math.min(1200-b.height,b.y+dy))}};}
/** Android addJavascriptInterface bridges are exposed to every frame. Never load
 * remote frames until the native app provides origin-scoped bridge isolation. */
export function canEmbedVideo(host=globalThis){return !host.MoaFiles&&!host.Android&&!host.AndroidBridge&&/^https?:$/.test(host.location?.protocol||'');}
const escapeXML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function label(o){return o.provider==='local'?[o.assetId?'기기 저장 영상':'기기 영상 · 다시 선택',o.fileName]:['YouTube ▶','youtu.be/'+o.videoId];}
export function videoPlaceholderSVG(objects=[]){return validateVideoObjects(objects).map(o=>{const b=o.bounds,[title,detail]=label(o);return `<g data-preview-video="${o.id}"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="0" fill="#172437"/><text x="${b.x+8}" y="${b.y+26}" fill="white" font-size="16">${escapeXML(title)}</text><text x="${b.x+8}" y="${b.y+48}" fill="white" font-size="10">${escapeXML(detail.slice(0,60))}</text></g>`;}).join('');}
export function drawVideoPlaceholders(ctx,objects=[]){for(const o of validateVideoObjects(objects)){const b=o.bounds,[title,detail]=label(o);ctx.save();ctx.fillStyle='#172437';ctx.fillRect(b.x,b.y,b.width,b.height);ctx.fillStyle='white';ctx.font='16px sans-serif';ctx.fillText(title,b.x+8,b.y+26);ctx.font='10px sans-serif';ctx.fillText(detail.slice(0,60),b.x+8,b.y+48);ctx.restore();}}


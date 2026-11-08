import {defaultPenColor,normalizePerPenColors} from './pen-color.js';
import {MIN_PEN_WIDTH,MAX_PEN_WIDTH,normalizePerPenWidths,defaultPenWidth} from './pen-width.js';
import {normalizePenSettings,normalizeChalkboardPrevious} from './chalkboard-mode.js';
import {validatePhotoObjects,validatePdfBackground} from './photo-objects.js';
import {validateDrawingObjects} from './drawing-objects.js';
import {normalizePenKind,normalizeBrushTaper,normalizeFountainTaper} from './pen-renderer.js';
import {normalizePaperTheme,normalizePaperType} from './paper-themes.js';
import {normalizeCover,normalizeBinding,normalizeCoverTitleSize} from './notebook-covers.js';
import {smoothHandwriting} from './smoothing.js';
import {validateGroups} from './converted-groups.js';
import {customFontId} from './custom-fonts.js';
export const PAGE={width:900,height:1200};
export const FONTS=[{id:'NanumPenScript',name:'나눔손글씨 펜',file:'NanumPenScript-Regular.woff2'},{id:'NanumBrushScript',name:'나눔손글씨 붓',file:'NanumBrushScript-Regular.woff2'},{id:'Gaegu',name:'개구',file:'Gaegu-Regular.woff2'},{id:'GamjaFlower',name:'감자꽃',file:'GamjaFlower-Regular.woff2'},{id:'PoorStory',name:'푸어스토리',file:'PoorStory-Regular.woff2'}];
export function id(){return globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}
export function makeNote(){const pageId=id();return {id:pageId,notebookId:pageId,pageOrder:0,penKind:'ballpoint',penSettings:{color:'#223247',width:defaultPenWidth('ballpoint')},favorite:false,paperTheme:'white',cover:'midnight',coverTitleSize:100,binding:'bound',title:'새 노트',createdAt:Date.now(),updatedAt:Date.now(),strokes:[],drawingObjects:[],photoObjects:[],pdfBackground:null,convertedGroups:[],textPlacementMissing:false,text:'',font:FONTS[0].id,fontSize:32,mode:'ink',smooth:0.55,shapeCorrection:false,showOriginal:false,paper:'ruled'}}
export function smoothPoints(points,amount=0.55){return smoothHandwriting(points,amount);}
export function strokePath(points){if(!points.length)return ''; if(points.length===1)return `M${points[0].x} ${points[0].y}l0.01 0`; return points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')}
export function escapeXml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))}
export function validPoint(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=900&&p.y<=1200}
function restoredTextObjects(n){
 const font=(FONTS.some(f=>f.id===n.font)||customFontId(n.font))?n.font:FONTS[0].id,fontSize=[24,32,40].includes(n.fontSize)?n.fontSize:32;
 const groups=validateGroups(n.convertedGroups,n.strokes).map(g=>({font,fontSize,...g}));
 if(!groups.length&&n.text.trim())groups.push({kind:'text-object',recovery:'legacy-text',id:'recovery_'+n.id.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,91),text:n.text,strokeIds:[],bounds:{x:72,y:156,width:756,height:300},font,fontSize});
 return groups;
}
export function validateNote(n){if(!n||typeof n!=='object'||typeof n.id!=='string'||n.id.length>100||typeof n.title!=='string'||n.title.length>120||typeof n.text!=='string'||n.text.length>50000||!Array.isArray(n.strokes)||n.strokes.length>5000)throw Error('노트 형식 또는 크기가 올바르지 않습니다.');if(!Number.isFinite(n.createdAt)||!Number.isFinite(n.updatedAt)||n.createdAt<0||n.updatedAt<0||n.createdAt>8640000000000000||n.updatedAt>8640000000000000)throw Error('노트 날짜가 올바르지 않습니다.');let total=0;for(const s of n.strokes){if(!s||!Array.isArray(s.points)||s.points.length>12000||!s.points.every(validPoint)||!Number.isFinite(s.width)||s.width<MIN_PEN_WIDTH||s.width>MAX_PEN_WIDTH||!/^#[0-9a-f]{6}$/i.test(s.color))throw Error('필기 데이터가 올바르지 않습니다.');total+=s.points.length;}if(total>300000)throw Error('노트가 너무 큽니다.');const groups=restoredTextObjects(n);const strokes=n.strokes.map(s=>({...s,...(s.penKind==='fountain'&&Object.hasOwn(s,'fountainTaper')?{fountainTaper:normalizeFountainTaper(s.fountainTaper)}:{}),...(s.penKind==='brush'&&Object.hasOwn(s,'brushTaper')?{brushTaper:normalizeBrushTaper(s.brushTaper)}:{}),...(Object.hasOwn(s,'penKind')?{penKind:normalizePenKind(s.penKind)}:{}),points:s.points.map(p=>({...p,...(Object.hasOwn(p,'pressure')?{pressure:Number.isFinite(p.pressure)?Math.max(0,Math.min(1,p.pressure)):.5}:{})}))})); return {...makeNote(),...n,...(n.notebookKind===undefined?{}:{notebookKind:n.notebookKind==='meeting'?'meeting':'note'}),...(n.sourceRecordingId===undefined?{}:{sourceRecordingId:typeof n.sourceRecordingId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(n.sourceRecordingId)?n.sourceRecordingId:null}),strokes,...(n.perPenWidths===undefined?{}:{perPenWidths:normalizePerPenWidths(n.perPenWidths)}),...(n.perPenColors===undefined?{}:{perPenColors:normalizePerPenColors(n.perPenColors)}),penSettings:normalizePenSettings(n.penSettings,n.paperTheme==='chalkboard'?{color:'#fffdf0',width:5}:{color:defaultPenColor(n.penKind),width:3}),...(n.chalkboardPrevious===undefined?{}:{chalkboardPrevious:normalizeChalkboardPrevious(n.chalkboardPrevious)}),penKind:normalizePenKind(n.penKind)==='legacy'?'ballpoint':normalizePenKind(n.penKind),notebookId:typeof n.notebookId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(n.notebookId)?n.notebookId:n.id,pageOrder:Number.isSafeInteger(n.pageOrder)&&n.pageOrder>=0?n.pageOrder:0,convertedGroups:groups,drawingObjects:validateDrawingObjects(n.drawingObjects),photoObjects:validatePhotoObjects(n.photoObjects),pdfBackground:validatePdfBackground(n.pdfBackground),title:n.title,...(n.bookmark===undefined?{}:{bookmark:typeof n.bookmark==='string'?n.bookmark.trim().slice(0,80):''}),favorite:n.favorite===true,paperTheme:normalizePaperTheme(n.paperTheme),cover:normalizeCover(n.cover),coverTitleSize:normalizeCoverTitleSize(n.coverTitleSize),binding:normalizeBinding(n.binding),font:(FONTS.some(f=>f.id===n.font)||customFontId(n.font))?n.font:FONTS[0].id,fontSize:[24,32,40].includes(n.fontSize)?n.fontSize:32,mode:n.mode==='text'?'text':'ink',smooth:Number.isFinite(n.smooth)?Math.max(0,Math.min(.85,n.smooth)):.55,paper:normalizePaperType(n.paper),textPlacementMissing:groups.some(g=>g.recovery==='legacy-text')?false:n.textPlacementMissing===true,shapeCorrection:n.shapeCorrection===true,showOriginal:!!n.showOriginal};}
export function parseBackup(raw){const obj=JSON.parse(raw);if(obj.version!==1||!Array.isArray(obj.notes)||obj.notes.length>1000)throw Error('지원하지 않는 백업입니다.');return obj.notes.map(validateNote)}
const APPEND_STROKE = Symbol('append-stroke-history');
export class History {
 constructor(limit=30){this.past=[];this.future=[];this.limit=limit;}
 add(entry){this.past.push(entry);if(this.past.length>this.limit)this.past.shift();this.future=[];}
 push(note){this.add(structuredClone(note));}
 /** Call immediately before appending this completed stroke. Other edits must
  * still call push(): they may mutate arbitrary page fields. This command owns
  * no references to old strokes, images, PDFs, or other mutable page objects.
  */
 pushStroke(note,stroke){
  if(!Array.isArray(note.strokes)||!stroke||typeof stroke.id!=='string')throw Error('완료한 필기 획이 필요합니다.');
  this.add({[APPEND_STROKE]:true,pageId:note.id,index:note.strokes.length,strokeId:stroke.id,updatedAt:note.updatedAt});
 }
 undo(note){
  if(!this.past.length)return note;
  const entry=this.past.at(-1);
  if(entry[APPEND_STROKE]){
   // A stale command must never remove a different stroke/page. Do not consume
   // history on mismatch; normal app operations keep this guard satisfied.
   if(note.id!==entry.pageId||note.strokes.length!==entry.index+1||note.strokes[entry.index]?.id!==entry.strokeId)return note;
   const stroke=structuredClone(note.strokes[entry.index]);
   this.future.push({...entry,stroke,redoUpdatedAt:note.updatedAt});this.past.pop();
   return {...note,updatedAt:entry.updatedAt,strokes:note.strokes.slice(0,entry.index)};
  }
  this.future.push(structuredClone(note));return this.past.pop();
 }
 redo(note){
  if(!this.future.length)return note;
  const entry=this.future.at(-1);
  if(entry[APPEND_STROKE]){
   if(note.id!==entry.pageId||note.strokes.length!==entry.index)return note;
   const stroke=structuredClone(entry.stroke);
   const {stroke:unused,redoUpdatedAt,...inverse}=entry;
   this.past.push(inverse);this.future.pop();
   return {...note,updatedAt:redoUpdatedAt,strokes:[...note.strokes,stroke]};
  }
  this.past.push(structuredClone(note));return this.future.pop();
 }
 clear(){this.past=[];this.future=[];}
}

export function backupParts(notes,maxBytes=24*1024*1024){const parts=[];let current=[],size=100;for(const n of notes){const bytes=new TextEncoder().encode(JSON.stringify(n)).byteLength+1;if(bytes>maxBytes-100)throw Error('한 노트가 백업 허용 크기를 넘었습니다. 내용을 나누어주세요.');if(size+bytes>maxBytes){parts.push(current);current=[];size=100;}current.push(n);size+=bytes;}if(current.length)parts.push(current);return parts;}

import {id,makeNote} from './core.js';
import {validateDrawingObjects} from './drawing-objects.js';
import {PAPER_THEMES,PAPER_TYPES} from './paper-themes.js';

export const TEMPLATE_STORAGE_KEY='nib-blank-page-templates-v1';
export const MAX_TEMPLATES=100;
const VERSION=1,MAX_BYTES=8*1024*1024;
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const fail=()=>{throw Error('빈 서식 형식 또는 크기가 올바르지 않습니다.');};
function templateName(value){
 if(typeof value!=='string'||!value.trim()||value.length>80)throw Error('서식 이름은 1~80자로 입력해주세요.');
 return value.trim();
}
function blankObjects(input=[],fresh=false){
 if(!Array.isArray(input)||input.length>200)fail();
 // Never spread a source object: future fields must be explicitly reviewed here.
 const objects=input.map(o=>{
  if(!o||typeof o!=='object')fail();
  const out={id:fresh?id():o.id,type:o.type,bounds:o.bounds,color:o.color,width:o.width,fill:o.fill,text:'',font:o.font,fontSize:o.fontSize};
  for(const key of ['reverse','flipY','endpoints'])if(o[key]!==undefined)out[key]=o[key];
  if(o.type==='table'){
   if(!Number.isInteger(o.rows)||o.rows<1||o.rows>8||!Number.isInteger(o.cols)||o.cols<1||o.cols>8)fail();
   out.rows=o.rows;out.cols=o.cols;
   out.cells=Array.from({length:o.rows},()=>Array(o.cols).fill(''));
   for(const key of ['columnWidths','cellAlignments','cellNoWrap'])if(o[key]!==undefined)out[key]=o[key];
  }
  return out;
 });
 // The shared validator rebuilds all nested geometry/style arrays with its own allowlist.
 return validateDrawingObjects(objects);
}
export function validateTemplate(template){
 if(!template||typeof template!=='object'||template.version!==VERSION||!safeId(template.id))fail();
 if(!PAPER_TYPES.some(type=>type.id===template.paper)||!PAPER_THEMES.some(theme=>theme.id===template.paperTheme))fail();
 return {version:VERSION,id:template.id,name:templateName(template.name),paper:template.paper,paperTheme:template.paperTheme,drawingObjects:blankObjects(template.drawingObjects)};
}
export function createBlankTemplate(page,name){
 if(!page||typeof page!=='object')fail();
 return validateTemplate({version:VERSION,id:id(),name,paper:page.paper??'ruled',paperTheme:page.paperTheme??'white',drawingObjects:blankObjects(page.drawingObjects,true)});
}
export function instantiateTemplate(template){
 const clean=validateTemplate(template),note=makeNote();
 note.title=clean.name;note.paper=clean.paper;note.paperTheme=clean.paperTheme;
 note.drawingObjects=blankObjects(clean.drawingObjects,true);
 return note;
}
function checkedList(templates){
 if(!Array.isArray(templates)||templates.length>MAX_TEMPLATES)fail();
 const ids=new Set();return templates.map(template=>{
  const clean=validateTemplate(template);if(ids.has(clean.id))fail();ids.add(clean.id);return clean;
 });
}
export function parseTemplates(raw){
 if(typeof raw!=='string'||raw.length>MAX_BYTES||new TextEncoder().encode(raw).byteLength>MAX_BYTES)fail();
 let document;try{document=JSON.parse(raw);}catch{fail();}
 if(!document||document.kind!=='nib-blank-page-templates'||document.version!==VERSION)fail();
 return checkedList(document.templates);
}
export function exportTemplates(templates=listTemplates()){
 const raw=JSON.stringify({kind:'nib-blank-page-templates',version:VERSION,templates:checkedList(templates)});
 if(new TextEncoder().encode(raw).byteLength>MAX_BYTES)fail();return raw;
}
function storage(){
 const store=globalThis.localStorage;
 if(!store||typeof store.getItem!=='function'||typeof store.setItem!=='function')throw Error('이 브라우저에서 서식 저장소를 사용할 수 없습니다.');
 return store;
}
export function listTemplates(){
 // Read/access/parse errors intentionally reach the caller. Never replace corrupt data with [].
 const raw=storage().getItem(TEMPLATE_STORAGE_KEY);return raw===null?[]:parseTemplates(raw);
}
export function saveTemplate(template){
 const clean=validateTemplate(template),templates=listTemplates(),index=templates.findIndex(item=>item.id===clean.id);
 if(index<0)templates.push(clean);else templates[index]=clean;
 storage().setItem(TEMPLATE_STORAGE_KEY,exportTemplates(templates));return clean;
}
export function deleteTemplate(templateId){
 if(!safeId(templateId))fail();
 const templates=listTemplates(),next=templates.filter(template=>template.id!==templateId);
 if(next.length===templates.length)return false;
 storage().setItem(TEMPLATE_STORAGE_KEY,exportTemplates(next));return true;
}
/** Import a validated collection as new entries, with one all-or-nothing storage write. */
export function importTemplates(templates){
 const incoming=checkedList(templates),existing=listTemplates();
 if(existing.length+incoming.length>MAX_TEMPLATES)fail();
 const next=[...existing,...incoming.map(template=>createBlankTemplate(template,template.name))];
 if(incoming.length)storage().setItem(TEMPLATE_STORAGE_KEY,exportTemplates(next));
 return next;
}


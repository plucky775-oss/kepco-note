import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNote,validateNote} from '../src/core.js';
import {createDrawingObject,DRAWING_TYPES} from '../src/drawing-objects.js';
import {TEMPLATE_STORAGE_KEY,createBlankTemplate,validateTemplate,instantiateTemplate,listTemplates,saveTemplate,deleteTemplate,exportTemplates,parseTemplates,importTemplates} from '../src/page-templates.js';
const shape=(type='table')=>createDrawingObject(type,{x:40,y:50},{x:500,y:600},{id:'source_object',text:'PRIVATE LABEL',rows:2,cols:2,cells:[['PRIVATE CELL','b'],['c','d']]});
const template=()=>createBlankTemplate({...makeNote(),drawingObjects:[shape()]},'빈 서식');
function mockStorage(t){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),data=new Map();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;});return data;
}
test('blank template strips every content category and unknown nested fields without mutating source',()=>{
 const page={...makeNote(),title:'PRIVATE TITLE',paper:'grid',paperTheme:'blue-frame',strokes:[{secret:'PRIVATE INK'}],text:'PRIVATE TEXT',convertedGroups:[{text:'PRIVATE CONVERSION'}],photoObjects:[{src:'PRIVATE PHOTO'}],pdfBackground:{data:'PRIVATE PDF'},meeting:{signature:'PRIVATE SIGNATURE'},sourceRecordingId:'PRIVATE RECORDING',unknown:'PRIVATE UNKNOWN',drawingObjects:[{...shape(),secret:'PRIVATE OBJECT',bounds:{...shape().bounds,secret:'PRIVATE BOUNDS'}}]};
 const before=structuredClone(page),blank=createBlankTemplate(page,'양식');
 assert.deepEqual(page,before);assert.equal(JSON.stringify(blank).includes('PRIVATE'),false);
 assert.deepEqual(Object.keys(blank).sort(),['version','id','name','paper','paperTheme','drawingObjects'].sort());
 assert.equal(blank.paper,'grid');assert.equal(blank.paperTheme,'blue-frame');assert.notEqual(blank.drawingObjects[0].id,'source_object');
 assert.deepEqual(blank.drawingObjects[0].cells,[['',''],['','']]);assert.equal(blank.drawingObjects[0].text,'');
});
test('every drawing type keeps validated geometry and styling but no labels',()=>{
 for(const type of DRAWING_TYPES){const object=shape(type),blank=createBlankTemplate({...makeNote(),drawingObjects:[object]},type).drawingObjects[0];
 assert.deepEqual(blank.bounds,object.bounds);assert.equal(blank.color,object.color);assert.equal(blank.text,'');if(object.endpoints)assert.deepEqual(blank.endpoints,object.endpoints);}
 const table={...shape(),columnWidths:[.3,.7],cellAlignments:[['center','left'],['left','center']],cellNoWrap:[[true,false],[false,true]]};
 const blank=createBlankTemplate({...makeNote(),drawingObjects:[table]},'표').drawingObjects[0];
 assert.deepEqual(blank.columnWidths,table.columnWidths);assert.deepEqual(blank.cellAlignments,table.cellAlignments);assert.deepEqual(blank.cellNoWrap,table.cellNoWrap);
});
test('instantiation makes isolated fresh notebook pages and IDs, never restores private fields',()=>{
 const original=template(),before=structuredClone(original),a=instantiateTemplate({...original,notebookId:'old',favorite:true,sourceRecordingId:'old',text:'secret'}),b=instantiateTemplate(original);
 assert.notEqual(a.id,b.id);assert.equal(a.notebookId,a.id);assert.equal(b.notebookId,b.id);assert.equal(a.pageOrder,0);assert.equal(a.favorite,false);assert.equal(a.sourceRecordingId,undefined);
 for(const page of [a,b]){assert.deepEqual(page.strokes,[]);assert.deepEqual(page.convertedGroups,[]);assert.deepEqual(page.photoObjects,[]);assert.equal(page.pdfBackground,null);assert.equal(page.text,'');assert.equal(page.title,original.name);assert.doesNotThrow(()=>validateNote(page));}
 assert.notEqual(a.drawingObjects[0].id,b.drawingObjects[0].id);assert.notEqual(a.drawingObjects[0].id,original.drawingObjects[0].id);
 a.drawingObjects[0].bounds.x=1;a.drawingObjects[0].cells[0][0]='edit';assert.deepEqual(original,before);assert.equal(b.drawingObjects[0].cells[0][0],'');
});
test('names, IDs, version, paper, geometry and styles are bounded and validated',()=>{
 const base=template();for(const patch of [{name:''},{name:' '.repeat(3)},{name:'a'.repeat(81)},{name:3},{id:'bad id'},{version:2},{paper:'javascript:'},{paperTheme:'url(evil)'}])assert.throws(()=>validateTemplate({...base,...patch}));
 assert.equal(validateTemplate({...base,name:'a'.repeat(80)}).name.length,80);
 for(const patch of [{color:'url(evil)'},{bounds:{x:NaN,y:0,width:3,height:3}},{rows:999999},{cols:0},{columnWidths:[1,1]}])assert.throws(()=>validateTemplate({...base,drawingObjects:[{...base.drawingObjects[0],...patch}]}));
 assert.throws(()=>validateTemplate({...base,drawingObjects:Array(201).fill(base.drawingObjects[0])}));
});
test('exports/imports re-sanitize content and reject malformed, duplicate or oversized collections',()=>{
 const base=template(),dirty={...base,private:'secret',drawingObjects:[{...base.drawingObjects[0],text:'secret',cells:[['secret',''],['','']]}]};
 assert.deepEqual(parseTemplates(exportTemplates([dirty])),[base]);assert.equal(exportTemplates([dirty]).includes('secret'),false);
 for(const raw of ['no','null','{}',JSON.stringify({kind:'nib-blank-page-templates',version:2,templates:[]}),JSON.stringify({kind:'nib-blank-page-templates',version:1,templates:[base,base]}),' '.repeat(8*1024*1024+1)])assert.throws(()=>parseTemplates(raw));
 assert.throws(()=>exportTemplates(Array.from({length:101},(_,i)=>({...base,id:'t'+i}))));
});
test('local persistence isolates existing data and supports replace, reload, delete and no-op deletion',t=>{
 const data=mockStorage(t);data.set('existing-notebooks','untouched');assert.deepEqual(listTemplates(),[]);
 const base=template();assert.deepEqual(saveTemplate(base),base);assert.deepEqual(listTemplates(),[base]);
 saveTemplate({...base,name:'새 이름'});assert.equal(listTemplates().length,1);assert.equal(listTemplates()[0].name,'새 이름');
 assert.equal(deleteTemplate('missing'),false);assert.equal(deleteTemplate(base.id),true);assert.deepEqual(listTemplates(),[]);assert.equal(data.get('existing-notebooks'),'untouched');
});
test('corrupt storage and unavailable/quota storage failures surface without overwriting data',t=>{
 const data=mockStorage(t);data.set(TEMPLATE_STORAGE_KEY,'broken');assert.throws(()=>listTemplates());assert.throws(()=>saveTemplate(template()));assert.throws(()=>deleteTemplate('test'));assert.equal(data.get(TEMPLATE_STORAGE_KEY),'broken');
 data.delete(TEMPLATE_STORAGE_KEY);globalThis.localStorage.setItem=()=>{throw Error('quota');};assert.throws(()=>saveTemplate(template()),/quota/);assert.deepEqual(listTemplates(),[]);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('denied');}});assert.throws(()=>listTemplates(),/denied/);
});
test('100 template limit permits replacements and rejects added entries without changing storage',t=>{
 const data=mockStorage(t),base=template(),all=Array.from({length:100},(_,i)=>({...base,id:'t'+i}));data.set(TEMPLATE_STORAGE_KEY,exportTemplates(all));
 saveTemplate({...all[0],name:'replace'});const before=data.get(TEMPLATE_STORAGE_KEY);assert.throws(()=>saveTemplate(base));assert.equal(data.get(TEMPLATE_STORAGE_KEY),before);assert.equal(listTemplates().length,100);
});

test('import is one atomic write with fresh IDs, no overwrites, and no partial failure',t=>{
 const data=mockStorage(t),base=template();saveTemplate(base);
 let writes=0;globalThis.localStorage.setItem=(key,value)=>{writes++;data.set(key,value);};
 const imported=importTemplates([base]);assert.equal(writes,1);assert.equal(imported.length,2);assert.deepEqual(imported[0],base);assert.notEqual(imported[1].id,base.id);assert.notEqual(imported[1].drawingObjects[0].id,base.drawingObjects[0].id);
 const before=data.get(TEMPLATE_STORAGE_KEY);assert.throws(()=>importTemplates([base,{...base,id:'second',paper:'bad'}]));assert.equal(data.get(TEMPLATE_STORAGE_KEY),before);assert.equal(writes,1);
 assert.throws(()=>importTemplates(Array.from({length:99},(_,i)=>({...base,id:'incoming'+i}))));assert.equal(data.get(TEMPLATE_STORAGE_KEY),before);assert.equal(writes,1);
 globalThis.localStorage.setItem=()=>{throw Error('quota');};assert.throws(()=>importTemplates([base]),/quota/);assert.equal(data.get(TEMPLATE_STORAGE_KEY),before);
 assert.deepEqual(importTemplates([]),imported);
});


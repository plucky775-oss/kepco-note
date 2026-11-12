import test from 'node:test';
import assert from 'node:assert/strict';
import {collectVideoReferences} from '../../update-source/src/video-storage-manager.js';
const page=assetId=>({videoObjects:[{provider:'local',assetId}]});
test('all live pages, trash and both history directions protect assets',()=>{
 const refs=collectVideoReferences({pages:[page('live')],trash:[{pages:[page('trash')]}],histories:[{past:[page('undo'),{pageId:'ink-command'}],future:[page('redo')]}]});
 assert.deepEqual([...refs].sort(),['live','redo','trash','undo']);
});
test('locked or unreadable references never become orphan candidates',()=>{
 for(const value of [{pages:[{_locked:true}],trash:[]},{pages:[],trash:[{pages:[{_locked:true}]}]},{pages:[],trash:null},{pages:[],trash:[{}]},{pages:[],trash:[],histories:[{}]},{pages:[{encrypted:{}}],trash:[]}])assert.throws(()=>collectVideoReferences(value));
});

import {mountVideoStorageManager} from '../../update-source/src/video-storage-manager.js';
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.open=false;this.textContent='';}
 append(...c){this.children.push(...c);}replaceChildren(...c){this.children=c;}setAttribute(){}addEventListener(){}showModal(){this.open=true;}close(){this.open=false;}
 querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)]);}
}
function manager({references=()=>new Set(),pending=0,remove=async()=>{},canDelete=()=>true}={}){
 const body=new Element('body'),side=new Element('aside'),root={body,createElement:t=>new Element(t),querySelector:()=>side};
 const ui=mountVideoStorageManager({root,getReferences:references,canDelete,services:{listDeviceVideoStorage:async()=>({assets:[{assetId:'orphan',size:1024}],pendingCount:pending}),deleteUnreferencedDeviceVideo:remove}});
 return {...ui,removeButton:()=>ui.dialog.querySelectorAll('button').find(b=>b.textContent==='이 원본 삭제'),text:()=>ui.dialog.children.map(c=>c.textContent).join(' ')};
}
test('storage UI preserves live references and pending saves and fails closed on scan errors',async()=>{
 for(const options of [{references:()=>new Set(['orphan'])},{pending:1},{references:()=>{throw Error('locked');}}]){
  const ui=manager(options);await ui.button.onclick();assert.equal(ui.removeButton(),undefined);
 }
});
test('storage UI cancellation never deletes; fresh references after confirmation prevent deletion',async()=>{
 const previous=globalThis.confirm;let deleted=0,calls=0;
 try{
  globalThis.confirm=()=>false;const a=manager({remove:async()=>deleted++});await a.button.onclick();await a.removeButton().onclick();assert.equal(deleted,0);
  globalThis.confirm=()=>true;const b=manager({references:()=>new Set(++calls>=3?['orphan']:[]),remove:async()=>deleted++});await b.button.onclick();await b.removeButton().onclick();assert.equal(deleted,0);assert.match(b.text(),/참조가 바뀌어/);
 }finally{globalThis.confirm=previous;}
});
test('storage UI reports deletion failures and uses a live authorization guard',async()=>{
 const previous=globalThis.confirm;let allowed=true;
 try{globalThis.confirm=()=>true;const ui=manager({canDelete:()=>allowed,remove:async(asset,{isAllowed})=>{assert.equal(asset.assetId,'orphan');assert.equal(isAllowed(),true);allowed=false;assert.equal(isAllowed(),false);throw Error('disk failure');}});await ui.button.onclick();await ui.removeButton().onclick();assert.match(ui.text(),/disk failure/);assert.equal(ui.dialog.open,true);}
 finally{globalThis.confirm=previous;}
});

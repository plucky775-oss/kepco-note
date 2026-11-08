import test from 'node:test';import assert from 'node:assert/strict';
import {confirmNotebookDeletion} from '../src/notebook-delete-confirm.js';
function harness(t,{showFails=false}={}){
 const prior=globalThis.document,previous={focus(){this.focused=true}},body={children:[],append(e){this.children.push(e)}};
 class E{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.open=false;}setAttribute(k,v){this.attrs[k]=v}append(...els){this.children.push(...els)}addEventListener(k,f){this.listeners[k]=f}showModal(){if(showFails)throw Error('unsupported');this.open=true}close(){this.open=false;this.listeners.close?.()}remove(){body.children=body.children.filter(e=>e!==this)}focus(){this.focused=true}}
 globalThis.document={activeElement:previous,body,createElement:t=>new E(t)};t.after(()=>{globalThis.document=prior});return {body,previous,get dialog(){return body.children[0]}};
}
test('confirmation uses safe notebook text, explicit recoverable action and cancel-first keyboard focus',async t=>{
 const h=harness(t),pending=confirmNotebookDeletion({title:'<script>not markup</script>',count:3}),dialog=h.dialog;
 assert.equal(dialog.open,true);assert.equal(dialog.children[1].textContent,'“<script>not markup</script>” 노트의 3페이지를 휴지통으로 이동합니다. 원본 필기·글·사진은 휴지통에서 복원할 수 있습니다.');
 const [cancel,accept]=dialog.children[2].children;assert.equal(cancel.focused,true);assert.equal(cancel.autofocus,true);assert.equal(accept.textContent,'휴지통으로 이동');assert.equal(accept.type,'button');accept.onclick();assert.equal(await pending,true);assert.equal(h.body.children.length,0);assert.equal(h.previous.focused,true);
});
test('cancel, Escape and modal close never authorize deletion; dialog can retry afterward',async t=>{
 const h=harness(t);for(const action of ['button','escape','close']){const pending=confirmNotebookDeletion({title:'유지',count:1}),dialog=h.dialog;if(action==='button')dialog.children[2].children[0].onclick();else if(action==='escape'){let prevented=false;dialog.listeners.cancel({preventDefault(){prevented=true}});assert.equal(prevented,true)}else dialog.close();assert.equal(await pending,false);assert.equal(h.body.children.length,0);}
});
test('repeated requests cannot create concurrent confirmations or duplicate a confirmed delete',async t=>{
 const h=harness(t),first=confirmNotebookDeletion({title:'first',count:1});assert.equal(await confirmNotebookDeletion({title:'second',count:2}),false);assert.equal(h.body.children.length,1);h.dialog.children[2].children[1].onclick();assert.equal(await first,true);
});
test('modal opening failure fails closed and clears pending state for retry',async t=>{
 const h=harness(t,{showFails:true});assert.equal(await confirmNotebookDeletion({title:'keep',count:1}),false);assert.equal(h.body.children.length,0);assert.equal(await confirmNotebookDeletion({title:'retry',count:1}),false);
});


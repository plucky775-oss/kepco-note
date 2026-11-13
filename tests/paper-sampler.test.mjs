import test from 'node:test';import assert from 'node:assert/strict';
import {PAPER_TYPES,PAPER_THEMES,paperBackgroundSvg} from '../work/www/src/paper-themes.js';
import {mountNotebookEditor} from '../work/www/src/notebook-editor.js';
function setup(t,persist=async()=>true){const els=new Map();class El{constructor(){this.value='';this.children=[];this.attrs={};this.style={};this.open=false;}setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return this.attrs[k]??null}append(...c){this.children.push(...c)}replaceChildren(...c){this.children=c}addEventListener(k,fn){this[k]=fn}querySelector(s){return this.children.find(x=>x.className===s.slice(1))}focus(){this.focused=true}showModal(){assert.equal(this.open,false);this.open=true}close(){this.open=false}}const $=id=>{if(!els.has(id))els.set(id,new El());return els.get(id)};const old=globalThis.document;globalThis.document={getElementById:$,createElement:()=>new El()};t.after(()=>{globalThis.document=old});const calls=[];const api=mountNotebookEditor({persist:async data=>{calls.push(data);return persist(data)}});return {api,$,calls,submit:()=>$('notebook-form').onsubmit({preventDefault(){}})};}
test('color chips and decoration controls expose every stable paper theme without changing covers',async t=>{
 const h=setup(t),pending=h.api.open(),cover=h.$('cover-preview').attrs['data-cover-id'];
 const families=[...new Set(PAPER_THEMES.map(t=>t.family))];
 assert.deepEqual(h.$('new-paper-colors').children.map(b=>b.attrs['data-paper-family']),families);
 for(const theme of PAPER_THEMES){
  h.$('new-paper-colors').children.find(b=>b.attrs['data-paper-family']===theme.family).onclick();
  const variant=['minimal','frame','corner'].find(v=>theme.id.endsWith('-'+v));
  if(variant)h.$('new-paper-variants').children.find(b=>b.attrs['data-paper-variant']===variant).onclick();
  assert.equal(h.$('new-paper-theme').value,theme.id);
  assert.equal(h.$('new-paper-colors').children.filter(b=>b.attrs['aria-pressed']==='true').length,1);
  assert.equal(h.$('new-paper-colors').children.find(b=>b.attrs['aria-pressed']==='true').children[0].style.backgroundColor,theme.color);
  assert.match(h.$('new-paper-selection').textContent,new RegExp(theme.label.replace(/[.*+?^$|()[\]{}]/g,'\\$&')));
  assert.equal(h.$('new-paper-decoration').hidden,!variant);
  assert.equal(h.$('cover-preview').attrs['data-cover-id'],cover);
 }
 h.$('cancel-notebook').onclick();assert.equal(await pending,false);
 const again=h.api.open();assert.equal(h.$('new-paper-theme').value,'white');assert.equal(h.$('new-paper-decoration').hidden,true);
 h.$('cancel-notebook').onclick();await again;
});
test('pending save disables all sampler controls and ignores retained click handlers',async t=>{
 let finish;const gate=new Promise(r=>finish=r),h=setup(t,()=>gate),pending=h.api.open();
 h.$('new-paper-colors').children.find(b=>b.attrs['data-paper-family']==='blue').onclick();
 const color=h.$('new-paper-colors').children.find(b=>b.attrs['data-paper-family']==='ivory'),variant=h.$('new-paper-variants').children[1];
 h.$('notebook-name').value='색상';const saving=h.submit();
 assert.ok(h.$('new-paper-colors').children.every(b=>b.disabled));assert.ok(h.$('new-paper-variants').children.every(b=>b.disabled));
 color.onclick();variant.onclick();assert.equal(h.$('new-paper-theme').value,'blue-minimal');assert.equal(h.calls[0].paperTheme,'blue-minimal');
 finish(true);await saving;assert.equal(await pending,true);
});
test('every paper preview immediately adopts selected color and selected type persists',async t=>{
 const h=setup(t),pending=h.api.open();
 h.$('new-paper-types').children.find(b=>b.attrs['data-new-paper-type']==='grid').onclick();
 h.$('new-paper-colors').children.find(b=>b.attrs['data-paper-family']==='lavender').onclick();
 for(const b of h.$('new-paper-types').children){const id=b.attrs['data-new-paper-type'];assert.equal(b.children[0].innerHTML,paperBackgroundSvg({paper:id,paperTheme:'lavender-minimal',binding:'bound'}).replace('<svg ','<svg preserveAspectRatio="none" '));}
 assert.match(h.$('new-paper-selection').textContent,/라벤더/);
 assert.equal(h.$('new-paper-types').children.filter(b=>b.attrs['aria-pressed']==='true').length,1);
 h.$('notebook-name').value='견본 테스트';await h.submit();assert.equal(await pending,true);assert.equal(h.calls[0].paper,'grid');assert.equal(h.calls[0].paperTheme,'lavender-minimal');
});

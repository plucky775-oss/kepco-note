import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {ART_COVER_PRESETS,COVER_PRESETS,COVER_PICKER_PRESETS,COVER_CATEGORIES,filterCoverPresets,coverTitleAppearance} from '../work/www/src/notebook-covers.js';
import {mountNotebookEditor} from '../work/www/src/notebook-editor.js';
import {createCoverTitleEditor} from '../work/www/src/cover-title-editor.js';
import {makeNote,validateNote} from '../work/www/src/core.js';
import {liveStrokeSvg,strokeSvg} from '../work/www/src/pen-renderer.js';
import {setNotebookMetadata,deriveLibrary} from '../work/www/src/library-model.js';
import {createPage} from '../work/www/src/notebooks.js';
import {PAPER_TYPES,PAPER_THEMES} from '../work/www/src/paper-themes.js';

class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.attrs={};this.value='';this.hidden=false;this.disabled=false;this.className='';this.listeners={};}
 append(...els){this.children.push(...els);}
 replaceChildren(...els){this.children=els;}
 setAttribute(name,value){this.attrs[name]=String(value);}
 getAttribute(name){return this.attrs[name];}
 removeAttribute(name){delete this.attrs[name];}
 addEventListener(name,fn){this.listeners[name]=fn;}
 querySelector(selector){return this.children.find(x=>x.className===selector.slice(1));}
 focus(){}
 showModal(){this.open=true;}
 close(){this.open=false;}
}
function documentHarness(){
 const els=new Map();const get=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id);};
 globalThis.document={getElementById:get,createElement:tag=>new Element(tag)};return get;
}
test('55 selectable covers include all old IDs and all local image assets',()=>{
 assert.equal(COVER_PICKER_PRESETS.length,55);assert.equal(ART_COVER_PRESETS.length,40);
 assert.equal(new Set(COVER_PICKER_PRESETS.map(x=>x.id)).size,55);
 assert.equal(COVER_PRESETS.length,55);
 for(const p of COVER_PICKER_PRESETS){
  assert.ok(COVER_CATEGORIES.some(c=>c.id===p.category));
  if(p.design==='image')for(const asset of [p.image,p.thumbnail])assert.ok(existsSync(new URL('../work/www/'+asset,import.meta.url)),asset);
  const note=validateNote(JSON.parse(JSON.stringify({...makeNote(),cover:p.id})));
  assert.equal(note.cover,p.id);
 }
 assert.ok(COVER_PICKER_PRESETS.every(p=>!p.id.startsWith('food-')));
});
test('category and search filters return exact results without changing selection identity',()=>{
 assert.equal(filterCoverPresets('power').length,4);assert.equal(filterCoverPresets('transmission').length,4);
 assert.equal(filterCoverPresets('ai').length,4);assert.equal(filterCoverPresets('masterpiece').length,12);
 assert.equal(filterCoverPresets('simple').length,15);assert.equal(filterCoverPresets('all','  고 흐 ').length,2);
 assert.equal(filterCoverPresets('power','해바라기').length,0);assert.equal(filterCoverPresets('all','zzzzz').length,0);
 for(const id of ['art-01','art-16'])assert.ok(!coverTitleAppearance(id).top.includes('undefined'));
 assert.equal(coverTitleAppearance('art-01').top,'38%');assert.equal(coverTitleAppearance('art-16').top,'34%');
});
test('picker selects a new cover, searches without resetting it, and saves the chosen ID',async()=>{
 const $=documentHarness();let saved;
 const editor=mountNotebookEditor({persist:async draft=>{saved=draft;return true;}});
 const done=editor.open();assert.equal($('cover-choice').children.length,55);
 $('notebook-name').value='현장 메모';$('notebook-name').oninput();
 const chosen=$('cover-choice').children.find(x=>x.attrs['data-cover-id']==='power-01');chosen.onclick();
 assert.equal($('cover-preview').attrs['data-cover-aspect'],'standard');
 assert.equal($('cover-preview').querySelector('.cover-name-preview').textContent,'현장 메모');
 $('cover-search').value='없는 표지';$('cover-search').oninput();assert.equal($('cover-choice').children.length,0);assert.equal($('cover-empty').hidden,false);
 await $('notebook-form').onsubmit({preventDefault(){}});assert.equal(await done,true);assert.equal(saved.cover,'power-01');assert.equal(saved.title,'현장 메모');
});
test('simple covers avoid broken image URLs; cancellation never saves',async()=>{
 const $=documentHarness();let saved=0;
 const editor=mountNotebookEditor({persist:async()=>{saved++;}});
 const done=editor.open({id:'old',title:'기존 노트',cover:'midnight'});
 $('cover-categories').children.find(x=>x.attrs['data-cover-category']==='simple').onclick();
 assert.equal($('cover-choice').children.length,15);
 for(const button of $('cover-choice').children)assert.equal(button.children[0].children.length,0);
 $('cancel-notebook').onclick();assert.equal(await done,false);assert.equal(saved,0);
});
test('new and existing cover title editors align to each image aspect ratio',()=>{
 documentHarness();const editor=createCoverTitleEditor();
 const old=editor.mount({id:'a',cover:'art-01',title:'기존 노트'}),newer=editor.mount({id:'b',cover:'power-01',title:'현장 메모'});
 assert.equal(old.attrs['data-cover-aspect'],'portrait');assert.equal(newer.attrs['data-cover-aspect'],'standard');
 assert.equal(old.children[0].style.top,'38%');assert.equal(newer.children[0].style.top,'92%');
});
test('long live finger strokes retain all coordinates with much less SVG markup',()=>{
 const points=Array.from({length:2048},(_,i)=>({x:50+i*.3,y:400+Math.sin(i*.05)*100,pressure:.5}));
 const s={id:'long',pointerType:'touch',penKind:'ballpoint',color:'#223247',width:3,points};
 const before=JSON.stringify(s),live=liveStrokeSvg(s),full=strokeSvg(s);
 assert.equal((live.match(/L/g)||[]).length,2047);assert.ok(live.includes('664.10'));
 assert.ok(live.length<full.length/5);assert.equal(JSON.stringify(s),before);
 assert.match(live,/stroke-width="3"/);assert.match(liveStrokeSvg({...s,penKind:'highlighter'}),/stroke-opacity="0.32"/);
 for(const penKind of ['pencil','fountain','brush','colored-pencil','chalk'])assert.equal(liveStrokeSvg({...s,penKind}),strokeSvg({...s,penKind}));
 assert.equal(liveStrokeSvg({...s,pointerType:'pen'}),strokeSvg({...s,pointerType:'pen'}));
});
test('title size is previewed, saved, inherited, and restored without changing existing content',async()=>{
 const $=documentHarness();let saved;
 const editor=mountNotebookEditor({persist:async draft=>{saved=draft;return true;}});
 const original={...makeNote(),id:'book',notebookId:'book',title:'현장 메모',cover:'power-01',coverTitleSize:100,text:'기존 내용'};
 const done=editor.open(original);$('cover-title-size').value='160';$('cover-title-size').oninput();
 assert.equal($('cover-title-size-value').textContent,'160%');
 assert.match($('cover-preview').querySelector('.cover-name-preview').style.fontSize,/1\.6/);
 await $('notebook-form').onsubmit({preventDefault(){}});assert.equal(await done,true);
 const pages=setNotebookMetadata([original],'book',saved);
 assert.equal(pages[0].text,'기존 내용');assert.equal(original.coverTitleSize,100);
 assert.equal(validateNote(JSON.parse(JSON.stringify(pages[0]))).coverTitleSize,160);
 assert.equal(createPage(pages,pages[0]).coverTitleSize,160);
 assert.equal(deriveLibrary(pages)[0].coverTitleSize,160);
 assert.throws(()=>setNotebookMetadata(pages,'book',{coverTitleSize:200}));
});
test('twelve non-cooking paper types and all thirty-eight themes are selectable',async()=>{
 const $=documentHarness();let saved;
 const editor=mountNotebookEditor({persist:async draft=>{saved=draft;return true;}});const done=editor.open();
 assert.equal(PAPER_TYPES.length,12);assert.equal(PAPER_THEMES.length,38);
 assert.ok(PAPER_TYPES.every(p=>p.id!=='recipe'));
 assert.equal($('new-paper-types').children.length,12);assert.equal($('new-paper-theme').children.length,38);
 $('new-paper-types').children.find(x=>x.attrs['data-new-paper-type']==='cornell-grid').onclick();
 $('new-paper-theme').value='mint-frame';$('new-paper-theme').onchange();$('notebook-name').value='업무';
 await $('notebook-form').onsubmit({preventDefault(){}});assert.equal(await done,true);
 assert.equal(saved.paper,'cornell-grid');assert.equal(saved.paperTheme,'mint-frame');
 const reloaded=validateNote({...makeNote(),...saved,id:'new',notebookId:'new'});
 assert.equal(reloaded.paper,'cornell-grid');assert.equal(reloaded.paperTheme,'mint-frame');
});
test('canceling title-size changes never persists or alters the source notebook',async()=>{
 const $=documentHarness();let count=0;const book={id:'book',title:'기존',cover:'art-01',coverTitleSize:140};
 const editor=mountNotebookEditor({persist:async()=>{count++;}});const done=editor.open(book);
 assert.equal($('cover-title-size').value,'140');$('reset-cover-title-size').onclick();
 assert.equal($('cover-title-size').value,'100');$('cancel-notebook').onclick();
 assert.equal(await done,false);assert.equal(count,0);assert.equal(book.coverTitleSize,140);
});

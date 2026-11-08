import test from 'node:test';import assert from 'node:assert/strict';import {makeNote,validateNote,parseBackup}from'../src/core.js';import {createPage,cloneImportedPages}from'../src/notebooks.js';import {PAPER_THEMES,PAPER_TYPES}from'../src/paper-themes.js';
test('legacy and new notes default to white without altering source',()=>{const page=makeNote();assert.equal(page.paperTheme,'white');delete page.paperTheme;const before=structuredClone(page);assert.equal(validateNote(page).paperTheme,'white');assert.deepEqual(page,before);});
test('every paper theme survives validated JSON backup and independent import copies',()=>{for(const {id}of PAPER_THEMES){const page={...makeNote(),paperTheme:id,text:'보존',strokes:[{id:'raw',width:2,color:'#223247',points:[{x:10,y:20}]}]},valid=validateNote(page),backup=parseBackup(JSON.stringify({version:1,notes:[valid]})),copy=cloneImportedPages(backup)[0];assert.equal(valid.paperTheme,id);assert.equal(copy.paperTheme,id);assert.deepEqual(copy.strokes,page.strokes);assert.equal(copy.text,page.text);assert.notEqual(copy.id,page.id);}});
test('unsupported imported paper metadata normalizes to white, never arbitrary CSS',()=>{for(const paperTheme of ['url(https://evil)',null,{},'unknown',42])assert.equal(validateNote({...makeNote(),paperTheme}).paperTheme,'white');});
test('new page inherits selected paper theme but no source content',()=>{const old={...makeNote(),paperTheme:'blue-frame',paper:'grid',text:'원문'},fresh=createPage([old],old);assert.equal(fresh.paperTheme,'blue-frame');assert.equal(fresh.paper,'grid');assert.equal(fresh.text,'');assert.notEqual(fresh.id,old.id);});

test('all themes and all twelve paper types preserve metadata and content through backup and inherit on next page',()=>{
 for(const theme of PAPER_THEMES)for(const {id:paper} of PAPER_TYPES)for(const binding of ['bound','spring']){
  const original={...makeNote(),paper,paperTheme:theme.id,binding,text:'색상 보존',strokes:[{id:'ink',width:2,color:'#223247',points:[{x:100,y:200}]}]};
  const valid=validateNote(original),copy=cloneImportedPages(parseBackup(JSON.stringify({version:1,notes:[valid]})))[0],next=createPage([copy],copy);
  for(const page of [valid,copy,next]){assert.equal(page.paper,paper);assert.equal(page.paperTheme,theme.id);assert.equal(page.binding,binding);}
  assert.deepEqual(copy.strokes,original.strokes);assert.equal(copy.text,original.text);assert.deepEqual(next.strokes,[]);assert.equal(next.text,'');
 }
});


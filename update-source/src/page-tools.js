import {normalizeBookmark,setPageBookmark,bookmarkedPages} from './page-bookmarks.js';
import {createBlankTemplate,instantiateTemplate,listTemplates,saveTemplate,deleteTemplate,exportTemplates,parseTemplates,importTemplates} from './page-templates.js';
import {renderPagePreview} from './page-preview.js';

/** Separate dialogs keep bookmarks and safe templates distinct from page copying. */
export function mountPageTools({getNote,getPages,beforeOpen,persistBookmark,openPage,createNotebook,download,onError}){
 const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
 const dialog=el('dialog');dialog.className='page-tools-dialog';dialog.setAttribute('aria-labelledby','page-tools-title');
 const heading=el('h2');heading.id='page-tools-title';const hint=el('p'),body=el('div'),error=el('p');error.setAttribute('role','alert');
 const close=button('닫기',()=>dialog.close());dialog.append(heading,hint,body,error,close);document.body.append(dialog);
 let busy=false,mode='';
 async function action(fn){if(busy)return false;busy=true;error.textContent='';close.disabled=true;for(const b of body.querySelectorAll('button,input'))b.disabled=true;try{return await fn();}catch(e){error.textContent=e.message||'처리하지 못했습니다.';onError?.(e);return false;}finally{busy=false;close.disabled=false;for(const b of body.querySelectorAll('button,input'))b.disabled=false;}}
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 function field(labelText,value=''){const label=el('label',labelText),input=el('input');input.type='text';input.maxLength=80;input.value=value;label.append(input);return {label,input};}
 async function open(next){if(busy)return;await action(async()=>{if(await beforeOpen()===false)return;mode=next;render();if(!dialog.open)dialog.showModal();});}
 function render(){body.replaceChildren();error.textContent='';if(mode==='bookmarks')renderBookmarks();else renderTemplates();}
 function renderBookmarks(){
  heading.textContent='중요 페이지 책갈피';hint.textContent='노트 즐겨찾기와 별개입니다. 페이지 순서가 바뀌어도 책갈피는 해당 페이지에 남습니다.';
  const current=getNote(),name=field('현재 페이지 책갈피 이름',normalizeBookmark(current.bookmark));body.append(name.label);
  body.append(button('책갈피 저장',()=>action(async()=>{if(!name.input.value.trim())throw Error('책갈피 이름을 입력해주세요.');if(await persistBookmark(current.id,setPageBookmark(current,name.input.value).bookmark))render();})));
  if(normalizeBookmark(current.bookmark))body.append(button('현재 책갈피 삭제',()=>action(async()=>{if(await persistBookmark(current.id,''))render();})));
  const pages=getPages(),marked=bookmarkedPages(pages);if(!marked.length)body.append(el('p','이 노트에는 아직 책갈피가 없습니다.'));
  for(const page of marked){const row=el('div');row.className='page-tool-row';row.append(button((pages.findIndex(p=>p.id===page.id)+1)+'페이지 · '+normalizeBookmark(page.bookmark),()=>action(async()=>{await openPage(page.id);if(getNote().id===page.id)dialog.close();})),button('책갈피 삭제',()=>action(async()=>{if(await persistBookmark(page.id,''))render();})));body.append(row);}
 }
 function renderTemplates(){
  heading.textContent='빈 양식 보관함';hint.textContent='종이 색·줄/모눈과 도형·표 틀만 저장합니다. 모든 글·표 내용·필기·이름·서명·사진·PDF 배경·회의 정보는 제외합니다. 항목명도 비워지며 원본 페이지는 바뀌지 않습니다.';
  const name=field('새 양식 이름');body.append(name.label,button('현재 페이지를 빈 양식으로 저장',()=>action(async()=>{saveTemplate(createBlankTemplate(getNote(),name.input.value));render();})));
  const templates=listTemplates();body.append(el('p','이 기기에만 보관됩니다. 노트 백업과 별개이므로 아래 양식 백업도 저장해주세요. 새 노트로 만들면 원본과 독립적으로 편집할 수 있습니다.'));
  if(!templates.length)body.append(el('p','저장된 빈 양식이 없습니다.'));
  for(const template of templates){const row=el('section');row.className='page-tool-template';const title=el('h3',template.name),preview=el('div');preview.className='page-thumbnail';preview.innerHTML=renderPagePreview(instantiateTemplate(template));preview.setAttribute('aria-label',template.name+' 빈 양식 미리보기');row.append(title,preview,button('이 양식으로 새 노트',()=>action(async()=>{if(await createNotebook(instantiateTemplate(template)))dialog.close();})),button('양식 삭제',()=>action(async()=>{if(!confirm('“'+template.name+'” 양식을 삭제할까요? 이미 만든 노트와 원본 페이지는 유지됩니다.'))return;deleteTemplate(template.id);render();})));body.append(row);}
  body.append(button('빈 양식 백업',()=>action(async()=>{download(new Blob([exportTemplates()],{type:'application/json'}),'nib-blank-templates.json');})));
  const input=el('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
  input.onchange=()=>action(async()=>{const file=input.files?.[0];input.value='';if(!file)return;if(file.size>8*1024*1024)throw Error('8MB 이하 양식 백업을 선택해주세요.');const incoming=parseTemplates(await file.text());if(!confirm(incoming.length+'개의 빈 양식을 추가할까요? 기존 양식은 유지됩니다.'))return;const existing=listTemplates();if(existing.length+incoming.length>100)throw Error('양식은 최대 100개까지 보관할 수 있습니다.');importTemplates(incoming);render();});
  body.append(button('빈 양식 백업 불러오기',()=>input.click()),input);
 }
 const actions=document.querySelector('.page-overview-actions');actions.append(button('중요 페이지 책갈피',()=>open('bookmarks')),button('빈 양식 저장 · 새 노트',()=>open('templates')));
 const newNote=document.getElementById('new-note');if(newNote)newNote.insertAdjacentElement('afterend',button('빈 양식으로 새 노트',()=>open('templates')));
 return {openBookmarks:()=>open('bookmarks'),openTemplates:()=>open('templates')};
}


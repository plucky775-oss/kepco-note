import {coverTitleAppearance,COVER_PRESETS,normalizeCover} from './notebook-covers.js';
/** A real form beside the cover's open button, never a nested interactive control. */
export function createCoverTitleEditor({renameNotebook=async()=>false,onSaved=()=>{}}={}){
 const drafts=new Map();let saving=false;
 const button=(label,className)=>{const el=document.createElement('button');el.type='button';el.className=className;el.textContent=label;return el;};
 return {
  isSaving:()=>saving,
  mount(book){
   const box=document.createElement('div');box.className='library-cover-editor';const preset=COVER_PRESETS.find(p=>p.id===normalizeCover(book.cover));box.setAttribute('data-cover-design',preset.design==='image'?'image':'legacy');box.setAttribute('data-cover-aspect',preset.id.startsWith('art-')?'portrait':'standard');
   const name=button(book.title||'제목 없는 노트','library-cover-name');name.setAttribute('title',book.title||'제목 없는 노트');name.setAttribute('aria-label',(book.title||'제목 없는 노트')+' · 표지 이름 수정');const appearance=coverTitleAppearance(book.cover,book.coverTitleSize??100);Object.assign(name.style,appearance);
   const form=document.createElement('form');form.className='library-cover-name-form';form.setAttribute('aria-label','표지 이름 수정');
   const input=document.createElement('textarea');input.className='library-cover-name-input';input.rows=3;input.maxLength=120;input.setAttribute('aria-label','노트 이름');input.placeholder='노트 이름';input.value=drafts.get(book.id)?.value??book.title;
   const hint=document.createElement('small');hint.textContent='이름을 쓰고 저장하세요';
   const error=document.createElement('span');error.className='library-cover-name-error';error.setAttribute('role','status');
   const actions=document.createElement('div');actions.className='library-cover-name-actions';const save=button('저장','primary'),cancel=button('취소','');save.type='submit';actions.append(save,cancel);form.append(input,hint,error,actions);box.append(name,form);
   let busy=false,composing=false;
   const sync=()=>{const editing=drafts.has(book.id);name.hidden=editing;form.hidden=!editing;input.disabled=busy;save.disabled=busy;cancel.disabled=busy;};
   const dismiss=()=>{if(busy)return;drafts.delete(book.id);input.value=book.title;error.textContent='';sync();name.focus?.();};
   name.onclick=()=>{if(saving)return;drafts.set(book.id,{value:input.value});sync();input.focus?.();input.select?.();};
   input.oninput=()=>{drafts.set(book.id,{value:input.value});error.textContent='';input.removeAttribute?.('aria-invalid');};
   input.oncompositionstart=()=>{composing=true;};input.oncompositionend=()=>{composing=false;};
   cancel.onclick=dismiss;
   form.onsubmit=async event=>{
    event?.preventDefault();if(busy||saving||composing)return false;
    const title=input.value.replace(/[\r\n]+/g,' ').trim();
    if(!title||title.length>120){error.textContent='이름을 1~120자로 입력해주세요.';input.setAttribute('aria-invalid','true');input.focus?.();return false;}
    if(title===book.title){dismiss();return true;}
    busy=true;saving=true;error.textContent='저장 중…';sync();
    try{if(await renameNotebook(book.id,title)===false)throw Error('저장하지 못했습니다. 다시 시도해주세요.');drafts.delete(book.id);busy=false;saving=false;onSaved(book.id);return true;}
    catch(issue){error.textContent=issue.message||'저장하지 못했습니다. 다시 시도해주세요.';return false;}
    finally{busy=false;saving=false;sync();}
   };
   input.onkeydown=event=>{if(composing||event.isComposing||event.keyCode===229)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss();}else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();void form.onsubmit(event);}};
   sync();return box;
  }
 };
}

import {PAPER_THEMES,PAPER_TYPES,normalizePaperTheme,paperBackgroundSvg} from './paper-themes.js';
import {COVER_PICKER_PRESETS,COVER_CATEGORIES,normalizeCover,normalizeBinding,normalizeCoverTitleSize,applyCoverAppearance,coverTitleAppearance,configureCoverImage,filterCoverPresets} from './notebook-covers.js';
/** Dialog owns drafts only: cancellation never calls persist. */
export function mountNotebookEditor({persist}){
 const $=id=>document.getElementById(id),dialog=$('notebook-dialog');let pending=null,busy=false,cover='art-01',paper='ruled',category='all',binding='bound',coverTitleSize=100;
 function renderPaper(){const chalkboard=$('new-paper-theme').value==='chalkboard';$('new-paper-hint').textContent=chalkboard?'초록 칠판은 줄 없는 속지로 만들어집니다.':'새 페이지는 현재 페이지의 속지 종류와 색상을 이어받습니다.';$('new-paper-types').replaceChildren(...PAPER_TYPES.map(({id,label})=>{const button=document.createElement('button');button.type='button';button.className='new-paper-choice';button.setAttribute('data-new-paper-type',id);button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(id===(chalkboard?'plain':paper)));button.disabled=busy||chalkboard;const preview=document.createElement('span');preview.className='new-paper-preview';preview.setAttribute('aria-hidden','true');preview.innerHTML=paperBackgroundSvg({paper:id,paperTheme:normalizePaperTheme($('new-paper-theme').value)});const name=document.createElement('span');name.textContent=label;button.append(preview,name);button.onclick=()=>{if(!busy&&!chalkboard){paper=id;renderPaper();[...$('new-paper-types').children].find(b=>b.getAttribute('data-new-paper-type')===id)?.focus();}};return button;}));}
 $('new-paper-theme').onchange=renderPaper;
 function renderTitle(){
  const title=$('notebook-name').value.trim()||'노트 이름';
  $('cover-preview-title').textContent=title;
  let overlay=$('cover-preview').querySelector('.cover-name-preview');
  if(!overlay){overlay=document.createElement('span');overlay.className='cover-name-preview';overlay.setAttribute('aria-hidden','true');$('cover-preview').append(overlay);}
  overlay.textContent=title;Object.assign(overlay.style,coverTitleAppearance(cover,coverTitleSize));
 }
 function renderTitleSize(){$('cover-title-size').value=String(coverTitleSize);$('cover-title-size-value').textContent=coverTitleSize+'%';$('cover-title-size').setAttribute('aria-valuetext',coverTitleSize+'퍼센트');renderTitle();}
 $('cover-title-size').oninput=()=>{if(!busy){coverTitleSize=normalizeCoverTitleSize(Number($('cover-title-size').value));renderTitleSize();}};
 $('reset-cover-title-size').onclick=()=>{if(!busy){coverTitleSize=100;renderTitleSize();}};
 function renderPreview(){const preset=applyCoverAppearance($('cover-preview'),cover);$('cover-preview').setAttribute('role','img');$('cover-preview').setAttribute('aria-label',preset.label+' 표지 미리보기');$('cover-selection-status').textContent=(COVER_PICKER_PRESETS.some(p=>p.id===cover)?'선택한 표지: ':'기존 표지 유지: ')+preset.label;renderTitle();}
 function syncChoices(){for(const button of $('cover-choice').children)button.setAttribute('aria-pressed',String(button.getAttribute('data-cover-id')===cover));}
 function renderChoices(){
  const presets=filterCoverPresets(category,$('cover-search').value);
  $('cover-count').textContent=presets.length+' / '+COVER_PICKER_PRESETS.length+'종';$('cover-empty').hidden=presets.length>0;
  $('cover-choice').replaceChildren(...presets.map(p=>{
   const b=document.createElement('button');b.type='button';b.className='cover-choice';b.setAttribute('aria-label',p.label);b.setAttribute('data-cover-id',p.id);b.setAttribute('aria-pressed',String(p.id===cover));b.disabled=busy;
   const swatch=document.createElement('span');applyCoverAppearance(swatch,p.id,'cover-choice-swatch',{imageElement:p.design==='image'});swatch.setAttribute('aria-hidden','true');if(p.design==='image'){const image=document.createElement('img');image.className='notebook-cover-art';configureCoverImage(image,p);image.alt='';image.loading='lazy';image.decoding='async';image.width=160;image.height=240;swatch.append(image);}
   const label=document.createElement('span');label.className='cover-choice-label';label.textContent=p.label;b.append(swatch,label);b.onclick=()=>{if(busy)return;cover=p.id;renderPreview();syncChoices();b.focus();};return b;
  }));
 }
 function renderCategories(){
  $('cover-categories').replaceChildren(...COVER_CATEGORIES.map(p=>{const b=document.createElement('button');b.type='button';b.className='cover-category';b.textContent=p.label+' '+filterCoverPresets(p.id).length;b.setAttribute('data-cover-category',p.id);b.setAttribute('aria-pressed',String(category===p.id));b.setAttribute('aria-controls','cover-choice');b.disabled=busy;b.onclick=()=>{if(busy)return;category=p.id;for(const item of $('cover-categories').children)item.setAttribute('aria-pressed',String(item===b));renderChoices();b.focus();};return b;}));
 }
 $('cover-search').oninput=renderChoices;
 function setCoverBusy(value){$('cover-title-size').disabled=value;$('reset-cover-title-size').disabled=value;$('cover-search').disabled=value;for(const id of ['cover-choice','cover-categories'])for(const b of $(id).children)b.disabled=value;}
 function finish(value){const resolve=pending?.resolve;pending=null;dialog.close();resolve?.(value);}
 $('notebook-name').oninput=renderTitle;
 $('cancel-notebook').onclick=()=>{if(!busy)finish(false)};
 dialog.addEventListener('cancel',e=>{e.preventDefault();if(!busy)finish(false)});
 $('notebook-form').onsubmit=async e=>{e.preventDefault();if(!pending||busy)return;const title=$('notebook-name').value.trim();if(!title||title.length>120){$('notebook-error').textContent='노트 이름을 1~120자로 입력해주세요.';$('notebook-name').focus();return;}busy=true;$('save-notebook').disabled=true;$('cancel-notebook').disabled=true;$('notebook-name').disabled=true;setCoverBusy(true);$('new-paper-theme').disabled=true;renderPaper();$('notebook-error').textContent='';try{const ok=await persist({id:pending.id,title,cover,binding,coverTitleSize,...(!pending.id?{paper: $('new-paper-theme').value==='chalkboard'?'plain':paper,paperTheme:normalizePaperTheme($('new-paper-theme').value)}:{})});if(ok===false)throw Error('저장하지 못했습니다. 기존 노트는 그대로입니다. 다시 시도해주세요.');finish(true);}catch(error){$('notebook-error').textContent=error.message||'저장하지 못했습니다.';}finally{busy=false;$('save-notebook').disabled=false;$('cancel-notebook').disabled=false;$('notebook-name').disabled=false;setCoverBusy(false);$('new-paper-theme').disabled=false;renderPaper();}};
 return {open(book=null){if(pending)return pending.promise;let resolve;const promise=new Promise(r=>resolve=r);pending={id:book?.id||null,resolve,promise};cover=book?normalizeCover(book.cover):'ai-01';binding=normalizeBinding(book?.binding);coverTitleSize=normalizeCoverTitleSize(book?.coverTitleSize);category='all';$('cover-search').value='';$('new-paper-label').hidden=!!book;$('new-paper-theme').replaceChildren(...PAPER_THEMES.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.label;return o;}));$('new-paper-theme').value='white';paper='ruled';renderPaper();$('notebook-name').value=book?.title||'';$('notebook-dialog-title').textContent=book?'이름·표지 변경':'새 노트 만들기';$('save-notebook').textContent=book?'변경 저장':'노트 만들기';$('notebook-error').textContent='';renderTitleSize();renderPreview();renderCategories();renderChoices();dialog.showModal();$('notebook-name').focus();return promise;}};
}

/** Local trash UI. Destructive actions always use the exact displayed snapshot. */
const NS='http://www.w3.org/2000/svg';
export function createTrashIcon(state='unknown'){
 const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 48 48');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','trash-menu-icon');svg.setAttribute('data-state',state);
 const add=(tag,attrs)=>{const el=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,value);svg.append(el);};
 if(state==='full'){
  add('path',{d:'M12 17 9 9l7-5 7 5 6-5 9 8-4 9z',fill:'#f6f1df',stroke:'#8c9bad','stroke-width':1.6,'stroke-linejoin':'round'});
  add('path',{d:'m13 10 5 3-2 6m7-10 3 6 7-3',fill:'none',stroke:'#aeb8c2','stroke-width':1.5,'stroke-linecap':'round'});
 }
 add('path',{d:'m11 18 3 23h20l3-23',fill:'#bccbda',stroke:'#71849c','stroke-width':2,'stroke-linejoin':'round'});
 add('path',{d:'m18 24 1 11m5-11v11m6-11-1 11',fill:'none',stroke:'#71849c','stroke-width':2,'stroke-linecap':'round'});
 add('path',{d:state==='full'?'M9 17h30':'M9 15h30M19 15v-4h10v4',fill:'none',stroke:'#dbe5ee','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'});
 if(state==='unknown'){add('circle',{cx:36,cy:35,r:9,fill:'#23364e',stroke:'#b5c4d5','stroke-width':1.5});add('path',{d:'M34 32a2 2 0 1 1 3 2l-1 1m0 3v.1',fill:'none',stroke:'#e6edf4','stroke-width':2,'stroke-linecap':'round'});}
 return svg;
}
export function mountTrash({listTrash,emptyTrash,restoreEntry,beforeOpen=async()=>true,onError=()=>{}}){
 const make=(tag,text,id)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(id)el.id=id;return el;};
 const button=make('button',null,'open-trash');button.type='button';button.className='trash-menu-button';
 const icon=make('span'),name=make('span','휴지통'),count=make('small');count.setAttribute('aria-live','polite');button.append(icon,name,count);document.querySelector('.side-bottom').append(button);
 const dialog=make('dialog',null,'trash-dialog');dialog.setAttribute('aria-labelledby','trash-title');
 const title=make('h2','휴지통','trash-title'),hint=make('p','삭제한 노트와 페이지를 이 기기에 보관합니다. 자동으로 비우지 않으며, 브라우저 데이터를 지우면 함께 사라집니다.'),status=make('p',null,'trash-status'),rows=make('div',null,'trash-items'),actions=make('div'),empty=make('button','휴지통 비우기','empty-trash'),close=make('button','닫기','close-trash');
 status.setAttribute('role','status');empty.type=close.type='button';empty.className='trash-danger';actions.className='trash-actions';actions.append(empty,close);dialog.append(title,hint,status,rows,actions);document.body.append(dialog);
 const confirmation=make('dialog',null,'trash-confirm-dialog');confirmation.setAttribute('aria-labelledby','trash-confirm-title');confirmation.setAttribute('aria-describedby','trash-confirm-warning');
 const confirmTitle=make('h2','휴지통을 영구 삭제할까요?','trash-confirm-title'),summary=make('p',null,'trash-confirm-summary'),warning=make('p','휴지통의 원본 필기, 글, 사진, PDF 배경과 회의록 페이지가 영구 삭제되며 복원할 수 없습니다. 노트 백업에는 휴지통이 포함되지 않습니다. 필요한 항목은 취소한 뒤 먼저 복원하고 백업하세요. 현재 사용 중인 노트는 삭제하지 않습니다.','trash-confirm-warning'),ackLabel=make('label'),ack=make('input',null,'trash-confirm-ack'),cancel=make('button','취소','cancel-empty-trash'),erase=make('button','영구 삭제','confirm-empty-trash'),confirmActions=make('div');
 ack.type='checkbox';ackLabel.className='trash-confirm-ack';ackLabel.append(ack,make('span','복원할 수 없는 영구 삭제임을 확인했습니다.'));cancel.type=erase.type='button';cancel.autofocus=true;erase.className='trash-danger';confirmActions.className='trash-actions';confirmActions.append(cancel,erase);confirmation.append(confirmTitle,summary,warning,ackLabel,confirmActions);document.body.append(confirmation);
 let entries=null,snapshot=null,busy=false,loading=false,opening=false,sequence=0;
 const pageCount=items=>items.reduce((total,item)=>total+item.pages.length,0);
 function paintIcon(){const state=entries===null?'unknown':entries.length?'full':'empty';icon.replaceChildren(createTrashIcon(state));count.textContent=entries===null?'상태 확인 필요':entries.length?entries.length+'개 항목':'비어 있음';button.setAttribute('aria-label','휴지통 · '+count.textContent);button.setAttribute('data-trash-state',state);}
 function controls(){empty.disabled=busy||loading||entries===null||!entries.length;close.disabled=busy;erase.disabled=busy||loading||entries===null||!snapshot||!ack.checked;cancel.disabled=ack.disabled=busy;for(const row of rows.children)Array.from(row.children).at(-1).disabled=busy||loading;}
 function render(){paintIcon();rows.replaceChildren();if(entries===null){controls();return;}status.textContent=entries.length?entries.length+'개 항목 · '+pageCount(entries)+'페이지':'휴지통이 비어 있습니다.';
  for(const entry of entries){const row=make('section'),label=make('p'),restore=make('button','복원');restore.type='button';label.textContent=(entry.pages[0]?.title||'제목 없는 노트')+' · '+entry.pages.length+'페이지 · '+new Date(entry.deletedAt).toLocaleString('ko-KR');restore.setAttribute('aria-label',(entry.pages[0]?.title||'제목 없는 노트')+' 복원');restore.onclick=async()=>{if(busy||loading||confirmation.open)return;busy=true;controls();let error;try{const result=await restoreEntry(entry.id);if(result===false)error='복원이 완료되지 않았습니다. 항목을 확인하고 다시 시도해주세요.';}catch(e){error=e.message||'복원하지 못했습니다.';onError(e.message||String(e));}finally{busy=false;await refresh();if(error)status.textContent=error;}};row.append(label,restore);rows.append(row);}controls();
 }
 async function refresh(){if(busy)return false;const token=++sequence;loading=true;controls();try{const latest=await listTrash();if(token!==sequence)return false;entries=structuredClone(latest);render();return true;}catch(e){if(token!==sequence)return false;entries=null;snapshot=null;ack.checked=false;if(confirmation.open)confirmation.close();status.textContent='휴지통 상태를 확인하지 못했습니다. 메뉴를 다시 열어 확인해주세요.';render();return false;}finally{if(token===sequence){loading=false;controls();}}}
 async function show(){if(busy||opening||dialog.open)return false;opening=true;try{if(await beforeOpen()===false)return false;await refresh();if(!dialog.open)dialog.showModal();return true;}catch(e){onError(e.message||String(e));return false;}finally{opening=false;}}
 function dismissConfirmation(){if(busy)return;snapshot=null;ack.checked=false;confirmation.close();controls();}
 empty.onclick=()=>{if(busy||loading||!entries?.length||confirmation.open)return;snapshot=structuredClone(entries);ack.checked=false;summary.textContent=snapshot.length+'개 항목 · '+pageCount(snapshot)+'페이지를 영구 삭제합니다.';controls();confirmation.showModal();cancel.focus();};
 ack.onchange=controls;cancel.onclick=dismissConfirmation;confirmation.addEventListener('cancel',event=>{if(busy){event.preventDefault();return;}snapshot=null;ack.checked=false;controls();});
 erase.onclick=async()=>{if(busy||loading||entries===null||!snapshot||!ack.checked)return;busy=true;controls();const confirmed=structuredClone(snapshot);let error;try{await emptyTrash(confirmed);}catch(e){error=e.message||'휴지통을 비우지 못했습니다.';onError(e.message||String(e));}finally{busy=false;snapshot=null;ack.checked=false;confirmation.close();await refresh();if(error)status.textContent=error+' 내용을 확인한 뒤 다시 선택해주세요.';else if(entries!==null)status.textContent=entries.length?'확인한 항목을 영구 삭제했습니다. 새로 들어온 '+entries.length+'개 항목은 휴지통에 남아 있습니다.':'휴지통을 비웠습니다.';controls();}};
 close.onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});button.onclick=show;paintIcon();controls();
 return {refresh,show,button,dialog};
}

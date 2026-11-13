/** One video entry point for link and local files. Never imports arbitrary HTML. */
export function mountVideoInsert({beforeOpen,canInteract,getPageId,insert,insertLocal,onSelect,toast,anchor}) {
 const button=document.createElement('button');button.id='insert-video';button.type='button';button.className='direct-tool';button.setAttribute('aria-label','영상 추가');
 const icon=document.createElement('img');icon.className='stationery-icon';icon.src='./tool-icons/video.svg';icon.width=32;icon.height=32;icon.alt='';icon.setAttribute('aria-hidden','true');icon.draggable=false;
 const label=document.createElement('span');label.textContent='영상';button.append(icon,label);anchor.before(button);
 const dialog=document.createElement('dialog');dialog.id='youtube-dialog';dialog.setAttribute('aria-labelledby','video-insert-title');
 const title=document.createElement('h2');title.id='video-insert-title';title.textContent='영상 넣기';
 const field=document.createElement('label');field.textContent='영상 링크';const input=document.createElement('input');input.type='url';input.placeholder='https://youtu.be/…';input.setAttribute('aria-label','YouTube 영상 링크');input.autocomplete='off';field.append(input);
 const help=document.createElement('p');help.textContent='YouTube 링크와 위치만 저장합니다. 인터넷이 필요하며 노트 안에서 재생할 수 있습니다. 일부 영상은 외부 재생이 제한될 수 있습니다.';
 const add=document.createElement('button');add.type='button';add.textContent='넣기';
 const local=document.createElement('button');local.type='button';local.id='insert-local-video';local.textContent='기기 영상 저장 · 파일 선택';
 const localHelp=document.createElement('p');localHelp.textContent='영상은 이 기기에 암호화해 저장하며 서버로 올리지 않습니다. 노트 백업에는 영상 원본이 포함되지 않으므로 원본 파일도 따로 보관하세요.';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';
 dialog.append(title,field,help,add,document.createElement('hr'),local,localHelp,cancel);document.body.append(dialog);
 let requestedPage=null,picker=null,busy=false;
 const allowed=()=>canInteract()&&requestedPage===getPageId();
 button.onclick=()=>{if(!canInteract()||busy)return;beforeOpen();requestedPage=getPageId();input.value='';if(!dialog.open)dialog.showModal();input.focus();};
 cancel.onclick=()=>dialog.close();
 add.onclick=()=>{if(!allowed()){dialog.close();return;}if(insert(input.value)){dialog.close();onSelect();}};
 input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add.onclick();}};
 local.onclick=()=>{if(!allowed()||picker||busy)return;const page=requestedPage;dialog.close();const fileInput=document.createElement('input');picker=fileInput;fileInput.type='file';fileInput.accept='video/*';fileInput.hidden=true;document.body.append(fileInput);
 const cleanup=()=>{fileInput.remove();if(picker===fileInput)picker=null;};
 fileInput.oncancel=cleanup;fileInput.onchange=async()=>{const file=fileInput.files?.[0];cleanup();if(!file||page!==getPageId()||!canInteract())return;busy=true;try{onSelect();await insertLocal(file);}catch(e){toast(e.message);}finally{busy=false;}};fileInput.click();};
 return {button,dialog};
}

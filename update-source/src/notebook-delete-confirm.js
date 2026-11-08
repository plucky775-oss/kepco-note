/** Explicit, recoverable notebook deletion confirmation, including standalone iPad apps. */
let pending=false;
export async function confirmNotebookDeletion({title,count}){
 if(pending)return false;
 pending=true;
 const previous=document.activeElement,dialog=document.createElement('dialog');
 dialog.className='notebook-delete-confirm';dialog.setAttribute('aria-labelledby','notebook-delete-title');dialog.setAttribute('aria-describedby','notebook-delete-description');
 const heading=document.createElement('h2');heading.id='notebook-delete-title';heading.textContent='노트를 휴지통으로 이동할까요?';
 const description=document.createElement('p');description.id='notebook-delete-description';description.textContent='“'+title+'” 노트의 '+count+'페이지를 휴지통으로 이동합니다. 원본 필기·글·사진은 휴지통에서 복원할 수 있습니다.';
 const actions=document.createElement('div');actions.className='trash-actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';cancel.autofocus=true;
 const accept=document.createElement('button');accept.type='button';accept.className='trash-danger';accept.textContent='휴지통으로 이동';
 actions.append(cancel,accept);dialog.append(heading,description,actions);document.body.append(dialog);
 return new Promise(resolve=>{
  let settled=false;
  const finish=value=>{if(settled)return;settled=true;pending=false;if(dialog.open)dialog.close();dialog.remove();previous?.focus?.();resolve(value);};
  cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
  dialog.addEventListener('close',()=>finish(false));
  try{dialog.showModal();cancel.focus();}catch{finish(false);}
 });
}


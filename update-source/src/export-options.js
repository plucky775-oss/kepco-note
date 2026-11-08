/** A download request is observable; successful saving to a device is not. */
export const BACKUP_STATUS_KEY='moa-note-backup-attempt-v1';
export const BACKUP_INCLUDED='선택한 노트의 페이지, 원본 필기, 입력·변환 글, 도형·표, 사진, PDF 배경, 페이지로 넣은 회의록, 글씨체 설정';
export const BACKUP_EXCLUDED='녹음 원본, 다이어리·일정, 내 글씨체 파일, 휴지통은 포함하지 않습니다.';
function defaultStorage(){try{return globalThis.localStorage}catch{return null}}
function validRecord(value){return value&&value.version===1&&['all','notebook','selected'].includes(value.scope)&&Number.isFinite(value.requestedAt)&&value.requestedAt>=0&&value.requestedAt<=8640000000000000&&Number.isSafeInteger(value.pageCount)&&value.pageCount>0&&Number.isSafeInteger(value.partCount)&&value.partCount>0;}
export function recordBackupAttempt({scope='all',pageCount,partCount,requestedAt=Date.now()}={},storage=defaultStorage()){
 const record={version:1,scope,pageCount,partCount,requestedAt};
 if(!validRecord(record))throw Error('백업 기록이 올바르지 않습니다.');
 try{storage?.setItem(BACKUP_STATUS_KEY,JSON.stringify(record));return Boolean(storage)}catch{return false}
}
export function getBackupStatus(storage=defaultStorage()){
 try{const record=JSON.parse(storage?.getItem(BACKUP_STATUS_KEY)||'null');return validRecord(record)?{version:1,scope:record.scope,pageCount:record.pageCount,partCount:record.partCount,requestedAt:record.requestedAt}:null}catch{return null}
}
export function backupStatusText(record){
 if(!validRecord(record))return '이 기기에서 기록한 노트 백업 요청이 없습니다. 이전에 저장한 파일이 있는지는 확인할 수 없습니다.';
 const scope={all:'전체 노트',notebook:'한 노트',selected:'선택 페이지'}[record.scope];
 return '최근 노트 백업 다운로드 요청: '+new Date(record.requestedAt).toLocaleString('ko-KR')+' · '+scope+' · '+record.pageCount+'페이지 · '+record.partCount+'개 파일. 기기에 저장이 완료됐는지는 확인할 수 없습니다. 파일을 직접 확인해주세요.';
}
/** Preserve notebook order regardless of the user's checkbox click order. */
export function selectedPageIds(pages,selected){
 const wanted=new Set(selected);const ids=pages.filter(page=>wanted.has(page.id)).map(page=>page.id);
 if(!ids.length)throw Error('PDF에 넣을 페이지를 한 장 이상 선택해주세요.');
 if(ids.length!==wanted.size||new Set(ids).size!==ids.length)throw Error('페이지 목록이 변경됐습니다. 다시 선택해주세요.');
 return ids;
}
/** Export callback owns rendering, actual Web Share capability, and fallback. */
export function mountExportOptions({getPages,getCurrentId,exportSelected}){
 const $=id=>document.getElementById(id),make=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
 const dialog=make('dialog');dialog.id='selected-pdf-dialog';dialog.setAttribute('aria-labelledby','selected-pdf-title');
 const heading=make('h2','선택 페이지 PDF');heading.id='selected-pdf-title';
 const hint=make('p','페이지 순서대로 이미지 PDF를 만듭니다. 공유를 지원하지 않는 기기에서는 파일 다운로드로 전환합니다.');
 const all=make('button','전체 선택'),current=make('button','현재 페이지만'),none=make('button','선택 해제'),list=make('div'),status=make('p'),save=make('button','선택 페이지 PDF 저장'),share=make('button','선택 페이지 PDF 공유'),close=make('button','닫기');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');list.setAttribute('aria-label','PDF에 넣을 페이지');
 let pages=[],selected=new Set(),busy=false,checks=[];
 const update=()=>{for(const {input,id}of checks){input.checked=selected.has(id);input.disabled=busy;}status.textContent=busy?'PDF를 준비하고 있습니다…':selected.size+' / '+pages.length+'페이지 선택';save.disabled=share.disabled=busy||!selected.size;all.disabled=current.disabled=none.disabled=close.disabled=busy;};
 const choose=ids=>{if(busy)return;selected=new Set(ids);update()};
 all.onclick=()=>choose(pages.map(p=>p.id));current.onclick=()=>choose(pages.some(p=>p.id===getCurrentId())?[getCurrentId()]:[]);none.onclick=()=>choose([]);
 const open=()=>{if(busy||dialog.open)return;pages=getPages().map(p=>({id:p.id}));selected=new Set(pages.some(p=>p.id===getCurrentId())?[getCurrentId()]:[]);checks=[];list.replaceChildren(...pages.map((page,i)=>{const label=make('label'),input=make('input');input.type='checkbox';input.value=page.id;input.onchange=()=>{if(busy)return;input.checked?selected.add(page.id):selected.delete(page.id);update()};checks.push({input,id:page.id});label.append(input,make('span',(i+1)+'페이지'));return label}));update();dialog.showModal();};
 const run=async sharing=>{if(busy||!selected.size)return;busy=true;update();try{const ids=selectedPageIds(getPages(),selected);const result=await exportSelected(ids,{share:sharing});if(result!==false)dialog.close();}catch(error){status.textContent=error?.name==='AbortError'?'공유를 취소했습니다.':error?.message||'PDF를 만들지 못했습니다.';}finally{busy=false;const message=status.textContent;update();if(dialog.open&&message!=='PDF를 준비하고 있습니다…')status.textContent=message;}};
 save.onclick=()=>run(false);share.onclick=()=>run(true);close.onclick=()=>{if(!busy)dialog.close()};dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
 dialog.append(heading,hint,all,current,none,list,status,save,share,close);document.body.append(dialog);
 const button=make('button','페이지 선택 · PDF 저장 / 공유');button.id='choose-pdf-pages';button.type='button';button.onclick=()=>{$('export-dialog')?.close();open()};$('export-pdf')?.after(button);
 const backupDialog=make('dialog');backupDialog.id='backup-status-dialog';backupDialog.setAttribute('aria-labelledby','backup-status-title');const backupHeading=make('h2','백업 현황');backupHeading.id='backup-status-title';const summary=make('p'),included=make('p','노트 백업에 포함되는 내용: '+BACKUP_INCLUDED),excluded=make('p',BACKUP_EXCLUDED),backupClose=make('button','닫기');backupClose.onclick=()=>backupDialog.close();backupDialog.append(backupHeading,summary,included,excluded,make('p','앱의 기기 저장과 외부 파일 백업은 다릅니다. 클라우드 백업·동기화 상태를 표시하는 기능이 아닙니다.'),backupClose);document.body.append(backupDialog);
 const backupButton=make('button','백업 현황');backupButton.id='show-backup-status';backupButton.type='button';backupButton.onclick=()=>{summary.textContent=backupStatusText(getBackupStatus());if(!backupDialog.open)backupDialog.showModal()};$('backup')?.after(backupButton);
 return {open,dialog,backupDialog};
}


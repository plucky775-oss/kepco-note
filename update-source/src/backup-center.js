import {listTemplates,exportTemplates,importTemplates} from './page-templates.js';
import {readBackupFile,fingerprint,verifyDownload} from './backup-model.js';
import {diaryBackupText} from './diary-dialog.js';
import {importDiaryEntries} from './diary-model.js';
import {listRecordings,getRecording} from './meeting-recorder.js';
import {recordingFilename} from './meeting-dialog.js';
export function mountBackupCenter({root=document,beforeOpen=async()=>{},getPages=()=>[],exportNotes,restoreNotes,diaryStore,download,services={}}){
 const service={listRecordings,getRecording,fingerprint,verifyDownload,listTemplates,exportTemplates,importTemplates,...services},elements={},receipts=[];let busy=false,pending=null,returnFocus;
 const el=(tag,key,text,parent=root.body)=>{const n=root.createElement(tag);if(key){n.id='backup-center-'+key;elements[key]=n;}if(text)n.textContent=text;parent.append(n);return n;};
 const dialog=el('dialog','dialog');dialog.setAttribute('aria-labelledby','backup-center-title');
 const style=el('style',null,'#backup-center-dialog{width:min(760px,calc(100vw - 24px));max-height:85dvh;overflow:auto;padding:22px;border:1px solid #cbd5e1;border-radius:16px}#backup-center-dialog button{min-height:44px;margin:4px;padding:10px;border:1px solid #cbd5e1;border-radius:8px}#backup-center-dialog p,#backup-center-dialog li{line-height:1.6;overflow-wrap:anywhere}#backup-center-dialog section{border-top:1px solid #dbe2eb;margin-top:18px;padding-top:12px}#backup-center-dialog [hidden]{display:none!important}#backup-center-dialog [role=alert]{color:#b42334}');
 el('h2','title','백업 · 복원',dialog);
 const close=el('button','close','닫기',dialog);
 el('p',null,'각 자료는 별도 파일로 보관합니다. 다운로드 요청만으로 저장 완료를 확인할 수 없습니다. 저장한 파일을 다시 선택해 원본과 일치하는지 확인하세요.',dialog);
 const status=el('p','status','',dialog);status.setAttribute('role','status');const error=el('p','error','',dialog);error.setAttribute('role','alert');
 const scope=el('section','scope','',dialog),counts=el('p','counts','',scope);
 el('p',null,'노트 백업: 필기·글·사진·PDF 배경·노트로 저장한 회의록 포함. 동영상 원본, 다이어리, 녹음 원본, 녹음창의 회의록·서명 정보, 내 글씨체 파일, 휴지통, 별도 보관 양식은 제외됩니다. 동영상 위치·연결 정보만 포함되며 다른 기기에서 복원하거나 앱 데이터를 지운 뒤에는 원본 영상 파일을 다시 선택해야 합니다. 원본도 별도로 보관하세요.',scope);
 const notes=el('button','notes','전체 노트 백업 다운로드',scope);
 el('p',null,'다이어리 JSON: 메모·일정·할 일 포함. 노트와 녹음은 포함되지 않습니다.',scope);
 const diary=el('button','diary','다이어리 JSON 다운로드',scope);
 el('p',null,'빈 양식 백업: 종이와 도형·표 틀만 포함합니다. 노트 백업과 별도 보관하며 아래에서 복원할 수 있습니다. 원본 글·필기·사진·PDF·회의·서명은 포함되지 않습니다.',scope);
 const templates=el('button','templates','빈 양식 백업 다운로드',scope);
 const records=el('section','records','',dialog);el('h3',null,'녹음 원본 · 개별 다운로드',records);
 el('p',null,'음성 파일은 재생용 원본입니다. 회의록 편집 내용·서명·노트 연결은 포함되지 않으며, 앱 녹음 보관함으로 다시 가져오기는 지원하지 않습니다. 필요한 회의록과 서명은 먼저 회의 노트로 저장한 뒤 노트 백업도 받으세요.',records);
 const recordList=el('div','record-list','',records),downloads=el('section','downloads','',dialog);el('h3',null,'앱을 연 뒤 요청한 다운로드',downloads);
 const receiptList=el('div','receipts','아직 다운로드 요청이 없습니다.',downloads);
 const restore=el('section','restore','',dialog);el('h3',null,'복원 전 파일 미리보기',restore);
 const choose=el('button','choose','노트·다이어리·빈 양식 백업 선택',restore),input=el('input','file','',restore);input.type='file';input.accept='.json,application/json';input.hidden=true;
 const preview=el('div','preview','',restore),apply=el('button','apply','현재 자료를 유지하고 복사본 추가',restore);apply.hidden=true;
 const controls=[close,notes,diary,templates,choose,apply];
 function lock(){for(const b of controls)b.disabled=busy;for(const b of recordList.querySelectorAll?.('button')||[])b.disabled=busy;}
 async function run(fn){if(busy)return;busy=true;error.textContent='';lock();try{await fn();}catch(e){error.textContent=e.message||'작업을 완료하지 못했습니다. 원본은 삭제하지 않았습니다.';}finally{busy=false;lock();}}
 async function requestDownload(blob,name){
  status.textContent='';
  let digest=null;try{digest=await service.fingerprint(blob);}catch{}
  if(await download(blob,name)===false)throw Error('백업 파일 저장이 취소되었거나 실패했습니다. 저장 위치를 확인하고 다시 시도해주세요.');const receipt={name,size:blob.size,digest};receipts.push(receipt);renderReceipts();status.textContent='다운로드를 요청했습니다. 저장한 파일을 다시 선택해 확인해주세요.';
 }
 function renderReceipts(){receiptList.replaceChildren();for(const receipt of receipts){const row=el('div',null,'',receiptList);el('p',null,`${receipt.name} · ${receipt.size.toLocaleString()}바이트 · 다운로드 요청됨`,row);const label=el('p',null,receipt.digest?'저장 여부 미확인':'파일이 원본과 같은지 확인할 수 없습니다. 파일 앱에서 직접 확인하세요.',row);if(!receipt.digest)continue;const verify=el('button',null,'저장한 파일 일치 확인',row),file=el('input',null,'',row);file.type='file';file.hidden=true;verify.onclick=()=>file.click();file.onchange=()=>{const selected=file.files?.[0];file.value='';if(selected)run(async()=>{await service.verifyDownload(selected,receipt);label.textContent='선택한 파일이 다운로드 요청 원본과 일치합니다. 별도 보관 장소에도 복사해주세요.';});};}}
 async function refresh(){counts.textContent=`현재 앱에서 읽은 노트 ${getPages().length}페이지 · 읽지 못한 손상 자료와 휴지통은 제외`;try{const diary=await diaryStore.load();counts.textContent+=` · 다이어리 ${diary.entries.length}개`;}catch{counts.textContent+=' · 다이어리 수량 확인 실패';}try{counts.textContent+=` · 빈 양식 ${service.listTemplates().length}개`;}catch{counts.textContent+=' · 빈 양식 수량 확인 실패';}recordList.replaceChildren();try{const list=await service.listRecordings();if(!list.length)el('p',null,'저장된 녹음이 없습니다.',recordList);for(const r of list){const row=el('div',null,'',recordList);el('p',null,`${r.title||'회의 녹음'} · ${r.size||0}바이트 · ${r.status||'상태 미확인'}`,row);const button=el('button',null,'이 녹음 원본 다운로드',row);button.onclick=()=>run(async()=>{const record=await service.getRecording(r.id);if(!record?.blob?.size)throw Error('녹음 원본이 없거나 비어 있습니다. 녹음 화면을 확인해주세요.');if(record.size!==record.blob.size)throw Error('저장된 녹음 크기와 원본이 다릅니다. 녹음 화면에서 복구 가능한 원본을 확인해주세요.');await requestDownload(record.blob,recordingFilename(record));});}}catch(e){el('p',null,'녹음 목록을 확인하지 못했습니다: '+e.message,recordList);}}
 notes.onclick=()=>run(async()=>{await exportNotes(requestDownload);});
 diary.onclick=()=>run(async()=>{const doc=await diaryStore.load();await requestDownload(new Blob([diaryBackupText(doc)],{type:'application/json'}),'KEPCO-다이어리-백업.json');});
 templates.onclick=()=>run(async()=>{await requestDownload(new Blob([service.exportTemplates()],{type:'application/json'}),'nib-blank-templates.json');});
 choose.onclick=()=>input.click();
 input.onchange=()=>{const file=input.files?.[0];input.value='';if(!file||busy)return;run(async()=>{pending=null;apply.hidden=true;preview.replaceChildren();const info=await readBackupFile(file);pending=info;el('p',null,`${file.name} · ${file.size.toLocaleString()}바이트 · ${info.kind==='notes'?'노트 페이지':info.kind==='templates'?'빈 양식':'다이어리 기록'} ${info.count}개`,preview);el('p',null,info.warning,preview);el('p',null,'아직 복원하지 않았습니다. 아래 버튼을 눌러야 새 복사본으로 추가합니다.',preview);const list=el('ul',null,'',preview);for(const title of info.items.slice(0,100))el('li',null,title,list);if(info.items.length>100)el('p',null,`외 ${info.items.length-100}개`,preview);apply.hidden=info.count===0;});};
 apply.onclick=()=>run(async()=>{if(!pending)return;const info=pending;if(info.kind==='notes'){if(await restoreNotes(info)===false)return;}else if(info.kind==='templates')service.importTemplates(info.templates);else await diaryStore.update(current=>importDiaryEntries(current,info.diary));pending=null;apply.hidden=true;status.textContent=info.kind==='templates'?'빈 양식을 복사본으로 추가했습니다. 기존 노트와 양식은 유지됩니다.':info.kind==='diary'?'다이어리 복사본을 추가했습니다. 복원한 기록의 알림과 회의 연결은 해제되었습니다.':'노트 복사본을 추가했습니다. 동영상 원본은 포함되지 않습니다. 저장본이 없으면 원본 영상을 다시 선택해주세요. 녹음 원본과 내 글씨체 파일도 별도로 보관해주세요.';await refresh();});
 function dismiss(){if(busy)return;pending=null;apply.hidden=true;preview.replaceChildren();dialog.close();returnFocus?.focus?.();}
 close.onclick=dismiss;dialog.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
 return {elements,requestDownload,async open(){if(busy||dialog.open)return;returnFocus=root.activeElement;await run(async()=>{await beforeOpen();pending=null;apply.hidden=true;preview.replaceChildren();dialog.showModal();await refresh();});},destroy(){if(busy)return false;dialog.remove();style.remove();return true;}};
}

import {listDeviceVideoStorage,deleteUnreferencedDeviceVideo} from './device-video-store.js';

// Unknown/locked records fail closed. Preserve every reference in both undo
// directions and trash, not merely the currently visible notebook.
export function collectVideoReferences({pages,trash,histories=[]}){
 if(!Array.isArray(pages)||!Array.isArray(trash)||!Array.isArray(histories))throw Error('노트와 휴지통 상태를 확인하지 못했습니다.');
 const ids=new Set();
 function visit(page){
  if(!page||page._locked||page.encrypted)throw Error('잠긴 노트가 있어 사용 여부를 확인할 수 없습니다. 모든 노트를 연 뒤 다시 확인해주세요.');
  if(page.videoObjects!==undefined&&!Array.isArray(page.videoObjects))throw Error('영상 참조를 확인하지 못했습니다.');
  for(const video of page.videoObjects||[])if(video.provider==='local'&&video.assetId)ids.add(video.assetId);
 }
 pages.forEach(visit);
 for(const entry of trash){if(!Array.isArray(entry.pages))throw Error('휴지통 내용을 확인하지 못했습니다.');entry.pages.forEach(visit);}
 for(const history of histories){if(!Array.isArray(history?.past)||!Array.isArray(history?.future))throw Error('실행 취소 기록을 확인하지 못했습니다.');history.past.forEach(visit);history.future.forEach(visit);}
 return ids;
}
const size=bytes=>(bytes/1024/1024).toFixed(1)+' MiB';
export function mountVideoStorageManager({root=document,getReferences,beforeOpen=async()=>{},canDelete=()=>false,services={}}){
 const service={listDeviceVideoStorage,deleteUnreferencedDeviceVideo,...services};
 let busy=false,snapshot=null;
 const make=(tag,text,parent)=>{const e=root.createElement(tag);if(text)e.textContent=text;parent?.append(e);return e;};
 const button=make('button','영상 저장공간',root.querySelector('.side-bottom'));button.type='button';button.id='video-storage-open';
 const dialog=make('dialog','',root.body);dialog.id='video-storage-dialog';dialog.setAttribute('aria-label','영상 저장공간');
 dialog.style.cssText='width:min(620px,calc(100vw - 24px));max-height:85dvh;overflow:auto;padding:22px;border-radius:16px';
 make('h2','영상 저장공간',dialog);
 make('p','이 기기에 암호화해 저장한 영상 원본입니다. 노트 JSON 백업에는 영상 원본이 없습니다. 앱 삭제·데이터 초기화 전에 원본 영상을 따로 보관하세요.',dialog);
 const status=make('p','',dialog);status.setAttribute('role','status');
 const error=make('p','',dialog);error.setAttribute('role','alert');
 const list=make('div','',dialog);
 const refresh=make('button','다시 확인',dialog),close=make('button','닫기',dialog);
 for(const b of [refresh,close])b.type='button';
 function controls(){refresh.disabled=close.disabled=busy;for(const b of list.querySelectorAll('button'))b.disabled=busy;}
 async function scan(){
  snapshot=null;list.replaceChildren();error.textContent='';
  const stored=await service.listDeviceVideoStorage();
  status.textContent=`저장 영상 ${stored.assets.length}개 · 원본 ${size(stored.assets.reduce((n,a)=>n+a.size,0))} (암호화 부가 용량 제외)`;
  if(stored.pendingCount){error.textContent='저장 중이거나 미완료인 영상이 있어 정리를 중단했습니다. 저장을 마치고 다시 확인해주세요.';return;}
  const refs=await getReferences();
  const candidates=stored.assets.filter(asset=>!refs.has(asset.assetId));
  snapshot=candidates;
  make('p',`노트·휴지통·실행 취소에서 참조하지 않는 영상 ${candidates.length}개. 외부 백업이나 다른 창의 참조는 확인할 수 없습니다. 다른 창은 닫고 원본을 보관한 경우에만 개별 삭제하세요.`,list);
  candidates.forEach((asset,index)=>{
   const row=make('p',`${index+1}. 영상 원본 ${size(asset.size)} `,list);
   const remove=make('button','이 원본 삭제',row);remove.type='button';
   remove.onclick=()=>run(async()=>{
    if(!snapshot?.includes(asset)||!canDelete())throw Error('앱 상태가 바뀌었습니다. 다시 확인해주세요.');
    const fresh=await getReferences();if(fresh.has(asset.assetId))throw Error('사용 중인 영상은 삭제하지 않습니다.');
    if(!globalThis.confirm(`영상 원본 ${size(asset.size)}를 이 기기에서 영구 삭제할까요? 실행 취소할 수 없습니다. 외부 JSON 백업의 영상도 재생되지 않을 수 있습니다. 다른 창을 닫았고 원본 파일을 따로 보관했는지 확인하세요.`))return;
    const current=await getReferences();
    if(current.has(asset.assetId))throw Error('영상 참조가 바뀌어 삭제하지 않았습니다.');
    await service.deleteUnreferencedDeviceVideo(asset,{isAllowed:()=>canDelete()&&!current.has(asset.assetId)});
    await scan();status.textContent+=' · 선택한 원본 삭제 완료';
   });
  });
 }
 async function run(action){if(busy)return;busy=true;controls();try{await action();}catch(e){error.textContent=e.message||'영상 저장공간을 확인하지 못했습니다.';}finally{busy=false;controls();}}
 button.onclick=()=>run(async()=>{await beforeOpen();if(!dialog.open)dialog.showModal();await scan();});
 refresh.onclick=()=>run(scan);close.onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 return {dialog,button};
}

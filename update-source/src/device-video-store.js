// Video bytes stay in this browser's IndexedDB, never in notes or on a server.
// The note alone holds the random key. Even unlocked notes use ciphertext here.
const DB_NAME='nib-device-videos';
const DB_VERSION=1;
const FORMAT_VERSION=1;
export const DEVICE_VIDEO_CHUNK_BYTES=4*1024*1024;
export const MAX_DEVICE_VIDEO_BYTES=256*1024*1024;
const MAX_CHUNKS=MAX_DEVICE_VIDEO_BYTES/DEVICE_VIDEO_CHUNK_BYTES;
const STORES=['manifests','chunks','pending'];
const encoder=new TextEncoder();
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9-]{1,100}$/.test(id);
const issue=(message,name='Error',cause)=>Object.assign(new Error(message),{name,...(cause?{cause}:{})});
const damaged=cause=>issue('기기에 저장한 영상이 손상되었거나 일부가 없습니다. 원본 영상을 다시 선택해주세요.','DataError',cause);

function allowed(isAllowed){
 if(typeof isAllowed!=='function'||!isAllowed())throw issue('노트가 잠겼거나 화면이 바뀌어 영상 작업을 중단했습니다. 다시 열고 시도해주세요.','AbortError');
}
function capabilities(){
 const c=globalThis.crypto;
 if(!c?.subtle?.importKey||!c.subtle.encrypt||!c.subtle.decrypt||!c.getRandomValues||!c.randomUUID)throw issue('이 브라우저에서는 영상을 안전하게 기기에 저장할 수 없습니다. 보안 연결(HTTPS)의 최신 브라우저를 이용해주세요.','NotSupportedError');
 if(!globalThis.indexedDB?.open)throw issue('기기 영상 저장소를 사용할 수 없습니다. 브라우저의 저장 공간 설정을 확인해주세요.','NotSupportedError');
 return c;
}
function storageError(error){
 if(error?.name==='QuotaExceededError'||error?.code===22||error?.code===1014)return issue('기기 저장 공간이 부족해 영상을 저장하지 못했습니다. 공간을 확보한 뒤 다시 시도해주세요.','QuotaExceededError',error);
 if(error?.name==='SecurityError'||error?.name==='InvalidStateError'||error?.name==='UnknownError')return issue('기기 영상 저장소에 접근하지 못했습니다. 브라우저의 저장 공간 설정을 확인한 뒤 다시 시도해주세요.',error.name,error);
 return error;
}
const encodeKey=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function decodeKey(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))throw damaged();
 let bytes;
 try{bytes=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));}catch{throw damaged();}
 if(bytes.length!==32||encodeKey(bytes)!==value){bytes.fill(0);throw damaged();}
 return bytes;
}
const aad=(manifest,index)=>encoder.encode(JSON.stringify(['nib-device-video',manifest.version,manifest.assetId,index,manifest.chunkCount,manifest.size,manifest.mimeType]));

// This estimate is only a hint. Private browsing and different browsers report
// different budgets; actual transaction success is the authority, not a guess.
async function preflight(isAllowed){
 allowed(isAllowed);
 const storage=globalThis.navigator?.storage;
 if(typeof storage?.estimate!=='function')return;
 try{await storage.estimate();}catch{/* Unavailable estimates must not block a save. */}
 allowed(isAllowed);
 // Deliberately do not request navigator.storage.persist() or any permission.
}

function openDatabase(isAllowed){
 allowed(isAllowed);
 return new Promise((resolve,reject)=>{
  let request,settled=false,problem;
  const fail=error=>{if(!settled){settled=true;reject(error);}};
  try{request=globalThis.indexedDB.open(DB_NAME,DB_VERSION);}catch(error){fail(storageError(error));return;}
  request.onupgradeneeded=()=>{
   try{
    allowed(isAllowed);
    const db=request.result;
    for(const name of STORES)if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:name==='chunks'?['assetId','index']:'assetId'});
   }catch(error){problem=error;try{request.transaction.abort();}catch{fail(error);}}
  };
  request.onerror=()=>fail(problem||storageError(request.error));
  request.onblocked=()=>fail(issue('다른 창에서 영상 저장소를 사용 중입니다. 다른 창을 닫은 뒤 다시 시도해주세요.'));
  request.onsuccess=()=>{
   const db=request.result;
   if(settled){db.close();return;}
   try{allowed(isAllowed);}catch(error){db.close();fail(error);return;}
   db.onversionchange=()=>db.close();
   settled=true;resolve(db);
  };
 });
}

// Never await crypto or file reads inside an IndexedDB transaction. Resolve
// only on commit/abort, and recheck the caller at every request/event boundary.
function transact(db,names,mode,isAllowed,work,onCommit=()=>{}){
 allowed(isAllowed);
 return new Promise((resolve,reject)=>{
  let tx,problem,result;
  const fail=error=>{problem=problem||error;try{tx.abort();}catch{reject(problem);}};
  const watch=(request,receive=()=>{})=>{
   request.onsuccess=()=>{try{allowed(isAllowed);receive(request.result);}catch(error){fail(error);}};
   request.onerror=()=>fail(request.error||issue('기기 영상 저장소 작업에 실패했습니다.'));
   return request;
  };
  try{
   tx=db.transaction(names,mode);
   tx.oncomplete=()=>{
    // Ownership bookkeeping must run even if the lock changed during commit,
    // so a rejected save can remove exactly the bytes it just committed.
    try{onCommit();allowed(isAllowed);if(problem)throw problem;resolve(result);}catch(error){reject(error);}
   };
   tx.onabort=()=>reject(problem||tx.error||issue('기기 영상 작업이 중단됐습니다.','AbortError'));
   tx.onerror=()=>{problem=problem||tx.error;};
   work(tx,watch,value=>{result=value;});
  }catch(error){fail(error);}
 });
}
function getRecord(db,store,key,isAllowed){
 return transact(db,[store],'readonly',isAllowed,(tx,watch,set)=>watch(tx.objectStore(store).get(key),set));
}

// A tiny keyless reservation separates this save from an existing asset, even
// if an ID ever collides. Crashed reservations are NOT globally garbage-collected:
// another tab, undo, trash or a backup may still need an existing asset.
function reserveAsset(db,assetId,isAllowed,onCommit){
 return transact(db,['manifests','pending'],'readwrite',isAllowed,(tx,watch)=>{
  let remaining=2,exists=false;
  const found=value=>{
   exists=exists||value!==undefined;
   if(--remaining)return;
   if(exists)throw issue('영상 저장 ID가 이미 사용 중입니다. 다시 시도해주세요.','ConstraintError');
   watch(tx.objectStore('pending').add({assetId}));
  };
  for(const store of ['manifests','pending'])watch(tx.objectStore(store).getKey(assetId),found);
 },onCommit);
}
function completeAsset(db,manifest,isAllowed){
 return transact(db,STORES,'readwrite',isAllowed,(tx,watch)=>{
  let remaining=manifest.chunkCount+1;
  const exists=key=>{
   if(key===undefined)throw damaged();
   if(--remaining)return;
   watch(tx.objectStore('manifests').add(manifest));
   watch(tx.objectStore('pending').delete(manifest.assetId));
  };
  watch(tx.objectStore('pending').getKey(manifest.assetId),exists);
  for(let index=0;index<manifest.chunkCount;index++)watch(tx.objectStore('chunks').getKey([manifest.assetId,index]),exists);
 });
}
function eraseAsset(db,assetId){
 // Cleanup may finish after a lock/cancellation. It removes ciphertext only;
 // it cannot read/decrypt an asset or revive the cancelled operation.
 return transact(db,STORES,'readwrite',()=>true,(tx,watch)=>{
  watch(tx.objectStore('manifests').delete(assetId));
  watch(tx.objectStore('pending').delete(assetId));
  for(let index=0;index<MAX_CHUNKS;index++)watch(tx.objectStore('chunks').delete([assetId,index]));
 });
}
function validateManifest(manifest,assetId){
 if(!manifest||manifest.assetId!==assetId||manifest.version!==FORMAT_VERSION||manifest.complete!==true||!Number.isSafeInteger(manifest.size)||manifest.size<=0||manifest.size>MAX_DEVICE_VIDEO_BYTES||manifest.chunkSize!==DEVICE_VIDEO_CHUNK_BYTES||manifest.chunkCount!==Math.ceil(manifest.size/DEVICE_VIDEO_CHUNK_BYTES)||typeof manifest.mimeType!=='string'||!/^[\x20-\x7e]{0,255}$/.test(manifest.mimeType))throw damaged();
 return manifest;
}

export async function saveDeviceVideo(file,{isAllowed=()=>true}={}){
 allowed(isAllowed);
 const crypto=capabilities();
 if(!file||!Number.isSafeInteger(file.size)||file.size<=0||typeof file.slice!=='function')throw issue('동영상 파일이 비어 있거나 읽을 수 없습니다. 원본 영상을 다시 선택해주세요.');
 if(file.size>MAX_DEVICE_VIDEO_BYTES)throw issue('기기에 저장하는 영상은 한 파일당 256MB까지 지원합니다. 영상을 줄인 뒤 다시 선택해주세요.');
 const assetId=crypto.randomUUID();
 if(!validId(assetId))throw issue('안전한 영상 저장 ID를 만들지 못했습니다.');
 const manifest={assetId,version:FORMAT_VERSION,complete:true,size:file.size,mimeType:typeof file.type==='string'&&/^[\x20-\x7e]{0,255}$/.test(file.type)?file.type:'',chunkSize:DEVICE_VIDEO_CHUNK_BYTES,chunkCount:Math.ceil(file.size/DEVICE_VIDEO_CHUNK_BYTES)};
 let db,owned=false,rawKey,assetKey;
 try{
  allowed(isAllowed);await preflight(isAllowed);allowed(isAllowed);
  db=await openDatabase(isAllowed);allowed(isAllowed);
  rawKey=crypto.getRandomValues(new Uint8Array(32));assetKey=encodeKey(rawKey);
  allowed(isAllowed);const key=await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['encrypt']);allowed(isAllowed);
  rawKey.fill(0);rawKey=null;
  await reserveAsset(db,assetId,isAllowed,()=>{owned=true;});allowed(isAllowed);
  for(let index=0;index<manifest.chunkCount;index++){
   let plaintext;
   try{
    allowed(isAllowed);plaintext=new Uint8Array(await file.slice(index*DEVICE_VIDEO_CHUNK_BYTES,Math.min(manifest.size,(index+1)*DEVICE_VIDEO_CHUNK_BYTES)).arrayBuffer());allowed(isAllowed);
    if(plaintext.byteLength!==Math.min(DEVICE_VIDEO_CHUNK_BYTES,manifest.size-index*DEVICE_VIDEO_CHUNK_BYTES))throw issue('원본 영상의 크기가 바뀌었거나 읽을 수 없습니다. 다시 선택해주세요.');
    const iv=crypto.getRandomValues(new Uint8Array(12));
    allowed(isAllowed);const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(manifest,index),tagLength:128},key,plaintext);allowed(isAllowed);
    plaintext.fill(0);plaintext=null;
    await transact(db,['chunks'],'readwrite',isAllowed,(tx,watch)=>watch(tx.objectStore('chunks').add({assetId,index,iv,ciphertext})));allowed(isAllowed);
   }finally{plaintext?.fill(0);}
  }
  await completeAsset(db,manifest,isAllowed);allowed(isAllowed);
  return {assetId,assetKey};
 }catch(error){
  if(db&&owned){
   try{await eraseAsset(db,assetId);}catch(cleanupError){
    // Never hide an uncertain cleanup, and never erase unrelated assets.
    const failure=storageError(error);
    throw issue(`${failure?.message||'영상을 저장하지 못했습니다.'} 미완료 영상의 정리도 완료하지 못했습니다.`,failure?.name||'Error',{error,cleanupError});
   }
  }
  throw storageError(error);
 }finally{rawKey?.fill(0);assetKey=undefined;db?.close();}
}

export async function readDeviceVideo(videoObject,{isAllowed=()=>true}={}){
 allowed(isAllowed);
 // Old local-video placeholders have neither value and still ask to reselect.
 const assetId=videoObject?.assetId,assetKey=videoObject?.assetKey;
 if(assetId===undefined&&assetKey===undefined)return null;
 if(!validId(assetId))throw damaged();
 const crypto=capabilities(),rawKey=decodeKey(assetKey),parts=[];
 let db,plaintext;
 try{
  db=await openDatabase(isAllowed);allowed(isAllowed);
  const stored=await getRecord(db,'manifests',assetId,isAllowed);allowed(isAllowed);
  if(stored===undefined)return null;
  const manifest=validateManifest(stored,assetId);
  const key=await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['decrypt']);allowed(isAllowed);
  rawKey.fill(0);
  for(let index=0;index<manifest.chunkCount;index++){
   allowed(isAllowed);const chunk=await getRecord(db,'chunks',[assetId,index],isAllowed);allowed(isAllowed);
   const length=Math.min(DEVICE_VIDEO_CHUNK_BYTES,manifest.size-index*DEVICE_VIDEO_CHUNK_BYTES);
   if(!chunk||chunk.assetId!==assetId||chunk.index!==index||!(chunk.iv instanceof Uint8Array)||chunk.iv.byteLength!==12||!(chunk.ciphertext instanceof ArrayBuffer)||chunk.ciphertext.byteLength!==length+16)throw damaged();
   try{
    allowed(isAllowed);plaintext=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:chunk.iv,additionalData:aad(manifest,index),tagLength:128},key,chunk.ciphertext));allowed(isAllowed);
   }catch(error){if(error?.name==='AbortError')throw error;throw damaged(error);}
   if(plaintext.byteLength!==length)throw damaged();
   // Each Blob copies only its chunk; clear plaintext immediately rather than
   // retaining every decrypted ArrayBuffer until the entire video is ready.
   parts.push(new Blob([plaintext]));plaintext.fill(0);plaintext=null;
  }
  allowed(isAllowed);
  return new Blob(parts,{type:manifest.mimeType});
 }catch(error){throw storageError(error);}
 finally{rawKey.fill(0);plaintext?.fill(0);parts.length=0;db?.close();}
}

// The caller must obtain confirmation before explicitly deleting local bytes.
// There is intentionally no automatic eviction when a note/object is removed.
export async function deleteDeviceVideo(videoObject){
 const assetId=videoObject?.assetId;
 if(assetId===undefined)return;
 if(!validId(assetId))throw damaged();
 if(!globalThis.indexedDB?.open)throw issue('기기 영상 저장소를 사용할 수 없습니다.','NotSupportedError');
 let db;
 try{db=await openDatabase(()=>true);await eraseAsset(db,assetId);}catch(error){throw storageError(error);}finally{db?.close();}
}

// Only an explicit, separately confirmed storage-reset action may call this.
// Active notes, trash, undo and backups can all refer to these same local bytes.
// Clearing pending reservations also prevents in-flight saves from completing.
export async function clearDeviceVideos(){
 if(!globalThis.indexedDB?.open)throw issue('기기 영상 저장소를 사용할 수 없습니다.','NotSupportedError');
 let db;
 try{
  db=await openDatabase(()=>true);
  await transact(db,STORES,'readwrite',()=>true,(tx,watch)=>{
   for(const name of STORES)watch(tx.objectStore(name).clear());
  });
 }catch(error){throw storageError(error);}finally{db?.close();}
}


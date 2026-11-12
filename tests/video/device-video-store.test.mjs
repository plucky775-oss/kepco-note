import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {getDeviceVideoInfo,listDeviceVideoStorage,deleteUnreferencedDeviceVideo,saveDeviceVideo,readDeviceVideo,deleteDeviceVideo,clearDeviceVideos,DEVICE_VIDEO_CHUNK_BYTES,MAX_DEVICE_VIDEO_BYTES} from '../../update-source/src/device-video-store.js';

// Small dependency-free IndexedDB fake: asynchronous requests, copy-on-commit
// transactions, automatic rollback, serialized writers, and injectable faults.
function fakeDatabase(hooks={}){
 const stores=new Map(),keyPaths=new Map(),state={opens:0,closes:0,transactions:0,trace:[]};
 let version=0,tail=Promise.resolve();
 const keyString=key=>JSON.stringify(key);
 const rows=name=>stores.get(name);
 const keyOf=(name,value)=>Array.isArray(keyPaths.get(name))?keyPaths.get(name).map(k=>value[k]):value[keyPaths.get(name)];
 function transaction(names,mode){
  state.transactions++;
  let release,working,aborted=false,finished=false,scheduled=false;
  const previous=tail;tail=new Promise(resolve=>{release=resolve;});
  const queue=[];
  const tx={error:null,abort(){
   if(finished)throw new DOMException('Finished','InvalidStateError');
   if(aborted)return;aborted=true;
   queueMicrotask(()=>{finished=true;tx.onabort?.();release();});
  },objectStore(name){
   assert.ok(names.includes(name));
   function request(operation,key,value){
    const r={},copied=value===undefined?undefined:structuredClone(value);
    queue.push(()=>{
     const event={name,mode,operation,key,value:copied,tx,state};
     state.trace.push({name,mode,operation,key});
     try{
      hooks.beforeRequest?.(event);
      const store=working.get(name),serialized=keyString(key);
      if(operation==='add'){
       if(store.has(serialized))throw new DOMException('Duplicate','ConstraintError');
       store.set(serialized,copied);r.result=structuredClone(key);
      }else if(operation==='delete'){store.delete(serialized);r.result=undefined;}
      else if(operation==='clear'){store.clear();r.result=undefined;}
      else if(operation==='get')r.result=structuredClone(store.get(serialized));
      else if(operation==='getAll')r.result=structuredClone([...store.values()]);
      else if(operation==='count')r.result=store.size;
      else if(operation==='getKey')r.result=store.has(serialized)?structuredClone(key):undefined;
      hooks.afterRequest?.({...event,result:r.result});
      r.onsuccess?.();
     }catch(error){r.error=error;tx.error=error;r.onerror?.();tx.onerror?.();if(!aborted)tx.abort();}
    });
    return r;
   }
   return {getAll:()=>request('getAll'),count:()=>request('count'),get:key=>request('get',key),getKey:key=>request('getKey',key),add:value=>request('add',keyOf(name,value),value),delete:key=>request('delete',key),clear:()=>request('clear')};
  }};
  function pump(){
   if(aborted||finished)return;
   const action=queue.shift();
   if(action){action();queueMicrotask(pump);return;}
   hooks.beforeCommit?.({names,mode,tx,state});
   if(aborted)return;
   if(mode==='readwrite')for(const name of names)stores.set(name,working.get(name));
   finished=true;hooks.afterCommit?.({names,mode,tx,state});tx.oncomplete?.();release();
  }
  previous.then(()=>{if(aborted)return;working=new Map(names.map(name=>[name,new Map(stores.get(name))]));if(!scheduled){scheduled=true;queueMicrotask(pump);}});
  return tx;
 }
 const indexedDB={open(name,nextVersion){
  state.opens++;assert.equal(name,'nib-device-videos');assert.equal(nextVersion,1);
  const request={};let closed=false;
  const database={objectStoreNames:{contains:name=>stores.has(name)},createObjectStore(name,{keyPath}){stores.set(name,new Map());keyPaths.set(name,keyPath);},close(){if(!closed){closed=true;state.closes++;}},transaction(names,mode){if(closed)throw new DOMException('Closed','InvalidStateError');return transaction(names,mode);}};
  queueMicrotask(()=>{
   request.result=database;
   if(hooks.openError){request.error=hooks.openError;request.onerror?.();return;}
   if(nextVersion>version){let aborted=false;request.transaction={abort(){aborted=true;}};request.onupgradeneeded?.();if(aborted){request.error=new DOMException('Aborted','AbortError');request.onerror?.();return;}version=nextVersion;}
   hooks.onOpen?.();request.onsuccess?.();
  });
  return request;
 }};
 return {indexedDB,state,rows,get:(name,key)=>rows(name)?.get(keyString(key)),set:(name,key,value)=>rows(name).set(keyString(key),structuredClone(value)),remove:(name,key)=>rows(name).delete(keyString(key))};
}
async function harness(run,hooks={}){
 const fake=fakeDatabase(hooks),descriptors=new Map(['crypto','indexedDB','navigator','fetch'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const crypto={getRandomValues:array=>webcrypto.getRandomValues(array),randomUUID:()=>hooks.randomUUID?.()||webcrypto.randomUUID(),subtle:{}};
 for(const method of ['importKey','encrypt','decrypt'])crypto.subtle[method]=async(...args)=>{
  const result=await webcrypto.subtle[method](...args);await hooks.afterCrypto?.(method,result,args);return result;
 };
 const state={estimates:0,persistRequests:0,networkRequests:0};
 const navigator={storage:{async estimate(){state.estimates++;if(hooks.estimate) return hooks.estimate();return {usage:0,quota:2**30};},persist(){state.persistRequests++;throw Error('Must not ask for persistent permission');}}};
 for(const [name,value]of Object.entries({crypto,indexedDB:fake.indexedDB,navigator,fetch(){state.networkRequests++;throw Error('No server access allowed');}}))Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
 try{await run({...fake,crypto,hooks,state:{...fake.state},metrics:state});}
 finally{for(const [name,descriptor]of descriptors)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
}
const file=(data='private video bytes',type='video/mp4')=>new File([data],'private-filename.mp4',{type,lastModified:123});
const abort=error=>error?.name==='AbortError';
const allEmpty=h=>{for(const name of ['chunks','manifests','pending'])assert.equal(h.rows(name)?.size||0,0,`${name} must be empty`);};

test('encrypted multichunk round trip stores no plaintext, filename or key and never contacts a server',async()=>{
 await harness(async h=>{
  const bytes=new Uint8Array(DEVICE_VIDEO_CHUNK_BYTES+39).fill(117);bytes.set(new TextEncoder().encode('private video sample'));
  const saved=await saveDeviceVideo(file(bytes));
  assert.deepEqual(Object.keys(saved),['assetId','assetKey']);
  assert.match(saved.assetId,/^[a-f0-9-]{36}$/);assert.match(saved.assetKey,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(saved.assetKey,'base64url').length,32);
  const manifest=h.get('manifests',saved.assetId),chunks=[...h.rows('chunks').values()];
  assert.equal(manifest.complete,true);assert.equal(manifest.chunkCount,2);assert.equal(manifest.size,bytes.length);assert.equal(manifest.mimeType,'video/mp4');
  assert.deepEqual(Object.keys(manifest).sort(),['assetId','chunkCount','chunkSize','complete','mimeType','size','version']);
  assert.equal(h.rows('pending').size,0);assert.equal(chunks.length,2);
  for(const [index,chunk]of chunks.entries()){
   assert.deepEqual(Object.keys(chunk).sort(),['assetId','ciphertext','index','iv']);
   assert.equal(chunk.index,index);assert.equal(chunk.iv.length,12);
   assert.equal(chunk.ciphertext.byteLength,(index?39:DEVICE_VIDEO_CHUNK_BYTES)+16);
   assert.equal(Buffer.from(chunk.ciphertext).includes('private video sample'),false);
  }
  assert.notDeepEqual(chunks[0].iv,chunks[1].iv);
  const restored=await readDeviceVideo(saved);assert.equal(restored.type,'video/mp4');assert.equal(restored.size,bytes.length);
  assert.deepEqual(new Uint8Array(await restored.arrayBuffer()),bytes);
  assert.deepEqual(h.metrics,{estimates:1,persistRequests:0,networkRequests:0});
 });
});

test('fresh keys and IDs for identical files, durable reopen, and targeted idempotent deletion',async()=>{
 await harness(async h=>{
  const a=await saveDeviceVideo(file()),b=await saveDeviceVideo(file());
  assert.notEqual(a.assetId,b.assetId);assert.notEqual(a.assetKey,b.assetKey);
  assert.notDeepEqual(h.get('chunks',[a.assetId,0]).ciphertext,h.get('chunks',[b.assetId,0]).ciphertext);
  // A new module instance has no in-memory byte/key cache to rely on.
  const reopened=await import('../../update-source/src/device-video-store.js?reopen');
  assert.equal(await (await reopened.readDeviceVideo(a)).text(),'private video bytes');
  await deleteDeviceVideo(a);await deleteDeviceVideo(a);await deleteDeviceVideo({provider:'local'});
  assert.equal(await readDeviceVideo(a),null);assert.equal(await (await readDeviceVideo(b)).text(),'private video bytes');
  assert.equal(h.rows('chunks').size,1);assert.equal(h.rows('manifests').size,1);
 });
});

test('legacy placeholders and missing manifests return null, but missing chunks never silently disappear',async()=>{
 await harness(async h=>{
  assert.equal(await readDeviceVideo({provider:'local',fileName:'old.mp4'}),null);
  const saved=await saveDeviceVideo(file());
  h.remove('chunks',[saved.assetId,0]);await assert.rejects(readDeviceVideo(saved),/손상|일부/);
  h.remove('manifests',saved.assetId);assert.equal(await readDeviceVideo(saved),null);
 });
});

test('wrong/noncanonical keys, corrupted ciphertext and IVs fail authentication explicitly',async()=>{
 await harness(async h=>{
  const saved=await saveDeviceVideo(file()),original=structuredClone(h.get('chunks',[saved.assetId,0]));
  const replacement=Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  await assert.rejects(readDeviceVideo({...saved,assetKey:replacement}),/손상/);
  for(const assetKey of ['',saved.assetKey+'=',saved.assetKey.slice(0,-1)+'!',saved.assetKey.slice(0,-1)+'B'])await assert.rejects(readDeviceVideo({...saved,assetKey}),/손상/);
  for(const mutate of [c=>{new Uint8Array(c.ciphertext)[0]^=1;},c=>{c.iv[0]^=1;},c=>{c.iv=new Uint8Array(11);},c=>{c.ciphertext=c.ciphertext.slice(1);},c=>{c.index=1;}]){
   const changed=structuredClone(original);mutate(changed);h.set('chunks',[saved.assetId,0],changed);
   await assert.rejects(readDeviceVideo(saved),/손상/);
  }
 });
});

test('AAD binds asset ID, chunk index, MIME, version, size and total chunk count',async()=>{
 await harness(async h=>{
  const a=await saveDeviceVideo(file()),b=await saveDeviceVideo(file()),manifest=structuredClone(h.get('manifests',a.assetId));
  // Same key and relabelled ciphertext under another asset ID must not decrypt.
  const chunk=structuredClone(h.get('chunks',[a.assetId,0]));chunk.assetId=b.assetId;h.set('chunks',[b.assetId,0],chunk);
  await assert.rejects(readDeviceVideo({...b,assetKey:a.assetKey}),/손상/);
  for(const patch of [{mimeType:'video/webm'},{version:2},{size:manifest.size-1},{chunkCount:0},{complete:false},{chunkSize:1}]){
   h.set('manifests',a.assetId,{...manifest,...patch});await assert.rejects(readDeviceVideo(a),/손상/);
  }
  h.set('manifests',a.assetId,manifest);
  const multi=await saveDeviceVideo(file(new Uint8Array(DEVICE_VIDEO_CHUNK_BYTES*2)));
  const m=structuredClone(h.get('manifests',multi.assetId));
  const first=structuredClone(h.get('chunks',[multi.assetId,0])),second=structuredClone(h.get('chunks',[multi.assetId,1]));
  h.set('chunks',[multi.assetId,0],{...second,index:0});h.set('chunks',[multi.assetId,1],{...first,index:1});
  await assert.rejects(readDeviceVideo(multi),/손상/);
  // Truncate a valid two-chunk manifest to one. Size/length checks alone would
  // accept its first full chunk; authenticated total size/count must reject it.
  h.set('chunks',[multi.assetId,0],first);h.set('manifests',multi.assetId,{...m,size:DEVICE_VIDEO_CHUNK_BYTES,chunkCount:1});
  await assert.rejects(readDeviceVideo(multi),/손상/);
 });
});

test('manifest is invisible until all chunks commit and does not appear for an unfinished save',async()=>{
 let manifestSeen=false;
 await harness(async h=>{
  h.hooks.afterCommit=({names,mode})=>{
   if(mode!=='readwrite')return;
   if(names.length===1&&names[0]==='chunks')assert.equal(h.rows('manifests').size,0);
   if(h.rows('manifests').size){manifestSeen=true;assert.equal(h.rows('chunks').size,2);assert.equal(h.rows('pending').size,0);}
  };
  await saveDeviceVideo(file(new Uint8Array(DEVICE_VIDEO_CHUNK_BYTES+1)));assert.equal(manifestSeen,true);
 });
});

test('quota failures midway and at final manifest rollback all own data, preserve unrelated assets',async()=>{
 for(const stage of ['chunk','manifest'])await harness(async h=>{
  const keep=await saveDeviceVideo(file('keep me')),before=structuredClone(h.get('chunks',[keep.assetId,0]));
  h.hooks.beforeRequest=({name,operation,value})=>{
   if(operation==='add'&&(stage==='chunk'&&name==='chunks'&&value.index===1||stage==='manifest'&&name==='manifests'))throw new DOMException('Disk full','QuotaExceededError');
  };
  await assert.rejects(saveDeviceVideo(file(new Uint8Array(DEVICE_VIDEO_CHUNK_BYTES+1))),error=>error.name==='QuotaExceededError'&&/저장 공간이 부족/.test(error.message));
  assert.equal(h.rows('chunks').size,1);assert.equal(h.rows('manifests').size,1);assert.equal(h.rows('pending').size,0);
  assert.deepEqual(h.get('chunks',[keep.assetId,0]),before);assert.equal(await (await readDeviceVideo(keep)).text(),'keep me');
 });
});

test('advisory quota estimates can fail or underestimate; no persistence permission is requested',async()=>{
 for(const estimate of [async()=>{throw Error('unavailable');},async()=>({usage:100,quota:100})])await harness(async h=>{
  const saved=await saveDeviceVideo(file());assert.ok(await readDeviceVideo(saved));
  assert.equal(h.metrics.estimates,1);assert.equal(h.metrics.persistRequests,0);
 },{estimate});
});

test('empty/oversized files, unavailable storage or Web Crypto fail closed without fallback',async()=>{
 await harness(async h=>{
  assert.equal(MAX_DEVICE_VIDEO_BYTES,256*1024*1024);
  for(const input of [null,file(''),{size:1.2,slice(){}},{size:-1,slice(){}}])await assert.rejects(saveDeviceVideo(input),/파일/);
  await assert.rejects(saveDeviceVideo({size:MAX_DEVICE_VIDEO_BYTES+1,slice(){assert.fail('must not read huge file');}}),/256MB/);
  assert.equal(h.rows('chunks'),undefined);
  const saved=await saveDeviceVideo(file());
  globalThis.crypto=undefined;await assert.rejects(saveDeviceVideo(file()),/안전하게/);await assert.rejects(readDeviceVideo(saved),/안전하게/);
  globalThis.crypto=h.crypto;globalThis.indexedDB=undefined;await assert.rejects(saveDeviceVideo(file()),/저장소/);await assert.rejects(readDeviceVideo(saved),/저장소/);
  assert.equal(h.metrics.networkRequests,0);
 });
});

test('storage access errors are explicit, never a pretend in-memory success',async()=>{
 await harness(async()=>{await assert.rejects(saveDeviceVideo(file()),/저장소에 접근/);},{openError:new DOMException('Denied','SecurityError')});
});

test('cancellation before work and after estimate or database open never starts a save',async()=>{
 for(const stage of ['initial','estimate','open'])await harness(async h=>{
  let active=stage!=='initial';
  if(stage==='estimate')h.hooks.estimate=async()=>{active=false;return {};};
  if(stage==='open')h.hooks.onOpen=()=>{active=false;};
  await assert.rejects(saveDeviceVideo(file(),{isAllowed:()=>active}),abort);allEmpty(h);
 });
});

test('save guards key import, file reads, crypto completion, reservation/chunk/manifest commits and cleans up',async()=>{
 for(const stage of ['importKey','file','encrypt','reserve','chunk','manifest'])await harness(async h=>{
  let active=true;
  if(['importKey','encrypt'].includes(stage))h.hooks.afterCrypto=method=>{if(method===stage)active=false;};
  if(['reserve','chunk','manifest'].includes(stage))h.hooks.afterCommit=({names,mode})=>{
   if(mode==='readwrite'&&(stage==='reserve'&&names.length===2||stage==='chunk'&&names.length===1||stage==='manifest'&&names.length===3&&h.rows('manifests').size))active=false;
  };
  const input=stage==='file'?{size:2,type:'video/mp4',slice(){return {async arrayBuffer(){active=false;return new Uint8Array([1,2]).buffer;}};}}:file();
  await assert.rejects(saveDeviceVideo(input,{isAllowed:()=>active}),abort);allEmpty(h);
 });
});

test('a lock while a chunk request is pending aborts its transaction before commit',async()=>{
 await harness(async h=>{
  let active=true;
  h.hooks.afterRequest=({name,operation})=>{if(name==='chunks'&&operation==='add')active=false;};
  await assert.rejects(saveDeviceVideo(file(),{isAllowed:()=>active}),abort);allEmpty(h);
 });
});

test('read guards open, manifest/chunk requests and key/decryption completions without deleting stored bytes',async()=>{
 for(const stage of ['initial','open','manifest','chunk','importKey','decrypt'])await harness(async h=>{
  const saved=await saveDeviceVideo(file());let active=stage!=='initial';
  if(stage==='open')h.hooks.onOpen=()=>{active=false;};
  if(['manifest','chunk'].includes(stage))h.hooks.afterRequest=({name,operation})=>{if(operation==='get'&&name===(stage==='manifest'?'manifests':'chunks'))active=false;};
  if(['importKey','decrypt'].includes(stage))h.hooks.afterCrypto=method=>{if(method===stage)active=false;};
  await assert.rejects(readDeviceVideo(saved,{isAllowed:()=>active}),abort);
  assert.equal(h.rows('manifests').size,1);assert.equal(h.rows('chunks').size,1);
 });
});

test('read snapshots metadata before awaiting and malformed references cannot erase other assets',async()=>{
 await harness(async h=>{
  const a=await saveDeviceVideo(file('A')),b=await saveDeviceVideo(file('B')),mutable={...a};
  const pending=readDeviceVideo(mutable);Object.assign(mutable,b);
  assert.equal(await (await pending).text(),'A');
  for(const assetId of ['',{},'*',a.assetId+'/',a.assetId+'\u0000'])await assert.rejects(deleteDeviceVideo({assetId}),/손상/);
  assert.equal(h.rows('manifests').size,2);
 });
});

test('an ID collision or unrelated unfinished asset is never automatically erased',async()=>{
 await harness(async h=>{
  const saved=await saveDeviceVideo(file('existing'));
  h.hooks.randomUUID=()=>saved.assetId;await assert.rejects(saveDeviceVideo(file('collision')),/이미 사용/);
  assert.equal(await (await readDeviceVideo(saved)).text(),'existing');
  const orphanId=webcrypto.randomUUID();h.set('pending',orphanId,{assetId:orphanId});h.set('chunks',[orphanId,0],{assetId:orphanId,index:0,iv:new Uint8Array(12),ciphertext:new ArrayBuffer(17)});
  h.hooks.randomUUID=()=>orphanId;await assert.rejects(saveDeviceVideo(file('collision')),/이미 사용/);
  delete h.hooks.randomUUID;
  await saveDeviceVideo(file('new'));assert.ok(h.get('pending',orphanId));assert.ok(h.get('chunks',[orphanId,0]));
  await deleteDeviceVideo({assetId:orphanId});assert.equal(h.get('pending',orphanId),undefined);assert.equal(h.get('chunks',[orphanId,0]),undefined);
  assert.ok(await readDeviceVideo(saved));
 });
});

test('file-read/encryption failure removes incomplete data and cleanup failures are not hidden',async()=>{
 for(const stage of ['file','crypto','cleanup'])await harness(async h=>{
  const input={size:DEVICE_VIDEO_CHUNK_BYTES+1,type:'video/mp4',slice(start,end){return {async arrayBuffer(){if(start)throw Error('file read failed');return new Uint8Array(end-start).buffer;}};}};
  if(stage==='crypto')h.crypto.subtle.encrypt=async()=>{throw Error('encryption failed');};
  if(stage==='cleanup')h.hooks.beforeRequest=({operation})=>{if(operation==='delete')throw Error('cleanup failed');};
  await assert.rejects(saveDeviceVideo(input),stage==='cleanup'?/정리도 완료하지 못했습니다/:/file read failed|encryption failed/);
  if(stage!=='cleanup')allEmpty(h);else assert.equal(h.rows('manifests').size,0);
 });
});

test('explicit clearing removes complete and crashed saves together and is idempotent',async()=>{
 await harness(async h=>{
  const a=await saveDeviceVideo(file('A')),b=await saveDeviceVideo(file('B'));
  const orphanId=webcrypto.randomUUID();h.set('pending',orphanId,{assetId:orphanId});h.set('chunks',[orphanId,0],{assetId:orphanId,index:0,iv:new Uint8Array(12),ciphertext:new ArrayBuffer(17)});
  await clearDeviceVideos();allEmpty(h);assert.equal(await readDeviceVideo(a),null);assert.equal(await readDeviceVideo(b),null);
  await clearDeviceVideos();allEmpty(h);
 });
});

test('explicit clearing is atomic and rolls back every store if any clear fails',async()=>{
 await harness(async h=>{
  const saved=await saveDeviceVideo(file());
  const orphanId=webcrypto.randomUUID();h.set('pending',orphanId,{assetId:orphanId});
  h.hooks.beforeRequest=({name,operation})=>{if(name==='pending'&&operation==='clear')throw Error('clear failed');};
  await assert.rejects(clearDeviceVideos(),/clear failed/);
  assert.ok(h.get('pending',orphanId));assert.equal(await (await readDeviceVideo(saved)).text(),'private video bytes');
 });
});

test('clearing during an in-flight save prevents it from completing or resurrecting an asset',async()=>{
 await harness(async h=>{
  let cleared=false;
  h.hooks.afterCrypto=async method=>{if(method==='encrypt'&&!cleared){cleared=true;await clearDeviceVideos();}};
  await assert.rejects(saveDeviceVideo(file()),/손상|일부/);allEmpty(h);
 });
});

test('no network upload, database deletion, implicit clearing or storage permission requests',async()=>{
 const source=await readFile(new URL('../../update-source/src/device-video-store.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|deleteDatabase\s*\(/);
 const beforeClear=source.slice(0,source.indexOf('export async function clearDeviceVideos'));
 assert.doesNotMatch(beforeClear,/\.clear\s*\(|clearDeviceVideos\s*\(/);
 assert.doesNotMatch(source.replace(/\/\/[^\n]*/g,''),/\.persist\s*\(/);
});


test('metadata preflight and storage inventory never read chunks or decrypt',()=>harness(async fake=>{
 const ref=await saveDeviceVideo(new Blob(['video'],{type:'video/mp4'}));fake.state.trace.length=0;
 assert.deepEqual(await getDeviceVideoInfo(ref),{size:5,mimeType:'video/mp4'});
 const inventory=await listDeviceVideoStorage();assert.equal(inventory.assets.length,1);assert.equal(inventory.assets[0].size,5);assert.equal(inventory.pendingCount,0);
 assert.ok(fake.state.trace.every(event=>event.name!=='chunks'));
 await assert.rejects(readDeviceVideo(ref,{maxBytes:4}),/한도/);
 assert.ok(fake.state.trace.every(event=>event.name!=='chunks'));
}));
test('explicit orphan removal is guarded and preserves another asset',()=>harness(async fake=>{
 const a=await saveDeviceVideo(new Blob(['first'])),b=await saveDeviceVideo(new Blob(['second']));
 const asset=(await listDeviceVideoStorage()).assets.find(x=>x.assetId===a.assetId);
 await assert.rejects(deleteUnreferencedDeviceVideo(asset),{name:'AbortError'});
 assert.ok(await getDeviceVideoInfo(a));
 await deleteUnreferencedDeviceVideo(asset,{isAllowed:()=>true});
 assert.equal(await getDeviceVideoInfo(a),null);assert.equal((await readDeviceVideo(b)).size,6);
}));
test('reference change during orphan removal aborts transaction',async()=>{
 let allow=true,armed=false;
 await harness(async fake=>{
  const ref=await saveDeviceVideo(new Blob(['kept']));
  const asset=(await listDeviceVideoStorage()).assets[0];armed=true;
  await assert.rejects(deleteUnreferencedDeviceVideo(asset,{isAllowed:()=>allow}),{name:'AbortError'});
  allow=true;armed=false;assert.equal((await readDeviceVideo(ref)).size,4);
 },{afterRequest:({operation,name})=>{if(armed&&operation==='delete'&&name==='manifests')allow=false;}});
});

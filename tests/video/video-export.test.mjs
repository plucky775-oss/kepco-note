import test from 'node:test';
import assert from 'node:assert/strict';
import {selectVideoRange,videoExportMime,videoPageSeconds,containVideoRect,composeVideoPages,VIDEO_EXPORT_LIMITS} from '../../update-source/src/video-export.js';
const page=id=>({id,videoObjects:[{id:'v',provider:'local',bounds:{x:0,y:0,width:480,height:270}}]});
test('range preserves source order and includes still pages',()=>{const pages=[page('a'),{id:'b'},page('c')];assert.deepEqual(selectVideoRange(pages,1,3).map(p=>p.id),['a','b','c']);assert.deepEqual(selectVideoRange(pages,3,3),[pages[2]]);});
test('invalid, oversized, locked and remote-only ranges fail closed',()=>{for(const [start,end]of [[0,1],[2,1],[1,4],[1.1,2],[NaN,2]])assert.throws(()=>selectVideoRange([page('a'),page('b')],start,end));assert.throws(()=>selectVideoRange(Array.from({length:31},(_,i)=>page(i)),1,31),/30페이지/);assert.throws(()=>selectVideoRange([{...page('a'),_locked:{}}],1,1),/잠긴/);assert.throws(()=>selectVideoRange([{videoObjects:[{provider:'youtube'},{provider:'x'}]}],1,1),/기기 영상/);});
test('MIME prefers supported MP4 and falls back honestly to WebM',()=>{assert.equal(videoExportMime({isTypeSupported:t=>t==='video/mp4'}),'video/mp4');assert.equal(videoExportMime({isTypeSupported:t=>t==='video/webm'}),'video/webm');assert.throws(()=>videoExportMime({}),/지원하지/);assert.throws(()=>videoExportMime({isTypeSupported:()=>false}),/형식/);});
test('page duration sums sequential local sources and preserves configurable still time',()=>{assert.equal(videoPageSeconds([4,2,8]),14);assert.equal(videoPageSeconds([],5),5);for(const duration of [0,-1,NaN,Infinity])assert.throws(()=>videoPageSeconds([duration]));for(const time of [0,31,Infinity])assert.throws(()=>videoPageSeconds([],time));});
test('video retains aspect ratio and letterbox placement',()=>{assert.deepEqual(containVideoRect({x:10,y:20,width:480,height:270},1920,1080),{x:10,y:20,width:480,height:270});assert.deepEqual(containVideoRect({x:10,y:20,width:480,height:270},100,100),{x:115,y:20,width:270,height:270});});
test('composition rejects invalid inputs and prior cancellation before DOM access',async()=>{await assert.rejects(composeVideoPages([]));await assert.rejects(composeVideoPages([{...page('a'),_locked:{}}]),/다시 선택/);await assert.rejects(composeVideoPages([{id:'a'}]),/기기 영상/);const signal=AbortSignal.abort(new DOMException('stop','AbortError'));await assert.rejects(composeVideoPages([page('a')],{signal}),{name:'AbortError'});});
class FakeVideo extends EventTarget{
 constructor(){super();this.readyState=4;this.videoWidth=900;this.videoHeight=1200;this.duration=.025;this.currentTime=0;this.ended=true;}
 load(){} pause(){} removeAttribute(){} play(){this.currentTime=this.duration;return Promise.resolve();}
}
class FakeRecorder extends EventTarget{
 static isTypeSupported(t){return t==='video/mp4';}
 constructor(stream,{mimeType}){super();this.stream=stream;this.mimeType=mimeType;this.state='inactive';}
 start(){this.state='recording';}pause(){this.state='paused';}resume(){this.state='recording';}
 stop(){this.state='inactive';queueMicrotask(()=>{const event=new Event('dataavailable');event.data=new Blob(['fake-mp4']);this.dispatchEvent(event);this.dispatchEvent(new Event('stop'));});}
}
function fakeDocument(){const doc=new EventTarget();doc.hidden=false;const draws=[];let stopped=0;const track={stop(){stopped++;}};doc.createElement=tag=>tag==='video'?new FakeVideo():{width:900,height:1200,getContext:()=>({drawImage(...args){draws.push(args);},fillRect(){}}),captureStream:()=>({getTracks:()=>[track],addTrack(){}})};return {doc,draws,stopped:()=>stopped};}
test('composition draws local video over rendered notes, retains remote placeholders and returns checked output',async()=>{
 const savedRAF=globalThis.requestAnimationFrame,savedCancel=globalThis.cancelAnimationFrame;globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),10);globalThis.cancelAnimationFrame=clearTimeout;
 const {doc,draws,stopped}=fakeDocument();const input=page('a');input.videoObjects.push({provider:'youtube',id:'remote'});let renderInput,reads=0;
 try{const result=await composeVideoPages([input],{includeAudio:false,document:doc,Recorder:FakeRecorder,getMediaBlob:async()=>{reads++;return new Blob(['original']);},renderPage:async p=>{renderInput=p;return {width:900,height:1200};}});assert.equal(result.extension,'mp4');assert.equal(result.blob.size,8);assert.equal(result.duration,.025);assert.deepEqual(renderInput.videoObjects,[input.videoObjects[1]]);assert.equal(input.videoObjects.length,2);assert.equal(reads,2);assert.ok(draws.some(args=>args[0] instanceof FakeVideo));assert.equal(stopped(),1);}finally{globalThis.requestAnimationFrame=savedRAF;globalThis.cancelAnimationFrame=savedCancel;}
});
test('missing media and read denials never yield output',async()=>{const {doc}=fakeDocument();await assert.rejects(composeVideoPages([page('a')],{includeAudio:false,document:doc,Recorder:FakeRecorder,getMediaBlob:async()=>null}),/저장된 영상/);await assert.rejects(composeVideoPages([page('a')],{includeAudio:false,document:doc,Recorder:FakeRecorder,getMediaBlob:async()=>{throw Error('access denied');}}),/access denied/);});
test('resource limits are explicit and bounded',()=>{assert.equal(VIDEO_EXPORT_LIMITS.seconds,600);assert.equal(VIDEO_EXPORT_LIMITS.bytes,128*1024*1024);});
test('cancel during recording discards output and cleans tracks',async()=>{
 const savedRAF=globalThis.requestAnimationFrame,savedCancel=globalThis.cancelAnimationFrame;globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),10);globalThis.cancelAnimationFrame=clearTimeout;
 const {doc,stopped}=fakeDocument(),controller=new AbortController();
 try{await assert.rejects(composeVideoPages([page('a')],{includeAudio:false,document:doc,Recorder:FakeRecorder,signal:controller.signal,getMediaBlob:async()=>new Blob(['original']),renderPage:async()=>({width:900,height:1200}),onProgress:p=>{if(p.phase==='record')controller.abort(new DOMException('test cancel','AbortError'));}}),{name:'AbortError'});assert.equal(stopped(),1);}finally{globalThis.requestAnimationFrame=savedRAF;globalThis.cancelAnimationFrame=savedCancel;}
});
test('empty encoder output never reports completion',async()=>{
 const savedRAF=globalThis.requestAnimationFrame,savedCancel=globalThis.cancelAnimationFrame;globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),10);globalThis.cancelAnimationFrame=clearTimeout;
 class EmptyRecorder extends FakeRecorder{stop(){this.state='inactive';queueMicrotask(()=>this.dispatchEvent(new Event('stop')));}}
 const {doc}=fakeDocument();try{await assert.rejects(composeVideoPages([page('a')],{includeAudio:false,document:doc,Recorder:EmptyRecorder,getMediaBlob:async()=>new Blob(['original']),renderPage:async()=>({width:900,height:1200})}),/비어 있습니다/);}finally{globalThis.requestAnimationFrame=savedRAF;globalThis.cancelAnimationFrame=savedCancel;}
});
test('audio graph preserves each sequential source volume without requesting microphone',async()=>{
 const savedRAF=globalThis.requestAnimationFrame,savedCancel=globalThis.cancelAnimationFrame;globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),10);globalThis.cancelAnimationFrame=clearTimeout;
 let closed=0,sources=0;const gains=[];
 class FakeAudio{constructor(){this.state='suspended';}async resume(){this.state='running';}createMediaStreamDestination(){return {stream:{getAudioTracks:()=>[{stop(){}}],getTracks:()=>[{stop(){}}]}};}createMediaElementSource(){sources++;return {connect(){},disconnect(){}};}createGain(){const gain={gain:{value:1},connect(){},disconnect(){}};gains.push(gain);return gain;}async close(){this.state='closed';closed++;}}
 const {doc}=fakeDocument(),p=page('a');p.videoObjects.push({...p.videoObjects[0],id:'v2'});
 try{const result=await composeVideoPages([p],{includeAudio:true,document:doc,Recorder:FakeRecorder,Audio:FakeAudio,getMediaBlob:async()=>new Blob(['original']),renderPage:async()=>({width:900,height:1200})});assert.equal(result.extension,'mp4');assert.equal(sources,2);assert.deepEqual(gains.map(g=>g.gain.value),[1,1]);assert.equal(closed,1);}finally{globalThis.requestAnimationFrame=savedRAF;globalThis.cancelAnimationFrame=savedCancel;}
});
test('backgrounding during recording cancels and disposes media',async()=>{
 const savedRAF=globalThis.requestAnimationFrame,savedCancel=globalThis.cancelAnimationFrame;globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),10);globalThis.cancelAnimationFrame=clearTimeout;
 const {doc,stopped}=fakeDocument();
 try{await assert.rejects(composeVideoPages([page('a')],{includeAudio:false,document:doc,Recorder:FakeRecorder,getMediaBlob:async()=>new Blob(['original']),renderPage:async()=>({width:900,height:1200}),onProgress:p=>{if(p.phase==='record'){doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));}}}),/화면을 떠나/);assert.equal(stopped(),1);}finally{globalThis.requestAnimationFrame=savedRAF;globalThis.cancelAnimationFrame=savedCancel;}
});

test('sequential export follows specified order without overlapping playback or changing stacking',async()=>{
 const oldRAF=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),5);globalThis.cancelAnimationFrame=clearTimeout;
 const doc=new EventTarget(),played=[],active=new Set(),draws=[];let number=0;
 class TimedVideo extends EventTarget{constructor(){super();this.id=number++;this.readyState=4;this.videoWidth=160;this.videoHeight=120;this.duration=.04;this.saved=0;this.started=null;}
 get currentTime(){return this.started===null?this.saved:Math.min(this.duration,(performance.now()-this.started)/1000);}get ended(){return this.currentTime>=this.duration;}load(){}removeAttribute(){}pause(){this.saved=this.currentTime;this.started=null;active.delete(this.id);}play(){assert.equal(active.size,0,'previous video must stop before next starts');active.add(this.id);played.push(this.id);this.started=performance.now();return Promise.resolve();}}
 doc.hidden=false;doc.createElement=tag=>tag==='video'?new TimedVideo():{width:900,height:1200,getContext:()=>({drawImage(v){if(v instanceof TimedVideo)draws.push({id:v.id,time:v.currentTime,playing:active.has(v.id)});},fillRect(){}}),captureStream:()=>({getTracks:()=>[{stop(){}}],addTrack(){}})};
 const p=page('a');p.videoObjects.push({...p.videoObjects[0],id:'v2'});const original=structuredClone(p);
 try{const result=await composeVideoPages([p],{includeAudio:false,document:doc,Recorder:FakeRecorder,videoOrder:{a:['v2','v']},getMediaBlob:async()=>new Blob(['original']),renderPage:async()=>({width:900,height:1200})});assert.equal(result.duration,.08);assert.deepEqual(played,[3,2]);assert.equal(active.size,0);assert.deepEqual(p,original);assert.ok(draws.some(d=>d.id===2&&d.time===0&&!d.playing));assert.ok(draws.some(d=>d.id===3&&d.time===.04&&!d.playing));assert.deepEqual(draws.slice(0,2).map(d=>d.id),[2,3]);}finally{globalThis.requestAnimationFrame=oldRAF;globalThis.cancelAnimationFrame=oldCancel;}
});
test('sum of sequential durations is checked against total export limit before recording',async()=>{
 const {doc}=fakeDocument(),create=doc.createElement;doc.createElement=tag=>{const el=create(tag);if(tag==='video')el.duration=400;return el;};const p=page('a');p.videoObjects.push({...p.videoObjects[0],id:'v2'});
 await assert.rejects(composeVideoPages([p],{includeAudio:false,document:doc,Recorder:FakeRecorder,getMediaBlob:async()=>new Blob(['original'])}),/10분/);
});
test('stalled first video fails rather than starting the next source',async()=>{
 const oldRAF=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()+2000),1);globalThis.cancelAnimationFrame=clearTimeout;
 const {doc}=fakeDocument(),create=doc.createElement,played=[];let id=0;doc.createElement=tag=>{const el=create(tag);if(tag==='video'){el.id=id++;el.ended=false;el.duration=5;el.currentTime=0;el.play=async()=>played.push(el.id);}return el;};const p=page('a');p.videoObjects.push({...p.videoObjects[0],id:'v2'});
 try{await assert.rejects(composeVideoPages([p],{includeAudio:false,document:doc,Recorder:FakeRecorder,getMediaBlob:async()=>new Blob(['original']),renderPage:async()=>({width:900,height:1200})}),/지연/);assert.deepEqual(played,[2]);}finally{globalThis.requestAnimationFrame=oldRAF;globalThis.cancelAnimationFrame=oldCancel;}
});
test('sequence waits for asynchronous recorder pause/resume transitions',async()=>{
 const oldRAF=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),1);globalThis.cancelAnimationFrame=clearTimeout;
 let recorder;const transitions=[];class AsyncRecorder extends FakeRecorder{constructor(...args){super(...args);recorder=this;}pause(){setTimeout(()=>{this.state='paused';transitions.push('paused');this.dispatchEvent(new Event('pause'));},5);}resume(){setTimeout(()=>{this.state='recording';transitions.push('resumed');this.dispatchEvent(new Event('resume'));},5);}}
 const {doc}=fakeDocument(),create=doc.createElement;doc.createElement=tag=>{const element=create(tag);if(tag==='video')element.play=async()=>{assert.equal(recorder.state,'recording');transitions.push('play');element.currentTime=element.duration;};return element;};const p=page('a');p.videoObjects.push({...p.videoObjects[0],id:'v2'});
 try{const result=await composeVideoPages([p],{includeAudio:false,document:doc,Recorder:AsyncRecorder,getMediaBlob:async()=>new Blob(['original']),renderPage:async()=>({width:900,height:1200})});assert.equal(result.duration,.05);assert.deepEqual(transitions,['play','paused','resumed','play','paused']);}finally{globalThis.requestAnimationFrame=oldRAF;globalThis.cancelAnimationFrame=oldCancel;}
});

test('audible autoplay denial pauses capture and retries same source from explicit gesture',async()=>{
 const oldRAF=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),1);globalThis.cancelAnimationFrame=clearTimeout;
 const {doc}=fakeDocument(),original=doc.createElement;let allowed=false,calls=0,recorder,requests=0;
 doc.createElement=tag=>{const el=original(tag);if(tag==='video')el.play=()=>{calls++;if(!allowed)return Promise.reject(new DOMException('blocked','NotAllowedError'));el.currentTime=el.duration;return Promise.resolve();};return el;};
 class Observed extends FakeRecorder{constructor(...args){super(...args);recorder=this;}}
 try{const result=await composeVideoPages([page('a'),page('b')],{includeAudio:false,document:doc,Recorder:Observed,getMediaBlob:async()=>new Blob(['source']),renderPage:async()=>({width:900,height:1200}),onPlaybackBlocked:async({start,signal})=>{requests++;assert.equal(recorder.state,'paused');assert.equal(signal.aborted,false);allowed=true;const pending=start();assert.equal(recorder.state,'recording');await pending;allowed=false;}});assert.ok(result.blob.size);assert.equal(requests,2);assert.equal(calls,4);}finally{globalThis.requestAnimationFrame=oldRAF;globalThis.cancelAnimationFrame=oldCancel;}
});
test('autoplay denial without a gesture handler fails with actionable Korean message',async()=>{
 const {doc,stopped}=fakeDocument(),original=doc.createElement;doc.createElement=tag=>{const el=original(tag);if(tag==='video')el.play=()=>Promise.reject(new DOMException('blocked','NotAllowedError'));return el;};
 await assert.rejects(composeVideoPages([page('a')],{includeAudio:false,document:doc,Recorder:FakeRecorder,getMediaBlob:async()=>new Blob(['source']),renderPage:async()=>({width:900,height:1200})}),/자동 재생.*계속/);assert.equal(stopped(),1);
});


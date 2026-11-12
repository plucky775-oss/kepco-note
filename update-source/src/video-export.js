/** Device-only composition. No remote frame capture, network upload or microphone. */
export const VIDEO_EXPORT_LIMITS=Object.freeze({pages:30,seconds:600,bytes:128*1024*1024,width:900,height:1200,fps:24});
export function selectVideoRange(pages,start,end){
 if(!Array.isArray(pages)||!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>pages.length)throw Error('올바른 시작·끝 페이지를 선택해주세요.');
 const selected=pages.slice(start-1,end);
 if(selected.length>VIDEO_EXPORT_LIMITS.pages)throw Error('한 번에 30페이지까지 출력할 수 있습니다.');
 if(selected.some(p=>p._locked))throw Error('잠긴 노트를 먼저 열어주세요.');
 if(!selected.some(p=>p.videoObjects?.some(v=>v.provider==='local')))throw Error('선택 범위에 기기 영상이 없습니다. YouTube는 영상 출력 대상이 아닙니다.');
 return selected;
}
export function videoExportMime(Recorder=globalThis.MediaRecorder){
 if(!Recorder?.isTypeSupported)throw Error('이 브라우저는 영상 출력을 지원하지 않습니다. 최신 Safari 또는 Chrome에서 열어주세요.');
 for(const type of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm'])if(Recorder.isTypeSupported(type))return type;
 throw Error('이 브라우저에서 지원하는 영상 출력 형식을 찾지 못했습니다.');
}
export function videoPageSeconds(durations,stillSeconds=3){
 if(!Number.isFinite(stillSeconds)||stillSeconds<1||stillSeconds>30)throw Error('정지 페이지 시간은 1~30초로 설정해주세요.');
 if(durations.some(d=>!Number.isFinite(d)||d<=0))throw Error('영상 길이를 읽지 못했습니다. 기기에서 재생 가능한 파일인지 확인해주세요.');
 return durations.length?durations.reduce((sum,duration)=>sum+duration,0):stillSeconds;
}
/** Output order never mutates note data or the canvas stacking order. */
export function orderedPageVideos(page,videoOrder={}){
 const local=(page.videoObjects||[]).filter(video=>video.provider==='local');
 if(!Object.hasOwn(videoOrder,page.id))return local;
 const ids=videoOrder[page.id];
 if(!Array.isArray(ids)||ids.length!==local.length||new Set(ids).size!==ids.length||ids.some(id=>!local.some(video=>video.id===id)))throw Error('영상 목록이 바뀌었습니다. 창을 닫고 순서를 다시 지정해주세요.');
 return ids.map(id=>local.find(video=>video.id===id));
}
export function containVideoRect(bounds,width,height){
 const ratio=Math.min(bounds.width/width,bounds.height/height),w=width*ratio,h=height*ratio;
 return {x:bounds.x+(bounds.width-w)/2,y:bounds.y+(bounds.height-h)/2,width:w,height:h};
}
function aborted(signal){if(signal?.aborted)throw signal.reason||new DOMException('영상 출력을 취소했습니다.','AbortError');}
function waitEvent(target,type,{signal,timeout=20000,ready=()=>false}={}){
 aborted(signal);if(ready())return Promise.resolve();
 return new Promise((resolve,reject)=>{
 const finish=error=>{clearTimeout(timer);target.removeEventListener(type,done);target.removeEventListener('error',failed);signal?.removeEventListener('abort',cancel);error?reject(error):resolve();};
 const done=()=>finish(),failed=()=>finish(Error('영상 파일을 읽거나 재생하지 못했습니다. MP4(H.264) 등 지원 형식인지 확인해주세요.')),cancel=()=>finish(signal.reason||new DOMException('취소','AbortError'));
 const timer=setTimeout(()=>finish(Error('영상 준비 시간이 초과되었습니다. 파일을 확인해주세요.')),timeout);
 target.addEventListener(type,done,{once:true});target.addEventListener('error',failed,{once:true});signal?.addEventListener('abort',cancel,{once:true});
 });
}
function playVideos(entries,signal){
 aborted(signal);
 return new Promise((resolve,reject)=>{
 const finish=error=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);error?reject(error):resolve();};
 const cancel=()=>finish(signal.reason||new DOMException('취소','AbortError'));
 const timer=setTimeout(()=>finish(Error('영상 재생을 시작하지 못했습니다. 출력 버튼을 다시 눌러주세요.')),20000);
 signal.addEventListener('abort',cancel,{once:true});
 try{Promise.all(entries.map(entry=>entry.video.play())).then(()=>finish(),finish);}catch(error){finish(error);}
 });
}
function releaseVideo(entry){try{entry.video.pause();entry.video.removeAttribute('src');entry.video.load();entry.source?.disconnect();entry.gain?.disconnect();}catch{}URL.revokeObjectURL(entry.url);}
async function loadVideo(object,page,{getMediaBlob,signal,doc}){
 aborted(signal);const blob=await getMediaBlob(object,page,{signal});aborted(signal);
 if(!(blob instanceof Blob)||!blob.size)throw Error('기기에 저장된 영상이 없습니다. 원본 영상을 다시 넣어주세요.');
 const video=doc.createElement('video'),url=URL.createObjectURL(blob),entry={video,url,object,bytes:blob.size};
 try{video.playsInline=true;video.preload='auto';video.src=url;video.load();await waitEvent(video,'loadeddata',{signal,ready:()=>video.readyState>=2});
 if(!video.videoWidth||!video.videoHeight||!Number.isFinite(video.duration)||video.duration<=0)throw Error('이 영상의 화면 또는 길이를 읽지 못했습니다.');return entry;
 }catch(error){releaseVideo(entry);throw error;}
}
/** Call from a user click: the AudioContext is created/resumed before the first await. */
export async function composeVideoPages(pages,{renderPage,getMediaBlob,includeAudio=true,stillSeconds=3,videoOrder={},signal,onProgress=()=>{},onPlaybackBlocked,document:doc=globalThis.document,Recorder=globalThis.MediaRecorder,Audio=globalThis.AudioContext||globalThis.webkitAudioContext,audioContext}={}){
 if(!Array.isArray(pages)||!pages.length||pages.length>VIDEO_EXPORT_LIMITS.pages||pages.some(p=>p._locked))throw Error('출력할 페이지를 다시 선택해주세요.');
 if(!pages.some(p=>p.videoObjects?.some(v=>v.provider==='local')))throw Error('출력할 기기 영상이 없습니다.');
 videoPageSeconds([],stillSeconds);for(const page of pages)orderedPageVideos(page,videoOrder);aborted(signal);
 const mimeType=videoExportMime(Recorder),canvas=doc.createElement('canvas');canvas.width=900;canvas.height=1200;
 const ctx=canvas.getContext('2d');if(!ctx||!canvas.captureStream)throw Error('이 브라우저에서는 페이지 영상 합성을 지원하지 않습니다.');
 let audio,stream,recorder,entries=[],base=null,frame=0,totalBytes=0,outputBytes=0,elapsed=0,recordingError=null,complete=false;
 const chunks=[],timings=[];let destination;
 const ownAbort=new AbortController(),cancel=()=>ownAbort.abort(signal?.reason||new DOMException('취소','AbortError'));
 signal?.addEventListener('abort',cancel,{once:true});const workSignal=ownAbort.signal;
 const onHidden=()=>{if(doc.hidden)ownAbort.abort(new DOMException('화면을 떠나 영상 출력이 중단되었습니다. 앱을 연 상태로 다시 시작해주세요.','AbortError'));};
 doc.addEventListener('visibilitychange',onHidden);
 try{
 if(includeAudio){if(!Audio)throw Error('이 브라우저에서는 소리 합성을 지원하지 않습니다. 소리 포함을 해제해주세요.');audio=audioContext||new Audio();await audio.resume();if(audio.state!=='running')throw Error('소리를 시작하지 못했습니다. 출력 버튼을 다시 눌러주세요.');destination=audio.createMediaStreamDestination();}
 aborted(workSignal);
 // Preflight every file sequentially. Do not retain a whole notebook of decoders.
 for(let i=0;i<pages.length;i++){
 const durations=[];onProgress({phase:'prepare',page:i+1,pages:pages.length});
 for(const object of pages[i].videoObjects||[])if(object.provider==='local'){
 const entry=await loadVideo(object,pages[i],{getMediaBlob,signal:workSignal,doc});try{totalBytes+=entry.bytes;durations.push(entry.video.duration);if(totalBytes>VIDEO_EXPORT_LIMITS.bytes)throw Error('선택한 영상이 128MB를 넘습니다. 페이지 범위를 나누어 출력해주세요.');}finally{releaseVideo(entry);}
 }
 timings.push(videoPageSeconds(durations,stillSeconds));
 if(timings.reduce((a,b)=>a+b,0)>VIDEO_EXPORT_LIMITS.seconds)throw Error('총 출력 시간이 10분을 넘습니다. 페이지 범위를 나누어주세요.');
 }
 const total=timings.reduce((a,b)=>a+b,0);
 stream=canvas.captureStream(VIDEO_EXPORT_LIMITS.fps);if(destination)for(const track of destination.stream.getAudioTracks())stream.addTrack(track);
 recorder=new Recorder(stream,{mimeType,videoBitsPerSecond:2500000,audioBitsPerSecond:128000});
 recorder.addEventListener('error',event=>{recordingError=event.error||Error('영상 인코딩에 실패했습니다.');ownAbort.abort(recordingError);});
 recorder.addEventListener('dataavailable',event=>{if(event.data?.size){outputBytes+=event.data.size;if(outputBytes>VIDEO_EXPORT_LIMITS.bytes){recordingError=Error('출력 파일이 128MB를 넘었습니다. 범위를 줄여주세요.');ownAbort.abort(recordingError);}else chunks.push(event.data);}});
 for(let i=0;i<pages.length;i++){
 aborted(workSignal);const page=pages[i];
 // Remote providers remain static labeled placeholders; never attempt to read an iframe.
 base=await renderPage({...page,videoObjects:(page.videoObjects||[]).filter(v=>v.provider!=='local')},{scale:1,signal:workSignal});aborted(workSignal);
 for(const object of page.videoObjects||[])if(object.provider==='local'){
 const entry=await loadVideo(object,page,{getMediaBlob,signal:workSignal,doc});entries.push(entry);
 if(audio){entry.source=audio.createMediaElementSource(entry.video);entry.gain=audio.createGain();entry.gain.gain.value=1;entry.source.connect(entry.gain);entry.gain.connect(destination);}else entry.video.muted=true;
 }
 const draw=()=>{ctx.drawImage(base,0,0,900,1200);for(const {video,object}of entries){const b=object.bounds,r=containVideoRect(b,video.videoWidth,video.videoHeight);ctx.fillStyle='#000';ctx.fillRect(b.x,b.y,b.width,b.height);ctx.drawImage(video,r.x,r.y,r.width,r.height);}};
 // Pending videos hold their first frame; ended videos hold their last frame.
 // Playback sequence is separate from drawing order to preserve stacking.
 const sequence=orderedPageVideos(page,videoOrder).map(object=>entries.find(entry=>entry.object.id===object.id));
 const segments=sequence.length?sequence:[null];let completedSeconds=0;
 for(let segmentIndex=0;segmentIndex<segments.length;segmentIndex++){
 const active=segments[segmentIndex],duration=active?active.video.duration:timings[i];
 aborted(workSignal);draw();
 if(recorder.state==='inactive'){recorder.start(1000);await waitEvent(recorder,'start',{signal:workSignal,ready:()=>recorder.state==='recording'});}
 else if(recorder.state==='paused'){recorder.resume();await waitEvent(recorder,'resume',{signal:workSignal,ready:()=>recorder.state==='recording'});}
 // Capture before play() so the first sound/frame is not omitted.
 if(active){
 try{await playVideos([active],workSignal);}catch(error){
 if(error?.name!=='NotAllowedError')throw error;
 recorder.pause();await waitEvent(recorder,'pause',{signal:workSignal,ready:()=>recorder.state==='paused'});
 if(!onPlaybackBlocked)throw Error('브라우저가 영상 자동 재생을 막았습니다. 영상 재생 계속 버튼으로 시작해주세요.');
 // The callback must invoke play directly from a trusted tap, with no await first.
 await onPlaybackBlocked({signal:workSignal,page:i+1,video:segmentIndex+1,start:()=>{
 aborted(workSignal);if(recorder.state==='paused')recorder.resume();
 const resumedAudio=audio&&audio.state!=='running'?audio.resume():Promise.resolve();
 const playing=Promise.all([playVideos([active],workSignal),resumedAudio]);
 return playing.then(()=>{if(audio&&audio.state!=='running')throw Error('소리 재생이 중단되었습니다. 앱을 연 상태로 다시 출력해주세요.');}).catch(error=>{if(recorder.state==='recording')recorder.pause();throw error;});
 }});
 }
 }aborted(workSignal);
 await new Promise((resolve,reject)=>{
 const started=performance.now();let last=started,stalled=0;
 const cleanup=()=>{globalThis.cancelAnimationFrame?.(frame);workSignal.removeEventListener('abort',cancelFrame);for(const e of entries)e.video.removeEventListener('error',mediaFailed);};
 const fail=error=>{cleanup();reject(error);},cancelFrame=()=>fail(workSignal.reason||new DOMException('취소','AbortError')),mediaFailed=()=>fail(Error('출력 도중 영상을 읽지 못했습니다.'));
 workSignal.addEventListener('abort',cancelFrame,{once:true});for(const e of entries)e.video.addEventListener('error',mediaFailed,{once:true});
 const tick=now=>{try{aborted(workSignal);if(now-last>3000)throw Error('화면 처리가 중단되어 출력에 실패했습니다. 앱을 연 상태로 다시 시도해주세요.');last=now;
 if(active&&!active.video.ended&&active.video.readyState<3){stalled++;if(stalled>VIDEO_EXPORT_LIMITS.fps*10)throw Error('영상 재생이 멈췄습니다. 범위를 줄이거나 원본 파일을 확인해주세요.');}else stalled=0;
 draw();const wallSeconds=(now-started)/1000,seconds=active?Math.min(duration,active.video.currentTime):Math.min(duration,wallSeconds);
 if(active&&!active.video.ended&&wallSeconds-active.video.currentTime>1.5)throw Error('영상과 소리의 재생이 지연되었습니다. 범위를 줄여 다시 출력해주세요.');
 onProgress({phase:'record',page:i+1,pages:pages.length,video:active?segmentIndex+1:0,videos:sequence.length,elapsed:Math.min(total,elapsed+completedSeconds+seconds),total});
 // Never start another source before the actual ended state.
 if(active?active.video.ended:wallSeconds>=duration){cleanup();resolve();return;}frame=requestAnimationFrame(tick);
 }catch(error){fail(error);}};frame=requestAnimationFrame(tick);
 });
 active?.video.pause();completedSeconds+=duration;
 recorder.pause();await waitEvent(recorder,'pause',{signal:workSignal,ready:()=>recorder.state==='paused'});
 }

 elapsed+=timings[i];for(const entry of entries)releaseVideo(entry);entries=[];base.width=base.height=1;base=null;
 }
 aborted(workSignal);
 const stopped=waitEvent(recorder,'stop',{signal:workSignal});recorder.stop();await stopped;aborted(workSignal);if(recordingError)throw recordingError;
 const actual=recorder.mimeType||mimeType,blob=new Blob(chunks,{type:actual});if(!blob.size)throw Error('영상 파일이 비어 있습니다. 다시 출력해주세요.');
 // Decode the produced file before offering it. Never label a recorder start as success.
 const check=doc.createElement('video'),url=URL.createObjectURL(blob);try{check.preload='auto';check.src=url;check.load();await waitEvent(check,'loadeddata',{signal:workSignal,ready:()=>check.readyState>=2});if(!check.videoWidth||!check.videoHeight)throw Error('출력 영상 파일을 검증하지 못했습니다.');}finally{check.removeAttribute('src');check.load();URL.revokeObjectURL(url);}
 complete=true;return {blob,extension:actual.includes('mp4')?'mp4':'webm',duration:total};
 }finally{
 signal?.removeEventListener('abort',cancel);doc.removeEventListener('visibilitychange',onHidden);globalThis.cancelAnimationFrame?.(frame);
 if(recorder&&recorder.state!=='inactive')try{recorder.stop();}catch{}
 for(const entry of entries)releaseVideo(entry);for(const track of stream?.getTracks()||[])track.stop();for(const track of destination?.stream.getTracks()||[])track.stop();if(audio)await audio.close().catch(()=>{});if(base)base.width=base.height=1;canvas.width=canvas.height=1;if(!complete)chunks.length=0;
 }
}

/** Opens only from export menu. Caller owns current-notebook scope and edit flushing. */
export function mountVideoExport({getPages,getCurrentId,renderPage,getMediaBlob,download,prepare=async()=>{},onBusyChange=()=>{},document:doc=globalThis.document}={}){
 const make=(tag,text)=>{const el=doc.createElement(tag);if(text)el.textContent=text;return el;};
 const dialog=make('dialog'),heading=make('h2','페이지 범위 · 영상 출력'),hint=make('p','필기·글·사진과 기기 영상을 한 영상으로 만듭니다. YouTube는 재생되지 않고 링크 안내만 표시됩니다. 서버에 업로드하지 않습니다.'),warning=make('p','출력 파일에는 비밀번호가 걸리지 않습니다. 원래 영상 길이만큼 시간이 걸리며 앱을 계속 열어두세요. 최대 30페이지·10분·원본 합계 128MB입니다. 브라우저 지원에 따라 MP4 또는 WebM으로 저장되며, 지원하지 않는 기기에서는 출력할 수 없습니다.'),from=make('input'),to=make('input'),audio=make('input'),seconds=make('input'),status=make('p'),start=make('button','영상 만들기'),save=make('button','영상 파일 저장'),close=make('button','닫기');
 dialog.id='video-export-dialog';heading.id='video-export-heading';dialog.setAttribute('aria-labelledby',heading.id);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 for(const input of [from,to]){input.type='number';input.min='1';input.step='1';}audio.type='checkbox';audio.checked=true;seconds.type='number';seconds.min='1';seconds.max='30';seconds.value='3';seconds.step='1';
 const label=(text,input)=>{const el=make('label',text+' ');el.style.display='block';el.style.margin='12px 0';input.style.maxWidth='90px';el.append(input);return el;};
 dialog.style.maxWidth='min(560px, calc(100vw - 32px))';dialog.style.maxHeight='85dvh';dialog.style.overflow='auto';
 const resume=make('button','영상 재생 계속');resume.type='button';resume.hidden=true;
 let controller=null,result=null,busy=false,snapshot=[],videoOrder=Object.create(null),orderButtons=[];save.hidden=true;
 const orderSection=make('section');orderSection.id='video-export-order';orderSection.setAttribute('aria-label','페이지별 영상 재생 순서');
 const discard=()=>{result=null;save.hidden=true;};
 const setBusy=value=>{busy=value;for(const control of [from,to,audio,seconds,start,...orderButtons])control.disabled=value;close.textContent=value?'출력 취소':'닫기';onBusyChange(value);};
 const requestPlayback=({start,signal,page,video})=>new Promise((resolve,reject)=>{
 const cleanup=()=>{resume.hidden=true;resume.onclick=null;signal.removeEventListener('abort',stop);};
 const stop=()=>{cleanup();reject(signal.reason||new DOMException('취소','AbortError'));};
 if(signal.aborted){stop();return;}signal.addEventListener('abort',stop,{once:true});
 status.textContent=`브라우저가 자동 재생을 제한했습니다. ${page}번째 출력 페이지 · 영상 ${video}: 아래 영상 재생 계속을 눌러주세요. 기다리는 시간은 영상에 넣지 않습니다.`;
 resume.hidden=false;resume.disabled=false;resume.onclick=()=>{resume.disabled=true;let playback;try{playback=start();}catch(error){cleanup();reject(error);return;}Promise.resolve(playback).then(()=>{cleanup();resolve();},error=>{if(signal.aborted){stop();return;}if(error?.name!=='NotAllowedError'){cleanup();reject(error);return;}resume.disabled=false;status.textContent='브라우저가 재생을 허용하지 않았습니다. 영상 재생 계속을 다시 누르거나 출력 취소를 눌러주세요.';});};
 });
 const cancel=()=>{controller?.abort(new DOMException('영상 출력을 취소했습니다.','AbortError'));discard();};
 const renderOrder=()=>{
 orderSection.replaceChildren();orderButtons=[];
 const first=Number(from.value),last=Number(to.value),pages=getPages();
 if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last<first||last>pages.length||last-first+1>VIDEO_EXPORT_LIMITS.pages){orderSection.append(make('p','시작·끝 페이지를 올바르게 지정하면 영상 순서가 표시됩니다.'));return;}
 orderSection.append(make('h3','페이지별 영상 재생 순서'),make('p','이번 출력에 적용할 순서입니다. 앞·뒤 버튼으로 바꾸세요. 노트의 위치나 평소 재생 방식은 바뀌지 않습니다.'));
 for(let index=first-1;index<last;index++){
 const page=pages[index],videos=(page.videoObjects||[]).filter(video=>video.provider==='local'),section=make('section');section.append(make('h4',`${index+1}페이지`));
 if(!videos.length){section.append(make('p','기기 영상 없음 · 설정한 정지 화면 시간만큼 표시'));orderSection.append(section);continue;}
 const previous=videoOrder[page.id]||[],ids=[...previous.filter(id=>videos.some(video=>video.id===id)),...videos.filter(video=>!previous.includes(video.id)).map(video=>video.id)];videoOrder[page.id]=ids;
 for(const [position,id]of ids.entries()){
 const video=videos.find(video=>video.id===id),row=make('div'),name=make('span',`${position+1}. ${video.fileName}`),earlier=make('button','앞으로'),later=make('button','뒤로');
 for(const [button,delta]of [[earlier,-1],[later,1]]){button.type='button';button.style.minHeight='44px';button.setAttribute('aria-label',`${index+1}페이지 ${video.fileName} ${delta<0?'앞으로':'뒤로'}`);button.disabled=busy||(delta<0?position===0:position===ids.length-1);button.onclick=()=>{if(busy)return;const next=position+delta;if(next<0||next>=ids.length)return;[ids[position],ids[next]]=[ids[next],ids[position]];discard();status.textContent='재생 순서를 바꿨습니다. 영상 만들기를 눌러주세요.';renderOrder();};orderButtons.push(button);}
 row.append(name,earlier,later);section.append(row);
 }
 orderSection.append(section);
 }
 };
 const settingsChanged=()=>{if(busy)return;discard();status.textContent='설정을 바꿨습니다. 영상 만들기를 눌러주세요.';renderOrder();};
 for(const control of [from,to,audio,seconds])control.addEventListener('change',settingsChanged);
 for(const control of [from,to,seconds])control.addEventListener('input',settingsChanged);
 const open=()=>{if(busy)return;snapshot=getPages().map(p=>({id:p.id}));videoOrder=Object.create(null);const index=Math.max(0,snapshot.findIndex(p=>p.id===getCurrentId()));from.value=String(index+1);to.value=String(index+1);from.max=to.max=String(snapshot.length);discard();status.textContent='한 페이지의 영상은 지정한 순서대로 하나씩 재생됩니다. 대기 중에는 첫 화면, 끝난 뒤에는 마지막 화면이 남습니다. 모든 영상이 끝나면 다음 페이지로 넘어갑니다.';renderOrder();doc.getElementById('export-dialog')?.close();dialog.showModal();};
 start.onclick=async()=>{if(busy)return;discard();controller=new AbortController();setBusy(true);let primedAudio;try{
 // Resume synchronously with the trusted click, before flushing edits or loading files.
 if(audio.checked){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)throw Error('이 브라우저는 소리 합성을 지원하지 않습니다.');primedAudio=new Audio();await primedAudio.resume();}

 const prepared=prepare();if(prepared?.then)await prepared;
 const current=getPages();if(current.length!==snapshot.length||current.some((p,i)=>p.id!==snapshot[i].id))throw Error('페이지 목록이 바뀌었습니다. 창을 닫고 다시 선택해주세요.');
 const pages=structuredClone(selectVideoRange(current,Number(from.value),Number(to.value)));
 result=await composeVideoPages(pages,{renderPage,getMediaBlob,includeAudio:audio.checked,audioContext:primedAudio,videoOrder:structuredClone(videoOrder),stillSeconds:Number(seconds.value),signal:controller.signal,document:doc,onPlaybackBlocked:requestPlayback,onProgress:progress=>{status.textContent=progress.phase==='prepare'?`영상 확인 중 · ${progress.page}/${progress.pages}페이지`:`영상 만드는 중 · ${progress.page}/${progress.pages}페이지${progress.videos?' · 영상 '+progress.video+'/'+progress.videos:''} · ${Math.round(progress.elapsed)}/${Math.ceil(progress.total)}초`;}});
 aborted(controller.signal);status.textContent='영상 파일을 만들었습니다. 아래 저장 버튼을 누른 뒤 기기에 저장됐는지 확인해주세요.';save.hidden=false;
 }catch(error){discard();status.textContent=error.name==='NotAllowedError'?'브라우저가 영상 또는 소리 시작을 허용하지 않았습니다. 영상 만들기를 다시 누르거나, 소리 포함을 해제한 뒤 시도해주세요. 원본은 변경하지 않았습니다.':error.message||'영상 출력에 실패했습니다. 원본 노트와 영상은 변경하지 않았습니다.';}finally{if(primedAudio&&primedAudio.state!=='closed')await primedAudio.close().catch(()=>{});controller=null;setBusy(false);renderOrder();}};
 save.onclick=async()=>{if(!result||save.disabled)return;save.disabled=true;try{await download(result.blob,'노트-페이지-영상.'+result.extension);status.textContent='파일 저장 화면을 요청했습니다. 저장 위치를 선택하고 완료해주세요.';}catch(error){status.textContent=error.message||'파일 저장 요청에 실패했습니다. 다시 시도해주세요.';}finally{save.disabled=false;}};
 close.onclick=()=>{if(busy)cancel();else{discard();dialog.close();}};dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();cancel();}else discard();});
 // Remove prepared plaintext output when the app backgrounds, including after recording.
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden){cancel();if(!busy&&dialog.open){status.textContent='화면을 떠나 준비한 출력 파일을 지웠습니다. 다시 만들어주세요.';}}});
 dialog.append(heading,hint,warning,label('시작 페이지',from),label('끝 페이지',to),label('소리 포함',audio),label('영상 없는 페이지 표시 시간(초)',seconds),orderSection,status,resume,start,save,close);doc.body.append(dialog);
 const button=make('button','페이지 범위 · 영상 출력');button.id='choose-video-pages';button.type='button';button.onclick=open;doc.getElementById('export-pdf')?.after(button);
 return {open,cancel,isBusy:()=>busy,dialog};
}


import test from 'node:test';
import assert from 'node:assert/strict';
import * as videoExport from '../../update-source/src/video-export.js';

// Event/DOM doubles keep these tests independent of browser layout and encoders.
class Element extends EventTarget {
  constructor(tag, doc) {
    super();
    this.tagName=tag;
    this.doc=doc;
    this.children=[];
    this.parentElement=null;
    this.attributes={};
    this.style={};
    this.dataset={};
    this.value='';
    this.hidden=false;
    this.disabled=false;
    this.open=false;
    this.className='';
    this.ownText='';
  }
  get textContent(){return this.ownText+this.children.map(child=>child.textContent).join('');}
  set textContent(value){this.ownText=String(value);this.replaceChildren();}
  append(...children){for(let child of children){if(typeof child==='string'){const text=this.doc.createElement('#text');text.textContent=child;child=text;}child.remove();child.parentElement=this;this.children.push(child);}}
  replaceChildren(...children){for(const child of this.children)child.parentElement=null;this.children=[];this.append(...children);}
  remove(){if(this.parentElement){const siblings=this.parentElement.children;siblings.splice(siblings.indexOf(this),1);this.parentElement=null;}}
  after(child){const parent=this.parentElement;if(!parent)return;child.remove();child.parentElement=parent;parent.children.splice(parent.children.indexOf(this)+1,0,child);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  removeAttribute(name){delete this.attributes[name];}
  matches(selector){return selector.startsWith('#')?this.id===selector.slice(1):selector.startsWith('.')?this.className.split(' ').includes(selector.slice(1)):this.tagName===selector;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  focus(){this.doc.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;this.dispatchEvent(new Event('close'));}
  fire(type){const event=new Event(type,{cancelable:true});const result=this[`on${type}`]?.(event);this.dispatchEvent(event);return result;}
  click(){if(this.disabled)return;this.doc.clickDepth=(this.doc.clickDepth||0)+1;try{return this.fire('click');}finally{this.doc.clickDepth--;}}
}
class Video extends Element {
  constructor(doc){super('video',doc);this.readyState=4;this.videoWidth=900;this.videoHeight=1200;this.duration=.01;this.currentTime=0;this.ended=true;}
  load(){}
  pause(){}
  play(){const start=()=>{this.doc.played.push(this.doc.urls.get(this.src));this.currentTime=this.duration;return Promise.resolve();};return this.doc.playVideo?this.doc.playVideo(this,start):start();}
}
class Recorder extends EventTarget {
  static isTypeSupported(type){return type==='video/mp4';}
  constructor(stream,{mimeType}){super();this.stream=stream;this.mimeType=mimeType;this.state='inactive';}
  start(){this.state='recording';}
  pause(){this.state='paused';}
  resume(){this.state='recording';}
  stop(){this.state='inactive';queueMicrotask(()=>{const event=new Event('dataavailable');event.data=new Blob(['test-video']);this.dispatchEvent(event);this.dispatchEvent(new Event('stop'));});}
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const local=(id,fileName)=>({id,provider:'local',fileName,bounds:{x:0,y:0,width:480,height:270}});
const samplePages=()=>[
  {id:'page-a',title:'첫 페이지',strokes:[{id:'ink-a'}],videoObjects:[local('a','첫째.mp4'),{id:'remote',provider:'youtube'},local('b','둘째.mp4'),local('c','셋째.mp4')]},
  {id:'still-page',title:'정지 페이지',photoObjects:[{id:'photo'}]},
  {id:'page-c',title:'마지막 페이지',videoObjects:[local('d','넷째.mp4'),local('e','다섯째.mp4')]}
];
function fixture(t,{pages=samplePages(),currentId=pages[0].id,prepare=async()=>{},withAudio=false,playVideo}={}){
  const doc=new EventTarget();
  doc.hidden=false;
  doc.played=[];
  doc.playVideo=playVideo;
  doc.recorders=[];
  doc.audioSources=[];
  doc.audioContexts=[];
  doc.urls=new Map();
  doc.activeElement=null;
  doc.createElement=tag=>{
    if(tag==='video')return new Video(doc);
    const element=new Element(tag,doc);
    if(tag==='canvas'){
      element.getContext=()=>({drawImage(){},fillRect(){}});
      element.captureStream=()=>({getTracks:()=>[{stop(){}}],addTrack(){}});
    }
    return element;
  };
  doc.createTextNode=text=>{const node=doc.createElement('#text');node.textContent=text;return node;};
  doc.body=doc.createElement('body');
  doc.querySelector=selector=>doc.body.querySelector(selector);
  doc.querySelectorAll=selector=>doc.body.querySelectorAll(selector);
  doc.getElementById=id=>doc.querySelector('#'+id);
  const exportDialog=doc.createElement('dialog'),exportPDF=doc.createElement('button');
  exportDialog.id='export-dialog';exportPDF.id='export-pdf';exportDialog.append(exportPDF);doc.body.append(exportDialog);
  class TrackedRecorder extends Recorder{constructor(...args){super(...args);doc.recorders.push(this);}}
  class Audio{
    constructor(){this.state='suspended';this.resumeCalls=[];doc.audioContexts.push(this);}
    resume(){this.resumeCalls.push({duringClick:!!doc.clickDepth,previousState:this.state});this.state='running';return Promise.resolve();}
    createMediaStreamDestination(){return {stream:{getAudioTracks:()=>[{stop(){}}],getTracks:()=>[{stop(){}}]}};}
    createMediaElementSource(video){doc.audioSources.push(video);return {connect(){},disconnect(){}};}
    createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
    close(){this.state='closed';return Promise.resolve();}
  }
  const descriptors=new Map();
  for(const [name,value] of Object.entries({MediaRecorder:TrackedRecorder,AudioContext:Audio,webkitAudioContext:undefined,requestAnimationFrame:callback=>setTimeout(()=>callback(performance.now()),1),cancelAnimationFrame:clearTimeout})){
    descriptors.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
  }
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
  let nextURL=0;
  URL.createObjectURL=blob=>{const url=`blob:test-video-${++nextURL}`;doc.urls.set(url,blob.mediaId);return url;};
  URL.revokeObjectURL=url=>doc.urls.delete(url);
  t.after(()=>{for(const [name,descriptor] of descriptors)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;});
  const reads=[],downloads=[],busy=[];
  const ui=videoExport.mountVideoExport({getPages:()=>pages,getCurrentId:()=>currentId,document:doc,prepare,onBusyChange:value=>busy.push(value),renderPage:async()=>({width:900,height:1200}),getMediaBlob:async object=>{reads.push(object.id);return Object.assign(new Blob(['source-video']),{mediaId:object.id});},download:(...args)=>downloads.push(args)});
  const button=text=>doc.querySelectorAll('button').find(element=>element.textContent===text);
  const field=label=>doc.querySelectorAll('label').find(element=>element.textContent.startsWith(label))?.querySelector('input');
  const order=()=>doc.getElementById('video-export-order');
  const arrows=()=>order()?.querySelectorAll('button')||[];
  const arrow=(page,file,direction)=>arrows().find(element=>element.getAttribute('aria-label')===`${page}페이지 ${file} ${direction}`);
  const names=page=>arrows().map(element=>element.getAttribute('aria-label')).filter(label=>label?.startsWith(`${page}페이지 `)&&label.endsWith(' 앞으로')).map(label=>label.slice(`${page}페이지 `.length,-' 앞으로'.length));
  const change=(element,value,type='change')=>{element.value=String(value);element.fire(type);};
  ui.open();
  const audio=field('소리 포함');audio.checked=withAudio;audio.fire('change');
  return {doc,ui,pages,reads,downloads,busy,button,field,order,arrows,arrow,names,change};
}

test('explicit page-video order uses only local IDs and never mutates source objects',()=>{
  const page=samplePages()[0],before=structuredClone(page);
  const supplied={ [page.id]:['c','a','b'] };
  assert.deepEqual(videoExport.orderedPageVideos(page).map(video=>video.id),['a','b','c']);
  const ordered=videoExport.orderedPageVideos(page,supplied);
  assert.deepEqual(ordered.map(video=>video.id),['c','a','b']);
  assert.equal(ordered[0],page.videoObjects[3]);
  assert.deepEqual(page,before);
  assert.deepEqual(supplied,{[page.id]:['c','a','b']});
  assert.deepEqual(videoExport.orderedPageVideos({id:'still'}),[]);
});

test('explicit page-video order rejects stale, omitted and duplicate IDs',()=>{
  const page=samplePages()[0];
  for(const ids of [['a','b'],['a','a','c'],['a','b','gone'],['a','b','c','remote'],[]]){
    assert.throws(()=>videoExport.orderedPageVideos(page,{[page.id]:ids}),/영상 목록이 바뀌었습니다/,`invalid IDs ${JSON.stringify(ids)} must not silently change requested order`);
  }
});

test('dialog moves files within a page and disables first/last boundaries without editing the note',t=>{
  const pages=samplePages(),before=structuredClone(pages),f=fixture(t,{pages});
  assert.ok(f.order());
  assert.deepEqual(f.names(1),['첫째.mp4','둘째.mp4','셋째.mp4']);
  assert.deepEqual(f.order().querySelectorAll('span').map(element=>element.textContent),['1. 첫째.mp4','2. 둘째.mp4','3. 셋째.mp4']);
  assert.equal(f.arrow(1,'첫째.mp4','앞으로').disabled,true);
  assert.equal(f.arrow(1,'셋째.mp4','뒤로').disabled,true);
  f.arrow(1,'둘째.mp4','앞으로').click();
  assert.deepEqual(f.names(1),['둘째.mp4','첫째.mp4','셋째.mp4']);
  f.arrow(1,'둘째.mp4','뒤로').click();
  f.arrow(1,'셋째.mp4','앞으로').click();
  f.arrow(1,'셋째.mp4','앞으로').click();
  assert.deepEqual(f.names(1),['셋째.mp4','첫째.mp4','둘째.mp4']);
  assert.equal(f.arrow(1,'셋째.mp4','앞으로').disabled,true);
  assert.equal(f.arrow(1,'둘째.mp4','뒤로').disabled,true);
  assert.deepEqual(pages,before);
});

test('range changes preserve retained-page ordering and keep actual notebook page numbers',t=>{
  const f=fixture(t);
  f.arrow(1,'둘째.mp4','앞으로').click();
  f.change(f.field('끝 페이지'),3);
  assert.deepEqual(f.names(1),['둘째.mp4','첫째.mp4','셋째.mp4']);
  assert.deepEqual(f.names(3),['넷째.mp4','다섯째.mp4']);
  assert.deepEqual(f.names(2),[]);
  assert.match(f.order().textContent,/2페이지기기 영상 없음/);
  f.arrow(3,'다섯째.mp4','앞으로').click();
  f.change(f.field('시작 페이지'),3);
  assert.deepEqual(f.names(1),[]);
  assert.deepEqual(f.names(3),['다섯째.mp4','넷째.mp4']);
  f.change(f.field('시작 페이지'),1);
  assert.deepEqual(f.names(3),['다섯째.mp4','넷째.mp4']);
});

test('closing and reopening resets temporary sequence order to the source note order',t=>{
  const pages=samplePages(),before=structuredClone(pages),f=fixture(t,{pages});
  f.arrow(1,'셋째.mp4','앞으로').click();
  f.button('닫기').click();
  assert.equal(f.ui.dialog.open,false);
  f.ui.open();
  assert.deepEqual(f.names(1),['첫째.mp4','둘째.mp4','셋째.mp4']);
  assert.deepEqual(pages,before);
});

test('pending preparation disables sequence arrows and releases them after failure',async t=>{
  const pending=deferred(),f=fixture(t,{prepare:()=>pending.promise});
  const running=f.button('영상 만들기').click();
  assert.equal(f.ui.isBusy(),true);
  assert.ok(f.arrows().length>0);
  assert.ok(f.arrows().every(button=>button.disabled));
  f.arrow(1,'둘째.mp4','앞으로').click();
  assert.deepEqual(f.names(1),['첫째.mp4','둘째.mp4','셋째.mp4']);
  pending.reject(Error('준비 중 테스트 오류'));
  await running;
  assert.equal(f.ui.isBusy(),false);
  assert.equal(f.arrow(1,'둘째.mp4','앞으로').disabled,false);
  assert.equal(f.arrow(1,'첫째.mp4','앞으로').disabled,true);
  assert.equal(f.button('영상 파일 저장').hidden,true);
  assert.deepEqual(f.busy,[true,false]);
});

test('selected sequence reaches recording in that order while source notes remain untouched',async t=>{
  const pages=samplePages(),before=structuredClone(pages),f=fixture(t,{pages});
  f.arrow(1,'셋째.mp4','앞으로').click();
  f.arrow(1,'셋째.mp4','앞으로').click();
  await f.button('영상 만들기').click();
  assert.deepEqual(f.doc.played,['c','a','b']);
  assert.equal(f.button('영상 파일 저장').hidden,false);
  f.button('영상 파일 저장').click();
  assert.equal(f.downloads.length,1);
  assert.ok(f.downloads[0][0] instanceof Blob);
  assert.match(f.downloads[0][1],/\.mp4$/);
  assert.deepEqual(pages,before);
});

for(const setting of ['order','range','audio','still duration']){
  test(`changing ${setting} discards already generated output instead of saving stale settings`,async t=>{
    const f=fixture(t);
    await f.button('영상 만들기').click();
    const save=f.button('영상 파일 저장');
    assert.equal(save.hidden,false);
    if(setting==='order')f.arrow(1,'둘째.mp4','앞으로').click();
    if(setting==='range')f.change(f.field('끝 페이지'),3);
    if(setting==='audio'){const audio=f.field('소리 포함');audio.checked=true;audio.fire('change');}
    if(setting==='still duration')f.change(f.field('영상 없는 페이지 표시 시간'),5);
    assert.equal(save.hidden,true);
    save.onclick();
    assert.deepEqual(f.downloads,[]);
  });
}

test('invalid range clears old order controls and does not expose an output',async t=>{
  const f=fixture(t);
  f.change(f.field('시작 페이지'),0);
  assert.deepEqual(f.arrows(),[]);
  assert.match(f.order().textContent,/시작·끝 페이지를 올바르게/);
  await f.button('영상 만들기').click();
  assert.equal(f.ui.isBusy(),false);
  assert.deepEqual(f.reads,[]);
  assert.equal(f.button('영상 파일 저장').hidden,true);
  f.change(f.field('시작 페이지'),1);
  assert.deepEqual(f.names(1),['첫째.mp4','둘째.mp4','셋째.mp4']);
});

test('single local file has a numbered row but no enabled movement controls',t=>{
  const pages=[{id:'single',videoObjects:[{id:'link',provider:'youtube'},local('only','단일.mp4')]}],f=fixture(t,{pages});
  assert.deepEqual(f.names(1),['단일.mp4']);
  assert.deepEqual(f.order().querySelectorAll('span').map(element=>element.textContent),['1. 단일.mp4']);
  assert.equal(f.arrows().length,2);
  assert.ok(f.arrows().every(button=>button.disabled));
});

test('cancel during pending preparation prevents recording and restores usable controls',async t=>{
  const pending=deferred(),f=fixture(t,{prepare:()=>pending.promise});
  const running=f.button('영상 만들기').click();
  f.button('출력 취소').click();
  pending.resolve();
  await running;
  assert.equal(f.ui.isBusy(),false);
  assert.deepEqual(f.reads,[]);
  assert.deepEqual(f.doc.played,[]);
  assert.equal(f.button('영상 파일 저장').hidden,true);
  assert.equal(f.arrow(1,'둘째.mp4','앞으로').disabled,false);
  assert.equal(f.ui.dialog.open,true);
});

test('a changed local-video list during preparation fails before reading any media',async t=>{
  const pages=samplePages(),pending=deferred(),f=fixture(t,{pages,prepare:()=>pending.promise});
  f.arrow(1,'둘째.mp4','앞으로').click();
  const running=f.button('영상 만들기').click();
  pages[0].videoObjects=pages[0].videoObjects.filter(video=>video.id!=='b');
  pending.resolve();
  await running;
  assert.equal(f.ui.isBusy(),false);
  assert.deepEqual(f.reads,[]);
  assert.equal(f.button('영상 파일 저장').hidden,true);
  assert.match(f.ui.dialog.textContent,/영상 목록이 바뀌었습니다/);
});

test('backgrounding after successful generation discards the downloadable output',async t=>{
  const f=fixture(t);
  await f.button('영상 만들기').click();
  const save=f.button('영상 파일 저장');
  assert.equal(save.hidden,false);
  f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(save.hidden,true);
  save.onclick();
  assert.deepEqual(f.downloads,[]);
});

const waitUntil=async predicate=>{for(let attempt=0;attempt<100;attempt++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,1));}assert.fail('Expected export UI state did not appear');};
const singleVideoPage=()=>[{id:'audible-page',videoObjects:[local('audible','소리있는영상.mp4')]}];
const deniedPlayback=()=>new DOMException('User gesture required','NotAllowedError');

test('Safari blocked audible playback waits paused and retries the same element directly from the tap',async t=>{
  const attempts=[];
  const f=fixture(t,{pages:singleVideoPage(),withAudio:true,playVideo:(video,start)=>{
    attempts.push({video,id:video.doc.urls.get(video.src),duringClick:!!video.doc.clickDepth,muted:!!video.muted,recorderState:video.doc.recorders[0].state});
    return video.doc.clickDepth?start():Promise.reject(deniedPlayback());
  }});
  const running=f.button('영상 만들기').click(),resume=f.button('영상 재생 계속');
  await waitUntil(()=>resume.hidden===false);
  assert.equal(f.ui.isBusy(),true);
  assert.equal(f.doc.recorders[0].state,'paused');
  assert.deepEqual(f.doc.played,[]);
  assert.equal(f.field('소리 포함').checked,true);
  assert.equal(f.button('영상 파일 저장').hidden,true);
  assert.ok(f.arrows().every(button=>button.disabled));
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.doc.recorders[0].state,'paused');
  resume.click();
  assert.equal(attempts.length,2,'retry must call play() before the click handler returns');
  assert.equal(attempts[1].duringClick,true);
  assert.equal(attempts[1].recorderState,'recording');
  assert.equal(attempts[1].video,attempts[0].video);
  assert.ok(attempts.every(attempt=>attempt.muted===false));
  await running;
  assert.deepEqual(f.doc.played,['audible']);
  assert.equal(f.doc.audioSources.length,1);
  assert.equal(f.button('영상 파일 저장').hidden,false);
  assert.equal(resume.hidden,true);
  assert.equal(resume.onclick,null);
});

test('each blocked source requests its own tap without skipping or reordering audible videos',async t=>{
  const pages=[{id:'two-videos',videoObjects:[local('a','하나.mp4'),local('b','둘.mp4')]}];
  const f=fixture(t,{pages,withAudio:true,playVideo:(video,start)=>video.doc.clickDepth?start():Promise.reject(deniedPlayback())});
  f.arrow(1,'둘.mp4','앞으로').click();
  const running=f.button('영상 만들기').click(),resume=f.button('영상 재생 계속');
  await waitUntil(()=>!resume.hidden);resume.click();
  await waitUntil(()=>f.doc.played.length===1&&!resume.hidden&&!resume.disabled);
  assert.deepEqual(f.doc.played,['b']);
  assert.equal(f.doc.recorders[0].state,'paused');
  assert.match(f.ui.dialog.textContent,/영상 2/);
  resume.click();await running;
  assert.deepEqual(f.doc.played,['b','a']);
  assert.equal(f.doc.audioSources.length,2);
  assert.equal(f.button('영상 파일 저장').hidden,false);
});

test('repeated Safari denial leaves a usable retry and cancellation without muting audio',async t=>{
  const attempts=[];
  const f=fixture(t,{pages:singleVideoPage(),withAudio:true,playVideo:video=>{attempts.push({duringClick:!!video.doc.clickDepth,muted:!!video.muted});return Promise.reject(deniedPlayback());}});
  const running=f.button('영상 만들기').click(),resume=f.button('영상 재생 계속');
  await waitUntil(()=>!resume.hidden);resume.click();
  await waitUntil(()=>!resume.disabled);
  assert.equal(attempts.length,2);
  assert.equal(attempts[1].duringClick,true);
  assert.ok(attempts.every(attempt=>!attempt.muted));
  assert.equal(f.doc.recorders[0].state,'paused');
  assert.equal(resume.hidden,false);
  assert.match(f.ui.dialog.textContent,/다시 누르거나 출력 취소/);
  f.button('출력 취소').click();await running;
  assert.equal(f.ui.isBusy(),false);
  assert.equal(resume.hidden,true);
  assert.equal(resume.onclick,null);
  assert.equal(f.button('영상 파일 저장').hidden,true);
});

for(const action of ['cancel','background']){
  test(`${action} while waiting for a Safari tap clears callbacks, media and partial output`,async t=>{
    let attempts=0;
    const f=fixture(t,{pages:singleVideoPage(),withAudio:true,playVideo:()=>{attempts++;return Promise.reject(deniedPlayback());}});
    const running=f.button('영상 만들기').click(),resume=f.button('영상 재생 계속');
    await waitUntil(()=>!resume.hidden);
    if(action==='cancel')f.button('출력 취소').click();
    else{f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));}
    await running;
    assert.equal(f.ui.isBusy(),false);
    assert.equal(resume.hidden,true);
    assert.equal(resume.onclick,null);
    assert.equal(f.doc.recorders[0].state,'inactive');
    assert.equal(f.doc.urls.size,0);
    assert.ok(f.doc.audioContexts.every(context=>context.state==='closed'));
    assert.equal(f.button('영상 파일 저장').hidden,true);
    resume.click();f.button('영상 파일 저장').onclick();
    assert.equal(attempts,1);
    assert.deepEqual(f.doc.played,[]);
    assert.deepEqual(f.downloads,[]);
  });
}

test('non-autoplay media errors fail without showing a continuation button or silently removing audio',async t=>{
  const f=fixture(t,{pages:singleVideoPage(),withAudio:true,playVideo:video=>{assert.notEqual(video.muted,true);return Promise.reject(new DOMException('Unsupported codec','NotSupportedError'));}});
  await f.button('영상 만들기').click();
  assert.equal(f.ui.isBusy(),false);
  assert.equal(f.button('영상 재생 계속').hidden,true);
  assert.equal(f.button('영상 파일 저장').hidden,true);
  assert.equal(f.field('소리 포함').checked,true);
  assert.match(f.ui.dialog.textContent,/Unsupported codec/);
  assert.deepEqual(f.doc.played,[]);
});

test('Safari continuation resumes an interrupted AudioContext in the same tap before playing',async t=>{
  const f=fixture(t,{pages:singleVideoPage(),withAudio:true,playVideo:(video,start)=>video.doc.clickDepth?start():Promise.reject(deniedPlayback())});
  const running=f.button('영상 만들기').click(),resume=f.button('영상 재생 계속');
  await waitUntil(()=>!resume.hidden);
  const audio=f.doc.audioContexts[0];audio.state='interrupted';
  resume.click();
  assert.equal(audio.state,'running');
  assert.deepEqual(audio.resumeCalls.at(-1),{duringClick:true,previousState:'interrupted'});
  await running;
  assert.equal(f.button('영상 파일 저장').hidden,false);
  assert.deepEqual(f.doc.played,['audible']);
});

test('Safari continuation never offers a silent success when interrupted audio cannot resume',async t=>{
  const f=fixture(t,{pages:singleVideoPage(),withAudio:true,playVideo:(video,start)=>video.doc.clickDepth?start():Promise.reject(deniedPlayback())});
  const running=f.button('영상 만들기').click(),resume=f.button('영상 재생 계속');
  await waitUntil(()=>!resume.hidden);
  const audio=f.doc.audioContexts[0];audio.state='interrupted';audio.resume=()=>Promise.resolve();
  resume.click();await running;
  assert.equal(f.ui.isBusy(),false);
  assert.equal(f.field('소리 포함').checked,true);
  assert.equal(f.button('영상 파일 저장').hidden,true);
  assert.equal(resume.hidden,true);
  assert.deepEqual(f.downloads,[]);
});


/** Main-frame origin-scoped native messaging. Remote player owns no note bridge. */
export function nativeYouTubeAvailable(host=globalThis){return typeof host.KepcoYouTube?.postMessage==='function';}
export function playerPlacement(rect,viewport,chromeBottom=0){
 const {width:vw,height:vh}=viewport,{left:x,top:y,width:w,height:h}=rect;
 if(![vw,vh,x,y,w,h,chromeBottom].every(Number.isFinite)||vw<=0||vh<=0||w<40||h<30||x<0||y<Math.max(0,chromeBottom)||x+w>vw+1||y+h>vh+1)return null;
 return {x,y,w,h,vw,vh,top:Math.max(0,chromeBottom)};
}
export function mountNativeYouTube({getPageId,isEditing,host=window,doc=document}){
 let active=null,frame=null,lastSent=0,lastGeometry='';
 const send=m=>{try{host.KepcoYouTube.postMessage(JSON.stringify(m));return true;}catch{return false;}};
 function stop(id){if(id&&active?.id!==id)return;if(frame!==null){host.cancelAnimationFrame(frame);frame=null;}const previous=active;active=null;lastGeometry='';if(nativeYouTubeAvailable(host))send({op:'hide'});previous?.onStop?.();}
 function tick(now){frame=null;if(!active)return;
  if(doc.hidden||getPageId()!==active.pageId||isEditing()||doc.querySelector('dialog[open]')||!active.body.isConnected){stop();return;}
  const chrome=doc.querySelector('.editor-chrome'),top=chrome?.getBoundingClientRect().bottom||0;
  const placement=playerPlacement(active.body.getBoundingClientRect(),{width:host.innerWidth,height:host.innerHeight},top);
  // Never draw above menus, across status/navigation bars, or beyond the visible page.
  if(!placement){stop();return;}
  const geometry=JSON.stringify(placement);
  if(geometry!==lastGeometry||now-lastSent>=300){if(!send({op:'show',key:active.id,id:active.videoId,start:active.start,...placement})){stop();return;}lastSent=now;lastGeometry=geometry;}
  frame=host.requestAnimationFrame(tick);
 }
 function play(video,body,onStop){if(!nativeYouTubeAvailable(host))return false;stop();active={id:video.id,videoId:video.videoId,start:video.start,pageId:getPageId(),body,onStop};lastSent=0;tick(0);return !!active;}
 host.addEventListener?.('pagehide',()=>stop());doc.addEventListener('visibilitychange',()=>{if(doc.hidden)stop();});
 return {play,stop};
}

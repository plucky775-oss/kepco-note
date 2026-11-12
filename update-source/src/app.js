import {mountVideoTools} from './video-tools.js';
import {drawVideoPlaceholders} from './video-objects.js';
import {mountVideoExport} from './video-export.js';
import {readDeviceVideo,getDeviceVideoInfo} from './device-video-store.js';
import {mountVideoStorageManager,collectVideoReferences} from './video-storage-manager.js';
import {confirmNotebookDeletion} from './notebook-delete-confirm.js';
import {ANDROID_UNAVAILABLE,requireOnlineFeature} from './android-policy.js';
import {mountBackupCenter} from './backup-center.js';
import {inspectBackup} from './backup-model.js';
import {mountPageTools} from './page-tools.js';
import {sealCommittedStroke,createInkSnapshotWarmer} from './immutable-ink.js';
import {createSaveCoordinator} from './save-coordinator.js';
import {runPageTransition} from './page-transition.js';
import {mountTrash} from './trash-view.js';
import {mountExportOptions,recordBackupAttempt} from './export-options.js';
import {duplicatePage,movePage} from './page-management.js';
import {mountWorkspaceTabs} from './workspace-tabs.js';
import {defaultPenWidth} from './pen-width.js';
import {mountPenSizeControl} from './pen-size-control.js';
import {mountDiaryDialog} from './diary-dialog.js';
import {createDiaryStore} from './diary-storage.js';
import {mountMeetingDialog} from './meeting-dialog.js';
import {createMeetingNotebook,notebookPdfSnapshot} from './meeting-notebooks.js';
import {createPhotoObject,drawPageImages} from './photo-objects.js';
import {mountPhotoTools} from './photo-tools.js';
import {importPdfPages,exportPdfPages} from './pdf-tools.js';
import {mountEditorMenus} from './editor-menu.js';
import {mountPageSwipe} from './page-swipe.js';
import {mountPaperViewport} from './paper-viewport.js';
import {blankPaperPoint,pageSwipeStartAllowed} from './touch-hit.js';
import {mountDrawingTools} from './drawing-tools.js';
import {drawDrawingObject,eraseDrawingObjects} from './drawing-objects.js';
import {mountKeyboardText} from './keyboard-text.js';
import {mountTextObjectEditor} from './text-object-editor.js';
import {deleteSelectedContent} from './delete-selection.js';
import {mountPenPicker} from './pen-picker.js';
import {PEN_KINDS,normalizePenKind,strokeSvg,liveStrokeSvg,drawStyledStroke} from './pen-renderer.js';
import {mountPaperPicker} from './paper-picker.js';
import {paperBackgroundSvg,drawPaperBackground,normalizePaperTheme} from './paper-themes.js';
import {mountLibrary} from './library-view.js';
import {mountNotebookEditor} from './notebook-editor.js';
import {setNotebookFavorite,setNotebookMetadata} from './library-model.js';
import {renderPagePreview} from './page-preview.js';
import {hitTestText,acceptDirectTouch} from './text-hit.js';
import {moveTextObject} from './text-objects.js';
import {notebookId,pagesFor,listNotebooks,createPage,cloneImportedPages} from './notebooks.js';
import {selectStrokesInRect,selectStrokesInLasso,selectRegionDetailed,completeSelection,selectionBounds,visibleSelectionBounds,prepareSelectionMove,selectionMoveOffset,moveSelection} from './selection.js';
import {sendRecognition} from './recognition-client.js';
import {deriveInkRows,distributeTextAcrossRows} from './ink-lines.js';
import {selectRecognitionStrokes} from './recognition-selection.js';
import {eraseStrokes} from './area-eraser.js';
import {mountEraserSize} from './eraser-size.js';
import {correctShape} from './shapes.js';
import {createLineHold} from './line-hold.js';
import {glyphSelectionGeometry,clippedGlyphBoxes} from './text-selection-bounds.js';
import {CHALK_COLORS,isChalkboard,pagePenSettings,withPagePenSettings,setChalkboardMode,selectPagePen} from './chalkboard-mode.js';
import {makeConvertedGroup,activeConvertedGroups,replaceGroups,appendTextObject,fitGroupText,layoutTextObject} from './converted-groups.js';
import {createAutoConverter,createRecognitionBudget} from './auto-convert.js';
import {APP_VERSION,safeAppReload,checkAppUpdate} from './app-update.js';
import {snapshotRect,geometryStable,inputPoint,eventSamples,acceptsPointer,rasterPlan} from './ink-input.js';
import {makeFontRecord,listCustomFonts,storeCustomFont,deleteCustomFont,loadCustomFace,customFontId} from './custom-fonts.js';
import {PAGE,FONTS,makeNote,smoothPoints,strokePath,escapeXml,History,validateNote,backupParts,id} from './core.js';
import {getNotes,saveNote,removeNote,saveNotesBatch,prepareNotesSave,removeNotesBatch,removePageSafely,listTrash,restoreTrash,emptyTrash} from './storage.js';
const inkSnapshotWarmer=createInkSnapshotWarmer({isBusy:()=>document.hidden||!!drawing||switching||(typeof documentBusy!=='undefined'&&documentBusy)||(typeof drawingTools!=='undefined'&&drawingTools?.hasGesture?.())||(typeof photoTools!=='undefined'&&photoTools?.hasGesture?.())});
const $=id=>document.getElementById(id);document.querySelector('.app').inert=true; const NS='http://www.w3.org/2000/svg';let notes=[],note,history=new History(),drawing=null,tool='pen',saveTimer,textBefore=null,accessToken='',recognizing=false,aiConfigured=false,switching=false;const revisions=new Map(),dirtyNotes=new Set(),pageHistories=new Map(),lastPages=new Map(),importSets=new Map();let customFonts=[],fontBusy=false,strokeRect=null,showResult=false;const customFaces=new Map();let autoEnabled=false,autoEngine=null,inkRevision=0,pendingAuto=false,sessionConsent=false,sessionAutoConsent=false;const converted=new Map();const recognitionResults=new Map(),retryWarnings=new Set();
const recognitionBudget=createRecognitionBudget();
let videoTools=null,videoExporter=null;let photoTools=null;let documentBusy=false;let editorMenus=null;let activeRecognition=null;let drawingTools=null;let pageSwipe=null;let paperViewport=null;
let selectedIds=[],selectedObjectIds=[],selectionEpoch=0,pendingSelected=false,pendingSelectionEpoch=null;
// Hold only accepted ink pointers; finger ink requires its explicit toggle. Page gestures/palms never enter.
const lineHold=createLineHold({radius:()=>3*900/Math.max(1,$('canvas').getBoundingClientRect().width),isActive:s=>drawing===s&&!s.kind&&tool==='pen'&&!document.hidden&&$('line-hold').checked&&geometryStable(strokeRect,$('canvas').getBoundingClientRect()),onChange:s=>{$('live').replaceChildren(path(s,true));}});
try{$('line-hold').checked=localStorage.getItem('nib-line-hold')!=='off';}catch{}
$('line-hold').onchange=()=>{lineHold.cancel();try{localStorage.setItem('nib-line-hold',$('line-hold').checked?'on':'off');}catch{}};
function clearSelection(){$('object-editor').hidden=true;selectionEpoch++;selectedIds=[];selectedObjectIds=[];$('selection-actions').hidden=true;$('lasso-path').toggleAttribute('hidden',true);$('selection-box').toggleAttribute('hidden',true);}
function drawSelection(rect=null){const base=drawing?.movePlan?drawing.visibleBounds:null,b=rect||(base?{...base,x:base.x+(drawing.dx||0),y:base.y+(drawing.dy||0)}:visibleSelectionBounds(note.strokes,selectionGroups(),selectedIds,selectedObjectIds)),el=$('selection-box');el.toggleAttribute('hidden',!b||tool!=='select'||drawing?.directTouch===true);if(b)for(const [k,v]of Object.entries(b))el.setAttribute(k,v);$('selection-actions').hidden=!b||tool!=='select'||!(selectedIds.length||selectedObjectIds.length)||drawing?.directTouch===true;$('selection-info').textContent=selectedIds.length+'획 · '+selectedObjectIds.length+'객체 선택';$('selection-convert').disabled=!selectedIds.length;$('selection-edit').disabled=selectedObjectIds.length!==1;$('selection-restore').disabled=!selectedObjectIds.length;}
function isWriting(){return true;}
function autoChanged(){inkRevision++;autoEngine?.changed();}
function committedCount(){const covered=new Set(activeConvertedGroups(note.convertedGroups||[],note.strokes).flatMap(g=>g.strokeIds));let count=0;for(const s of note.strokes){if(!covered.has(s.id))break;count++;}return count;}
function prefixText(count){const ids=new Set(note.strokes.slice(0,count).map(s=>s.id));const sourceGroups=activeConvertedGroups(note.convertedGroups||[],note.strokes),blocks=[];for(const g of sourceGroups){const last=blocks.at(-1);if(last&&/\n$/.test(last.at(-1).text))last.push(g);else blocks.push([g]);}const order=block=>Math.min(...block.map(g=>note.strokes.findIndex(s=>g.strokeIds.includes(s.id))));const groups=blocks.sort((a,b)=>order(a)-order(b)).flat();return groups.map((g,i)=>(i&&!/\s$/.test(groups[i-1].text)?(g.bounds.y>groups[i-1].bounds.y+groups[i-1].bounds.height+15?'\n':' '):'')+g.text).join('');}
function stopAuto(message=''){const was=autoEnabled;autoEnabled=false;autoEngine?.disable();if(message&&was)$('auto-status').textContent=message;if(was&&note)render();}

function effectiveFont(){return resolvedFont(note.font);}
function resolvedFont(font){return customFontId(font)&&!customFaces.has(font)?FONTS[0].id:font;}
function groupFont(group){return resolvedFont(group.font||note.font);}
function freezeGroupFonts(){note.convertedGroups=(note.convertedGroups||[]).map(g=>({...g,font:g.font||note.font,fontSize:g.fontSize||note.fontSize}));}
function chooseDefaultFont(font,size){change(()=>{freezeGroupFonts();if(font)note.font=font;if(size)note.fontSize=size;});}

function toast(text){$('toast').textContent=text;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4500)}
function date(t){return new Date(t).toLocaleDateString('ko-KR',{month:'long',day:'numeric'})}
function setSave(text,error=false){if(!error&&text!=='기기에 저장됨'&&$('save-state').classList.contains('error'))return;const quiet=!error;$('save-state').textContent=quiet?'':text;$('save-state').hidden=quiet;$('save-state').classList.toggle('error',error)}
function dirty(){note.updatedAt=Date.now();notes=notes.map(n=>n.id===note.id?note:n);dirtyNotes.add(note.id);setSave('저장 대기…');scheduleSave();buttons();}
function scheduleSave(){scheduleSave.since??=Date.now();clearTimeout(saveTimer);const remaining=2000-(Date.now()-scheduleSave.since);saveTimer=setTimeout(backgroundSave,Math.max(0,Math.min(350,remaining)));}
function backgroundSave(){if(drawing||(typeof drawingTools!=='undefined'&&drawingTools?.hasGesture?.())){if(Date.now()-(scheduleSave.since??Date.now())>=30000)setSave('아직 저장되지 않은 필기가 있어요 · 잠시 펜을 떼어주세요',true);clearTimeout(saveTimer);saveTimer=setTimeout(backgroundSave,50);return;}void flush().catch(e=>{setSave('저장 실패 · 백업 필요',true);toast(e.message||'저장 공간을 확인하고 백업을 내려받아주세요.');});}
const saveCoordinator=createSaveCoordinator({getPages:()=>notes,dirtyIds:dirtyNotes,revisions,prepareSave:prepareNotesSave,onSaved:waiting=>{if(!waiting)scheduleSave.since=null;setSave(waiting?'저장 대기…':'기기에 저장됨')},onError:e=>{setSave('저장 실패 · 백업 필요',true);toast(e.message||'저장 공간을 확인하고 백업을 내려받아주세요.');}});
async function flush(){clearTimeout(saveTimer);if(dirtyNotes.size)setSave('저장 중…');return saveCoordinator.flush();}
function rememberPage(){lastPages.set(notebookId(note),note.id);try{localStorage.setItem('nib-active-page',note.id);localStorage.setItem('nib-last-pages',JSON.stringify([...lastPages].slice(-100)))}catch{}}
function activatePage(page){videoTools?.suspend();if(typeof photoTools!=='undefined')photoTools?.deactivate();if(note&&notes.some(p=>p.id===note.id))pageHistories.set(note.id,history);note=page;history=pageHistories.get(page.id)||new History();pageHistories.delete(page.id);while(pageHistories.size>8)pageHistories.delete(pageHistories.keys().next().value);inkRevision++;showResult=false;rememberPage();render();if(typeof paperViewport!=='undefined')paperViewport?.reset();$('auto-status').textContent='글씨체는 폰트 · 글 입력은 텍스트 · 녹음은 회의록';}
async function transition(fn,{keepPagesOpen=false}={}){return runPageTransition({isBusy:()=>switching,begin:()=>{const restoreMenuFocus=!$('sidebar').hidden;stopAuto('노트 전환으로 자동 변환을 껐습니다.');switching=true;document.querySelector('.app').inert=true;return restoreMenuFocus;},prepare:()=>{endStroke();commitText();},flush,ready:()=>{clearSelection();$('ocr-dialog').close();if(!keepPagesOpen)$('pages-dialog').close();},onError:e=>toast(e.message||'페이지 전환에 실패했습니다. 원본을 확인해주세요.'),finish:restoreMenuFocus=>{switching=false;document.querySelector('.app').inert=false;if(keepPagesOpen&&$('pages-dialog').open)showPages();if(restoreMenuFocus&&$('sidebar').hidden)$('menu').focus();}},fn);}
function buttons(){if(typeof syncQuickTools!=='undefined')syncQuickTools();$('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length;$('empty-hint').hidden=!isWriting()||note.strokes.length>0||activeConvertedGroups(note.convertedGroups||[],note.strokes).length>0||(note.drawingObjects||[]).length>0||(note.photoObjects||[]).length>0||!!note.pdfBackground||!!drawing;}
const displayCache=new WeakMap();
function displayPoints(stroke,live=false){if(note.showOriginal||live||tool==='eraser'||['circle','ellipse','polygon'].includes(stroke.heldShape))return stroke.points;const key=String(note.smooth)+'/'+String(note.shapeCorrection===true),cached=displayCache.get(stroke);if(cached?.key===key)return cached.points;const shape=note.shapeCorrection===true?correctShape(stroke.points,{enabled:true}):null;const points=shape&&shape.kind!=='none'?shape.points:smoothPoints(stroke.points,note.smooth);displayCache.set(stroke,{key,points});return points;}
// Committed strokes are immutable; erase/undo/import replace references. Live ink
// bypasses this cache because its points grow in place.
const strokeNodeCache=new WeakMap();
function path(stroke,live=false){const points=displayPoints(stroke,live);if(!live){const cached=strokeNodeCache.get(stroke);if(cached?.points===points)return cached.node;}const el=document.createElementNS(NS,'g');el.innerHTML=live?liveStrokeSvg(stroke,points):strokeSvg(stroke,points);if(!live)strokeNodeCache.set(stroke,{points,node:el});return el;}
function visibleGroups(){if(note.showOriginal)return [];const groups=activeConvertedGroups(note.convertedGroups||[],note.strokes);if(!groups.length&&!note.strokes.length&&note.text&&!note.textPlacementMissing)return [{id:'typed',strokeIds:[],text:note.text,bounds:{x:72,y:156,width:756,height:900}}];return groups;}
let renderedTextTargets=[];
const renderedStrokeNodes=new Map(),previewInkNodes=new Set(),renderedTextNodes=new Map();let movePreviewFrame=null,movePreviewEpoch=0;
function resetInkMovePreview(){for(const node of previewInkNodes)node.removeAttribute('transform');previewInkNodes.clear();}
function cancelMovePreview(){movePreviewEpoch++;if(movePreviewFrame!==null){cancelAnimationFrame(movePreviewFrame);movePreviewFrame=null;}}
function paintMovePreview(gesture=drawing){
 if(!gesture||gesture!==drawing||gesture.kind!=='move'||gesture.before.id!==note.id||(gesture.movePlan&&note!==gesture.before))return;
 if(gesture.movePlan){
  // Lasso previews leave the saved note and cached stroke geometry untouched.
  // Transform each existing wrapper in place to preserve ink stacking order.
  const dx=gesture.dx||0,dy=gesture.dy||0,transform=`translate(${dx} ${dy})`;
  for(const id of gesture.movePlan.strokeIds){const node=renderedStrokeNodes.get(id);if(node){node.setAttribute('transform',transform);previewInkNodes.add(node);}}
  const groupIds=new Set(gesture.movePlan.groupIds),groups=new Map((note.convertedGroups||[]).map(g=>[g.id,g]));
  for(const id of groupIds){const group=groups.get(id);if(!group)continue;for(const record of renderedTextNodes.get(id)||[]){const x=group.bounds.x-record.bounds.x+dx,y=group.bounds.y-record.bounds.y+dy;record.wrapper.setAttribute('transform',`translate(${x} ${y})`);record.dx=x;record.dy=y;}}
  renderedTextTargets=renderedTextTargets.map(t=>{if(!groupIds.has(t.groupId))return t;const group=groups.get(t.groupId);if(!group)return t;const origin=t.ownerPosition||group.bounds,x=group.bounds.x+dx,y=group.bounds.y+dy;return {...t,bounds:{...t.bounds,x:t.bounds.x+x-origin.x,y:t.bounds.y+y-origin.y},ownerPosition:{x,y}};});
  drawSelection();return;
 }
 const groups=visibleGroups(),covered=new Set(groups.flatMap(g=>g.strokeIds)),visibleStrokeIds=new Set(note.strokes.filter(s=>!covered.has(s.id)).map(s=>s.id));
 // The drag-start note is a deep snapshot, so unrelated stroke references may
 // differ from the DOM's note. Classify by actually moved IDs, not references.
 gesture.previewStrokeIds??=gesture.directTouch?(gesture.before.convertedGroups||[]).find(g=>g.id===gesture.objectId)?.strokeIds||[]:completeSelection(gesture.before.strokes,gesture.before.convertedGroups||[],selectedIds,selectedObjectIds);
 if(gesture.previewStrokeIds.some(id=>visibleStrokeIds.has(id))||groups.length!==renderedTextNodes.size){renderInk();return;}
 for(const group of groups){const records=renderedTextNodes.get(group.id);if(!records?.length||records.some(r=>r.text!==group.text||r.font!==groupFont(group)||r.fontSize!==(group.fontSize||note.fontSize)||r.bounds.width!==group.bounds.width||r.bounds.height!==group.bounds.height)){renderInk();return;}}
 // clipPath uses the wrapper's user space: one transform moves its glyphs,
 // transparent hit surface and clipping together. Unrelated nodes stay intact.
 for(const group of groups)for(const record of renderedTextNodes.get(group.id)){
  const dx=group.bounds.x-record.bounds.x,dy=group.bounds.y-record.bounds.y;
  if(dx!==record.dx||dy!==record.dy){record.wrapper.setAttribute('transform',`translate(${dx} ${dy})`);record.dx=dx;record.dy=dy;}
 }
 const current=new Map(groups.map(g=>[g.id,g]));renderedTextTargets=renderedTextTargets.map(t=>{const b=current.get(t.groupId).bounds,origin=t.ownerPosition||b;return {...t,bounds:{...t.bounds,x:t.bounds.x+b.x-origin.x,y:t.bounds.y+b.y-origin.y},ownerPosition:{x:b.x,y:b.y}};});
 drawSelection();drawDirectOutline();
}
function queueMovePreview(){
 if(movePreviewFrame!==null)return;
 const gesture=drawing,pageId=note.id,epoch=movePreviewEpoch;
 movePreviewFrame=requestAnimationFrame(()=>{if(epoch!==movePreviewEpoch)return;movePreviewFrame=null;if(drawing===gesture&&note.id===pageId)paintMovePreview(gesture);});
}
function flushMovePreview(){cancelMovePreview();if(drawing?.kind==='move')paintMovePreview(drawing);}

function textTargets(){return renderedTextTargets.map(t=>({groupId:t.groupId,strokeIds:t.strokeIds,bounds:{...t.bounds}}));}
function drawDirectOutline(){const host=$('text-drag-outline');if(!drawing?.directTouch){host.replaceChildren();return;}host.replaceChildren(...drawing.hitBounds.map(b=>{const rect=document.createElementNS(NS,'rect');for(const [k,v]of Object.entries({...b,x:b.x+(drawing.dx||0),y:b.y+(drawing.dy||0)}))rect.setAttribute(k,v);return rect;}));}
let metrics;const layoutCache=new Map();
function groupLayout(group){
 const font=groupFont(group),fontSize=group.fontSize||note.fontSize;
 const key=JSON.stringify([note.id,group.id,group.text,group.bounds.width,group.bounds.height,font,fontSize,group.align,group.underline]);
 let cached=layoutCache.get(key);
 if(!cached){
  metrics??=document.createElement('canvas').getContext('2d');
  const preview=group.text.length>3000?group.text.slice(0,3000)+'…':group.text;
  const fit=layoutTextObject({...group,text:preview,bounds:{x:0,y:0,width:group.bounds.width,height:group.bounds.height}},fontSize,{measure:(text,size)=>{metrics.font=`${size}px ${font}, sans-serif`;return metrics.measureText(text).width}});
  const localBounds={x:0,y:0,width:group.bounds.width,height:group.bounds.height},row={text:preview,...fit};
  const geometry=glyphSelectionGeometry({...group,bounds:localBounds},{rows:[{...row,bounds:localBounds}]},(text,size)=>{metrics.font=`${size}px ${font}, sans-serif`;return metrics.measureText(text);});
  cached={row,geometry,overflow:fit.overflow||preview!==group.text};
  layoutCache.set(key,cached);if(layoutCache.size>256)layoutCache.delete(layoutCache.keys().next().value);
 }
 // Position is not typography. Keep cached line breaking independent of movement,
 // and return a fresh bounds snapshot so old export/drag plans cannot be mutated.
 const offset=b=>({...b,x:b.x+group.bounds.x,y:b.y+group.bounds.y});
 return {rows:[{...cached.row,bounds:{...group.bounds}}],geometry:{selectionBounds:offset(cached.geometry.selectionBounds),selectionRects:cached.geometry.selectionRects.map(offset)},overflow:cached.overflow,ambiguous:false};
}
/** Canvas metrics can differ from the visible SVG font (notably during font swaps).
 * Measure only attached glyph nodes, never the wrapper's transparent hit rectangles.
 * Keep the authoritative result local to the typography cache so dragging translates it.
 */
function syncRenderedGlyphGeometry(groups){
 for(const group of groups){
  const records=renderedTextNodes.get(group.id)||[],glyphs=records.flatMap(r=>r.glyphNodes||[]).filter(n=>n.textContent?.trim());
  if(!glyphs.length||glyphs.some(n=>typeof n.getBBox!=='function'))continue;
  const boxes=[];let failed=false;
  for(const node of glyphs){try{const b=node.getBBox();if(!b||!['x','y','width','height'].every(k=>Number.isFinite(b[k]))||b.width<=0||b.height<=0){failed=true;break;}boxes.push({x:b.x,y:b.y,width:b.width,height:b.height});}catch{failed=true;break;}}
  if(failed)continue; // Detached/hidden/unsupported SVG keeps the safe Canvas fallback.
  const layout=groupLayout(group);
  for(const row of layout.rows)for(const line of row.decorations||[]){const width=line.width||1;boxes.push({x:row.bounds.x+Math.min(line.x1,line.x2),y:row.bounds.y+line.y-width/2,width:Math.max(1,Math.abs(line.x2-line.x1)),height:Math.max(1,width)});}
  const geometry=clippedGlyphBoxes(group.bounds,boxes),key=JSON.stringify([note.id,group.id,group.text,group.bounds.width,group.bounds.height,groupFont(group),group.fontSize||note.fontSize,group.align,group.underline]);
  const cached=layoutCache.get(key);if(!cached)continue;
  const local=b=>({...b,x:b.x-group.bounds.x,y:b.y-group.bounds.y});
  cached.geometry={selectionBounds:local(geometry.selectionBounds),selectionRects:geometry.selectionRects.map(local)};
  renderedTextTargets=renderedTextTargets.filter(t=>t.groupId!==group.id);
  for(const record of records){
   for(const surface of record.hitSurfaces)surface.remove();record.hitSurfaces=[];
   for(const bounds of clippedGlyphBoxes(record.bounds,geometry.selectionRects).selectionRects){
    const surface=document.createElementNS(NS,'rect');for(const [k,v]of Object.entries(bounds))surface.setAttribute(k,v);
    surface.setAttribute('fill','transparent');surface.setAttribute('data-object-hit-surface','true');record.wrapper.append(surface);record.hitSurfaces.push(surface);
    renderedTextTargets.push({groupId:group.id,strokeIds:group.strokeIds,bounds:{...bounds},ownerPosition:{x:group.bounds.x,y:group.bounds.y}});
   }
  }
 }
 // Successful measurements must not reorder a lower object above a later
 // Canvas-fallback object. Hit testing follows the original SVG paint order.
 const order=new Map(groups.map((group,index)=>[group.id,index]));
 renderedTextTargets.sort((a,b)=>(order.get(a.groupId)??-1)-(order.get(b.groupId)??-1));
}
function selectionGroups(){if(note.showOriginal)return [];return (note.convertedGroups||[]).map(group=>({...group,...groupLayout(group).geometry}));}
// Append-only pen completion keeps existing SVG nodes attached. Rich pages use
// the full renderer until their text/object dependencies are independently tracked.
function renderCommittedStroke(stroke){
 if(note.mode!=='ink'||note.text||(note.convertedGroups||[]).length||(note.drawingObjects||[]).length||(note.photoObjects||[]).length||selectedIds.length||selectedObjectIds.length){renderInk();return;}
 const node=path(stroke);$('ink').append(node);renderedStrokeNodes.set(stroke.id,node);buttons();
}
function renderInk(){if(typeof videoTools!=='undefined')videoTools?.render();resetInkMovePreview();renderedStrokeNodes.clear();if(typeof photoTools!=='undefined')photoTools?.render();cancelMovePreview();renderedTextNodes.clear();if(typeof drawingTools!=='undefined')drawingTools?.render();drawSelection();drawDirectOutline();renderedTextTargets=[];const groups=visibleGroups(),covered=new Set(groups.flatMap(g=>g.strokeIds));$('ink').replaceChildren(...note.strokes.filter(s=>!covered.has(s.id)).map(s=>{const node=path(s);renderedStrokeNodes.set(s.id,node);return node;}));const nodes=[];let overflow=false,ambiguous=false;groups.forEach((group,index)=>{const layout=groupLayout(group);overflow||=layout.overflow;ambiguous||=layout.ambiguous;layout.rows.forEach((row,rowIndex)=>{const clip=document.createElementNS(NS,'clipPath'),rect=document.createElementNS(NS,'rect');clip.id='nib-group-clip-'+index+'-'+rowIndex;for(const [key,value]of Object.entries(row.bounds))rect.setAttribute(key,value);clip.append(rect);const wrapper=document.createElementNS(NS,'g'),glyphNodes=[],hitSurfaces=[];wrapper.setAttribute('clip-path','url(#'+clip.id+')');wrapper.setAttribute('data-text-object-id',group.id);wrapper.setAttribute('role','button');wrapper.setAttribute('tabindex','0');wrapper.setAttribute('aria-label','변환 글 선택: '+group.text.slice(0,60));wrapper.onkeydown=e=>{if(e.key!=='Enter'&&e.key!==' ')return;e.preventDefault();$('select').onclick();selectedObjectIds=[group.id];selectedIds=note.strokes.filter(s=>group.strokeIds.includes(s.id)).map(s=>s.id);drawSelection();$('selection-edit').focus();};for(const bounds of layout.geometry.selectionRects){const surface=document.createElementNS(NS,'rect');for(const [k,v]of Object.entries(bounds))surface.setAttribute(k,v);surface.setAttribute('fill','transparent');surface.setAttribute('data-object-hit-surface','true');wrapper.append(surface);hitSurfaces.push(surface);renderedTextTargets.push({groupId:group.id,strokeIds:group.strokeIds,bounds:{...bounds},ownerPosition:{x:group.bounds.x,y:group.bounds.y}});}row.lines.forEach((line,lineIndex)=>{const text=document.createElementNS(NS,'text');text.setAttribute('x',row.bounds.x+(row.x||0));text.setAttribute('text-anchor',row.anchor||'start');text.setAttribute('y',row.bounds.y+row.fontSize*.9+lineIndex*row.lineHeight);text.setAttribute('font-size',row.fontSize);text.setAttribute('font-family',groupFont(group)+', sans-serif');text.setAttribute('fill','#223247');text.textContent=line;wrapper.append(text);glyphNodes.push(text);});for(const decoration of row.decorations||[]){const line=document.createElementNS(NS,'line');for(const [k,v]of Object.entries({x1:row.bounds.x+decoration.x1,x2:row.bounds.x+decoration.x2,y1:row.bounds.y+decoration.y,y2:row.bounds.y+decoration.y,stroke:'#223247','stroke-width':decoration.width}))line.setAttribute(k,v);wrapper.append(line);}const records=renderedTextNodes.get(group.id)||[];records.push({wrapper,glyphNodes,hitSurfaces,bounds:{...row.bounds},text:group.text,font:groupFont(group),fontSize:group.fontSize||note.fontSize,dx:0,dy:0});renderedTextNodes.set(group.id,records);nodes.push(clip,wrapper)})});$('converted-ink').replaceChildren(...nodes);syncRenderedGlyphGeometry(groups);drawSelection();$('group-overflow').hidden=!overflow;$('object-recovery').hidden=!groups.some(g=>g.recovery==='legacy-text');$('row-placement-warning').hidden=!ambiguous;$('legacy-result').hidden=!(note.mode==='text'&&note.text&&(note.strokes.length||note.textPlacementMissing)&&!activeConvertedGroups(note.convertedGroups||[],note.strokes).length);buttons();if(drawing?.movePlan)paintMovePreview(drawing);}
function list(){
 const books=listNotebooks(notes),current=notebookId(note);$('note-count').textContent=books.length;
 $('note-list').replaceChildren(...books.map(book=>{const b=document.createElement('button');b.dataset.noteId=book.id;b.className='note-item'+(book.id===current?' active':'');b.setAttribute('aria-current',book.id===current?'page':'false');const strong=document.createElement('strong');strong.textContent=book.title||'제목 없는 노트';const small=document.createElement('small');small.textContent=book.count+'페이지';b.append(strong,small);b.onclick=()=>openNotebook(book.id);return b;}));
 if(typeof workspaceTabs!=='undefined')workspaceTabs.render();else $('note-tabs').replaceChildren(...books.map(book=>{const b=document.createElement('button');b.dataset.noteId=book.id;b.className='note-tab'+(book.id===current?' active':'');b.textContent=book.title||'제목 없는 노트';b.setAttribute('aria-current',book.id===current?'page':'false');b.onclick=()=>openNotebook(book.id);return b;}));
 const pages=pagesFor(notes,current),position=pages.findIndex(p=>p.id===note.id);$('page-position').textContent=(position+1)+' / '+pages.length;$('visible-page-position').textContent=(position+1)+' / '+pages.length+' 페이지';$('visible-page-position').setAttribute('aria-label','현재 '+(position+1)+'페이지, 전체 '+pages.length+'페이지 · 페이지 목록 열기');$('visible-previous-page').disabled=position<=0;$('visible-next-page').disabled=position>=pages.length-1;$('previous-page').disabled=position<=0;$('next-page').disabled=position>=pages.length-1;$('add-page').disabled=notes.length>=1000;$('delete-page').disabled=pages.length<=1;$('delete-page').title=pages.length<=1?'노트에는 최소 한 페이지가 필요합니다.':'현재 '+(position+1)+'페이지 삭제';
}
function openNotebook(key){const pages=pagesFor(notes,key),page=pages.find(p=>p.id===lastPages.get(key))||pages[0];if(page&&page.id!==note.id)return switchNote(page.id);setSidebar(false);}
let pageOverviewOffset=0;
function showPages(reset=true){endStroke();$('pages-title').textContent=(note.title||'제목 없는 노트')+' · 페이지';const pages=pagesFor(notes,notebookId(note));if(reset)pageOverviewOffset=Math.floor(Math.max(0,pages.findIndex(p=>p.id===note.id))/24)*24;$('pages-status').textContent='현재 '+(pages.findIndex(p=>p.id===note.id)+1)+' / '+pages.length+' 페이지';$('pages-delete').disabled=pages.length<=1;$('pages-delete').title=pages.length<=1?'노트에는 최소 한 페이지가 필요합니다.':'현재 '+(pages.findIndex(p=>p.id===note.id)+1)+'페이지 삭제';$('pages-add').disabled=notes.length>=1000;if($('pages-copy')){$('pages-copy').disabled=notes.length>=1000;$('pages-up').disabled=pages[0]?.id===note.id;$('pages-down').disabled=pages.at(-1)?.id===note.id;}$('page-list').replaceChildren(...pages.slice(pageOverviewOffset,pageOverviewOffset+24).map((page,j)=>{const i=pageOverviewOffset+j;const b=document.createElement('button');b.className='page-card';b.setAttribute('aria-current',page.id===note.id?'page':'false');b.setAttribute('aria-label',(i+1)+'페이지 열기');const thumb=document.createElement('div');thumb.className='page-thumbnail';thumb.innerHTML=renderPagePreview(page);thumb.setAttribute('aria-hidden','true');const title=document.createElement('strong');title.textContent=(i+1)+'페이지'+(typeof page.bookmark==='string'&&page.bookmark.trim()?' · ★ '+page.bookmark.trim().slice(0,80):'');const small=document.createElement('small');small.textContent=page.text? page.text.slice(0,70):page.strokes.length?'필기 '+page.strokes.length+'획':'빈 페이지';b.append(thumb,title,small);b.onclick=()=>switchNote(page.id);return b;}));$('pages-more').hidden=pages.length<=pageOverviewOffset+24;$('pages-previous').hidden=pageOverviewOffset===0;if(!$('pages-dialog').open)$('pages-dialog').showModal();}
$('pages-more').onclick=()=>{pageOverviewOffset+=24;showPages(false)};$('pages-previous').onclick=()=>{pageOverviewOffset=Math.max(0,pageOverviewOffset-24);showPages(false)};$('pages-add').onclick=()=>addPage({keepPagesOpen:$('pages-dialog').open});$('pages-delete').onclick=()=>deleteCurrentPage({keepPagesOpen:$('pages-dialog').open});
$('visible-page-position').onclick=()=>showPages();$('visible-previous-page').onclick=()=>$('previous-page').onclick();$('visible-next-page').onclick=()=>$('next-page').onclick();$('page-position').onclick=showPages;$('close-pages').onclick=()=>$('pages-dialog').close();
$('previous-page').onclick=()=>{const pages=pagesFor(notes,notebookId(note)),i=pages.findIndex(p=>p.id===note.id);if(i>0)return switchNote(pages[i-1].id);};
$('next-page').onclick=()=>{const pages=pagesFor(notes,notebookId(note)),i=pages.findIndex(p=>p.id===note.id);if(i<pages.length-1)return switchNote(pages[i+1].id);};
function addPage({keepPagesOpen=false}={}){return transition(async()=>{if(notes.length>=1000)return toast('전체 1,000페이지까지 저장할 수 있습니다. 먼저 백업해주세요.');const page=createPage(notes,note);const revision=await saveNote(page);revisions.set(page.id,revision);notes.push(page);activatePage(page);setSave('기기에 저장됨');setSidebar(false);},{keepPagesOpen});}
$('add-page').onclick=()=>addPage();
async function deleteCurrentPage({keepPagesOpen=false}={}){
 if(switching)return false;const target=note,bookId=notebookId(target),pages=pagesFor(notes,bookId),index=pages.findIndex(p=>p.id===target.id);
 if(pages.length<=1){toast('노트에는 최소 한 페이지가 필요합니다. 노트 전체 삭제는 서재에서 해주세요.');return false;}
 const warning=activeRecognition?.noteId===target.id?' 진행 중인 AI 응답 기다리기도 취소합니다. 이미 전송한 요청의 비용은 취소되지 않을 수 있습니다.':'';
 if(!confirm('“'+(target.title||'제목 없는 노트')+'”의 '+(index+1)+' / '+pages.length+'페이지만 삭제할까요? 이 페이지는 휴지통으로 이동하며 나중에 복원할 수 있습니다. 다른 페이지는 유지됩니다.'+warning))return false;
 let deleted=false;await transition(async()=>{
  if(note.id!==target.id)throw Error('페이지가 바뀌었습니다. 삭제할 페이지를 다시 확인해주세요.');
  const deletion=await removePageSafely(target.id,revisions.get(target.id)||0);
  if(activeRecognition?.noteId===target.id)activeRecognition.controller.abort();
  const oldIds=pagesFor(notes,bookId).map(p=>p.id),fresh=deletion.remainingPages.map(validateNote);
  // Reload this notebook's committed transaction snapshot, not stale sibling
  // objects from another tab. Discard incompatible per-page undo/result caches.
  for(const key of oldIds){const prior=notes.find(p=>p.id===key),latest=fresh.find(p=>p.id===key),unchanged=latest&&JSON.stringify(prior)===JSON.stringify(latest);revisions.delete(key);if(!unchanged){for(const map of [pageHistories,recognitionResults,converted])map.delete(key);retryWarnings.delete(key);}dirtyNotes.delete(key);}
  for(const [key,rev]of deletion.revisions)revisions.set(key,rev);
  const bookSlot=notes.findIndex(p=>notebookId(p)===bookId);notes=notes.filter(p=>notebookId(p)!==bookId);notes.splice(Math.min(bookSlot,notes.length),0,...fresh);const remaining=pagesFor(notes,bookId),next=remaining[Math.min(index,remaining.length-1)];
  lastPages.set(bookId,next.id);activatePage(next);setSave('기기에 저장됨');deleted=true;void trashView?.refresh();toast((index+1)+'페이지를 삭제했습니다. 다른 페이지는 유지됩니다.');
 },{keepPagesOpen});return deleted;
}
$('delete-page').onclick=()=>deleteCurrentPage();
function updateRecognitionActions(){$('retry-recognition').hidden=!retryWarnings.has(note?.id);$('saved-recognition').hidden=!recognitionResults.has(note?.id);}
function confirmRecognitionRetry(){if(!retryWarnings.has(note.id))return true;if(!confirm('이전 인식 요청에 이미 비용이 발생했을 수 있습니다. 다시 전송하면 추가 비용이 생길 수 있어요. 다시 시도할까요?'))return false;retryWarnings.delete(note.id);updateRecognitionActions();return true;}
function render(){syncPagePen();updateRecognitionActions();$('meeting-pdf').hidden=note.notebookKind!=='meeting';$('title').value=note.title;$('current-pen-label').textContent=PEN_KINDS.find(p=>p.id===note.penKind)?.label||'볼펜';$('open-pen').querySelector('img').src='./tool-icons/'+(PEN_KINDS.find(p=>p.id===note.penKind)?.id||'ballpoint')+'.webp';$('date').textContent=date(note.updatedAt);$('page-date').textContent=new Date(note.createdAt).toLocaleDateString('en-CA');$('page').className='page '+note.paper+(isChalkboard(note)?' chalkboard':'');$('paper-background').innerHTML=paperBackgroundSvg(note);$('paper').value=note.paper;$('smooth').value=note.smooth*100;$('shape-correct').checked=note.shapeCorrection===true;$('original').setAttribute('aria-pressed',note.showOriginal);$('original').textContent=note.showOriginal?'변환·보정 보기':'원본 획 보기';const ink=note.mode==='ink';$('mode-label').textContent=note.showOriginal?'원본 손글씨 보기':autoEnabled?'한 페이지 · 필기와 텍스트':'한 페이지 · 필기와 텍스트';$('ink-mode').setAttribute('aria-pressed',ink);$('text-mode').setAttribute('aria-pressed',!ink);const writing=isWriting();$('ink-tools').hidden=!writing;$('ink-settings').hidden=!ink;$('text-settings').hidden=ink;$('canvas').toggleAttribute('hidden',false);$('font-size').value=note.fontSize;$('detail').textContent='필기·텍스트·사진 · 녹음 회의록 · PDF 주석';for(const b of $('font-options').querySelectorAll('[data-font]'))b.classList.toggle('active',b.dataset.font===note.font);$('missing-font').hidden=!(customFontId(note.font)&&!customFaces.has(note.font));renderInk();list();if(typeof inkSnapshotWarmer!=='undefined')inkSnapshotWarmer.start(note);}
async function switchNote(key){if(key===note.id){$('pages-dialog').close();return;}return transition(async()=>{const page=notes.find(n=>n.id===key);if(!page)return;activatePage(page);setSidebar(false);});}
function change(fn){endStroke();commitText();const before=JSON.stringify(note.strokes),text=note.text;history.push(note);fn();dirty();if(before!==JSON.stringify(note.strokes)||text!==note.text)autoChanged();render();}
function commitText(){if(textBefore&&textBefore.text!==note.text)history.push(textBefore);textBefore=null;buttons()}
function eraserRadius(){return Math.max(4,Math.min(80,Number($('eraser-size').value)||24));}
function showEraser(p){const circle=$('eraser-cursor'),hidden=tool!=='eraser'||$('pan-page').checked||!p;circle.toggleAttribute('hidden',hidden);if(!hidden){circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r',eraserRadius());}}
function eraseSegment(from,to,deferRender=false){
 if(drawing?.kind!=='erase')return;
 // Erase only visible ink. Converted text keeps its hidden source intact.
 const protectedIds=new Set(visibleGroups().flatMap(group=>group.strokeIds));
 const result=eraseStrokes(note.strokes,from,to,drawing.radius,{idFactory:id,includeStrokeWidth:true,protectedIds});
 const objects=eraseDrawingObjects(note.drawingObjects||[],from,to,drawing.radius);
 if(!result.changed&&!objects.changed)return;
 if(result.changed&&(result.strokes.length>5000||result.strokes.reduce((sum,s)=>sum+s.points.length,0)>300000)){toast('필기 조각이 너무 많아 더 지울 수 없습니다. 백업 후 새 노트를 사용해주세요.');return;}
 if(!drawing.changed){history.push(note);drawing.changed=true;}
 if(result.changed){note.strokes=result.strokes;if(!note.strokes.length&&note.text&&!activeConvertedGroups(note.convertedGroups||[],note.strokes).length)note.textPlacementMissing=true;}
 if(objects.changed)note.drawingObjects=objects.objects;
 if(deferRender){drawing.needsCommit=true;drawing.needsRender=true;}else{dirty();autoChanged();renderInk();}
}
// Model changes stay synchronous for autosave/undo. Only painting waits for a frame.
function flushEraserRender(){
 const gesture=drawing;
 if(gesture?.kind!=='erase')return;
 if(gesture.eraseFrame!=null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(gesture.eraseFrame);
 gesture.eraseFrame=null;
 if(gesture.needsRender){gesture.needsRender=false;renderInk();}
}
function queueEraserRender(){
 const gesture=drawing;
 if(gesture?.kind!=='erase'||!gesture.needsRender)return;
 if(typeof requestAnimationFrame!=='function'){flushEraserRender();return;}
 if(gesture.eraseFrame!=null)return;
 gesture.eraseFrame=requestAnimationFrame(()=>{if(drawing!==gesture)return;gesture.eraseFrame=null;flushEraserRender();});
}
function endStroke(commitMove=false,discardInk=false){flushEraserRender();cancelLiveInk();if(typeof lineHold!=='undefined')lineHold.cancel();if(typeof photoTools!=='undefined')photoTools?.cancel?.();if(commitMove)flushMovePreview();else cancelMovePreview();if(typeof pageSwipe!=='undefined')pageSwipe?.cancel();if(typeof drawingTools!=='undefined')drawingTools?.cancel();if(!drawing)return;const s=drawing;drawing=null;autoEngine?.setWriting?.(false);strokeRect=null;$('live').replaceChildren();if($('canvas').hasPointerCapture?.(s.pointerId))$('canvas').releasePointerCapture(s.pointerId);if(s.kind==='select'||s.kind==='move'){if(s.movePlan&&note!==s.before){clearSelection();drawDirectOutline();renderInk();buttons();return;}if(s.movePlan&&commitMove){const moved=moveSelection(s.before,s.movePlan.strokeIds,s.dx||0,s.dy||0,s.movePlan.objectIds,s.geometryGroups);note=moved.note;s.changed=moved.moved;renderInk();}if(!commitMove){if(s.kind==='move'&&s.changed)note=s.before;clearSelection();drawDirectOutline();renderInk();buttons();return;}if(s.directTouch&&(!s.changed||(s.maxScreenDistance||0)<4)){note=s.before;$('select').onclick();selectedObjectIds=[s.objectId];selectedIds=note.strokes.filter(stroke=>(note.convertedGroups||[]).find(g=>g.id===s.objectId)?.strokeIds.includes(stroke.id)).map(stroke=>stroke.id);drawSelection();renderInk();$('auto-status').textContent='글씨 객체를 선택했습니다. 선택 삭제로 지우거나 테두리 안을 끌어 이동하세요.';return;}if(s.kind==='move'&&s.changed){history.push(s.before);dirty();autoChanged();}if(s.directTouch){clearSelection();drawDirectOutline();}if(s.kind==='select'){const hit=selectRegionDetailed(note.strokes,selectionGroups(),s.lasso||s.rect,!!s.lasso);selectedIds=hit.strokeIds;selectedObjectIds=hit.objectIds||[];selectionEpoch++;$('lasso-path').toggleAttribute('hidden',true);drawSelection();$('auto-status').textContent=hit.partialGroupIds.length?'일부만 걸친 변환 묶음은 선택하지 않았어요. 원하는 줄 또는 묶음 전체를 둘러주세요.':(selectedIds.length||selectedObjectIds.length)?'선택한 글 안쪽을 끌어서 이동하세요. 한 번에 실행 취소할 수 있어요.':'선택할 글을 올가미로 둘러주세요.';}buttons();return;}if(s.kind==='erase'){buttons();return;}if(s.points.length&&!discardInk){sealCommittedStroke(s);history.pushStroke(note,s);note.strokes.push(s);dirty();autoChanged();renderCommittedStroke(s);}}
function cancelLiveInk(){if(queueLiveInk.frame!=null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(queueLiveInk.frame);queueLiveInk.frame=null;queueLiveInk.epoch=(queueLiveInk.epoch||0)+1;}
function queueLiveInk(){if(!drawing||drawing.kind)return;if(typeof requestAnimationFrame!=='function'){$('live').replaceChildren(path(drawing,true));return;}if(queueLiveInk.frame!=null)return;const stroke=drawing,epoch=queueLiveInk.epoch||0;queueLiveInk.frame=requestAnimationFrame(()=>{if(epoch!==(queueLiveInk.epoch||0))return;queueLiveInk.frame=null;if(drawing===stroke&&!stroke.kind)$('live').replaceChildren(path(stroke,true));});}
function appendSamples(e){if(!drawing||drawing.pointerId!==e.pointerId)return;if(drawing.movePlan&&note!==drawing.before){endStroke();return;}if(!geometryStable(strokeRect,$('canvas').getBoundingClientRect())){endStroke();showEraser(null);toast('화면 위치가 바뀌어 현재 획을 마쳤어요. 이어서 써주세요.');return;}for(const sample of eventSamples(e)){const p=inputPoint(sample,strokeRect);if(!p)continue;if(drawing.kind==='select'){if(drawing.lasso){if(Math.hypot(p.x-drawing.lasso.at(-1).x,p.y-drawing.lasso.at(-1).y)>=3){if(drawing.lasso.length>=600)drawing.lasso=drawing.lasso.filter((_,i)=>i%2===0);drawing.lasso.push(p);}$('lasso-path').setAttribute('d',drawing.lasso.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ')+' Z');$('lasso-path').toggleAttribute('hidden',false);continue;}drawing.rect={x:Math.min(drawing.start.x,p.x),y:Math.min(drawing.start.y,p.y),width:Math.abs(p.x-drawing.start.x),height:Math.abs(p.y-drawing.start.y)};drawSelection(drawing.rect);continue;}if(drawing.kind==='move'){drawing.maxScreenDistance=Math.max(drawing.maxScreenDistance||0,Math.hypot((p.x-drawing.start.x)*strokeRect.width/900,(p.y-drawing.start.y)*strokeRect.height/1200));if(!drawing.directTouch&&!drawing.changed&&Math.hypot((p.x-drawing.start.x)*strokeRect.width/900,(p.y-drawing.start.y)*strokeRect.height/1200)<6)continue;const moved=drawing.movePlan?selectionMoveOffset(drawing.movePlan,p.x-drawing.start.x,p.y-drawing.start.y):drawing.directTouch?moveTextObject(drawing.before,drawing.objectId,p.x-drawing.start.x,p.y-drawing.start.y,drawing.geometryGroups):moveSelection(drawing.before,selectedIds,p.x-drawing.start.x,p.y-drawing.start.y,selectedObjectIds,drawing.geometryGroups);if(moved.moved&&!drawing.changed)drawing.changed=true;if(drawing.changed){drawing.dx=moved.dx;drawing.dy=moved.dy;if(!drawing.movePlan)note=moved.note;queueMovePreview();}continue;}if(drawing.kind==='erase'){eraseSegment(drawing.last,p,true);drawing.last=p;continue;}const prev=drawing.points.at(-1);if(Math.hypot(p.x-prev.x,p.y-prev.y)>.4&&drawing.points.length<Math.min(12000,drawing.remaining))drawing.points.push(p);}if(drawing&&!drawing.kind&&typeof lineHold!=='undefined')lineHold.update(drawing);if(drawing?.kind==='erase'){showEraser(drawing.last);if(drawing.needsCommit){drawing.needsCommit=false;dirty();autoChanged();}queueEraserRender();}}
function captureInkPointer(pointerId){try{$('canvas').setPointerCapture?.(pointerId);}catch{/* Document fallback owns accepted ink until release. */}}
$('canvas').addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&typeof activePenPointers!=='undefined'&&activePenPointers.size)return;if(e.pointerType==='pen'&&drawing?.pointerType==='touch')endStroke(false,true);if(typeof photoTools!=='undefined'&&photoTools?.isActive())return;if(!$('touch').checked&&tool!=='select'&&acceptDirectTouch(e,{activePointer:drawing?.pointerId??null,pan:$('pan-page').checked,mode:visibleGroups().length?'text':note.mode,original:note.showOriginal,tool})){
 const rect=snapshotRect($('canvas').getBoundingClientRect()),p=inputPoint(e,rect),targets=textTargets(),hit=hitTestText(p,targets);
 if(hit){e.preventDefault();stopAuto('변환 글을 옮기는 동안 자동 변환을 껐습니다.');clearSelection();selectedIds=[...hit.strokeIds];selectionEpoch++;strokeRect=rect;drawing={kind:'move',directTouch:true,objectId:hit.groupId,pointerId:e.pointerId,start:p,before:structuredClone(note),geometryGroups:selectionGroups(),changed:false,hitBounds:targets.filter(t=>t.groupId===hit.groupId).map(t=>({...t.bounds})),dx:0,dy:0};autoEngine?.setWriting?.(true);captureInkPointer(e.pointerId);drawDirectOutline();$('auto-status').textContent='손가락을 누른 채 바로 끌어 이동하세요. 한 번 변환한 글 전체가 하나의 객체로 이동합니다.';return;}
 }if(e.pointerType==='touch'&&(e.isPrimary===false||(!$('touch').checked&&(e.width>40||e.height>40))))return;if(!acceptsPointer(e,{pan:$('pan-page').checked,touch:tool==='select'||$('touch').checked,active:drawing?.pointerId??null}))return;e.preventDefault();strokeRect=snapshotRect($('canvas').getBoundingClientRect());const p=inputPoint(e,strokeRect);if(!p||!isWriting())return;if(tool==='select'){stopAuto('글을 선택·이동하는 동안 자동 변환을 껐습니다. 이동 후 다시 켜주세요.');const b=visibleSelectionBounds(note.strokes,selectionGroups(),selectedIds,selectedObjectIds);const inside=b&&p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height;if(inside){const geometryGroups=selectionGroups();drawing={kind:'move',pointerId:e.pointerId,start:p,before:note,geometryGroups,movePlan:prepareSelectionMove(note,selectedIds,selectedObjectIds,geometryGroups),visibleBounds:b,dx:0,dy:0,changed:false};}else{clearSelection();drawing={kind:'select',pointerId:e.pointerId,start:p,rect:{x:p.x,y:p.y,width:0,height:0},lasso:[p]};}autoEngine?.setWriting?.(true);captureInkPointer(e.pointerId);return;}if(tool==='eraser'){clearSelection();stopAuto('지우개를 사용해 자동 변환을 껐습니다. 수정 후 다시 켜주세요.');drawing={kind:'erase',pointerId:e.pointerId,last:p,radius:eraserRadius(),changed:false};captureInkPointer(e.pointerId);showEraser(p);eraseSegment(p,p);buttons();return;}if(note.strokes.length>=5000||note.strokes.reduce((n,s)=>n+s.points.length,0)>=300000){toast('이 페이지가 가득 찼어요. 새 노트를 만들어주세요.');return}drawing={id:id(),remaining:Math.max(1,300000-note.strokes.reduce((n,s)=>n+s.points.length,0)),points:[p],penKind:normalizePenKind(note.penKind),width:Number($('width').value),color:$('color').value,pointerId:e.pointerId,pointerType:e.pointerType};autoEngine?.setWriting?.(true);captureInkPointer(e.pointerId);if(typeof lineHold!=='undefined'&&(e.pointerType==='pen'||e.pointerType==='mouse'||(e.pointerType==='touch'&&$('touch').checked))&&$('line-hold').checked)lineHold.start(drawing);$('live').replaceChildren(path(drawing,true));buttons();});
$('canvas').addEventListener('pointermove',e=>{if(!drawing){if(tool==='eraser'&&e.pointerType!=='touch')showEraser(inputPoint(e,snapshotRect($('canvas').getBoundingClientRect())));return;}if(drawing.pointerId!==e.pointerId)return;e.preventDefault();appendSamples(e);if(drawing&&!drawing.kind)queueLiveInk();});
$('canvas').addEventListener('pointerup',e=>{if(drawing?.pointerId!==e.pointerId)return;appendSamples(e);endStroke(true)});
$('canvas').addEventListener('pointerleave',()=>{if(!drawing)showEraser(null)});
// Browser/OS interruption is not a deliberate pinch: preserve accepted ink.
$('canvas').addEventListener('pointercancel',e=>{if(drawing?.pointerId===e.pointerId){endStroke();showEraser(null)}});
$('canvas').addEventListener('lostpointercapture',e=>{
 if(drawing?.pointerId!==e.pointerId)return;
 // Ink may continue through document-level events when a WebView drops capture.
 // Selection and move previews still roll back on losing ownership.
 if(drawing.kind){endStroke();showEraser(null);}
});
for(const name of ['pointermove','pointerup','pointercancel'])document.addEventListener(name,e=>{
 if(drawing?.pointerId!==e.pointerId||drawing.kind||e.target===$('canvas')||$('canvas').contains?.(e.target))return;
 if(e.cancelable)e.preventDefault();
 if(name==='pointercancel'){endStroke();return;}
 appendSamples(e);
 if(name==='pointerup')endStroke(true);else if(drawing)queueLiveInk();
},{passive:false});
// Active Pencil contact suppresses palm-driven touch scrolling outside the paper.
// Paper touch gestures are owned by pageSwipe; its zoom never changes the chrome.
const activePenPointers=new Set();
document.addEventListener('pointerdown',e=>{if(e.pointerType==='pen'&&(e.target===$('canvas')||$('canvas').contains?.(e.target)))activePenPointers.add(e.pointerId)},{capture:true});
for(const type of ['pointerup','pointercancel'])document.addEventListener(type,e=>activePenPointers.delete(e.pointerId),{capture:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)activePenPointers.clear()});
for(const name of ['touchmove','wheel'])document.addEventListener(name,e=>{const block=name==='touchmove'?activePenPointers.size>0:(drawing||(typeof drawingTools!=='undefined'&&drawingTools?.hasGesture?.()));if(block&&e.cancelable)e.preventDefault()},{passive:false,capture:true});
$('pan-page').onchange=()=>{endStroke();showEraser(null);$('canvas').classList.toggle('page-pan',$('pan-page').checked);$('canvas').classList.toggle('erasing',tool==='eraser'&&!$('pan-page').checked);$('touch').disabled=$('pan-page').checked;toast($('pan-page').checked?'한 손가락으로 종이를 위아래로 움직입니다. 글·표 위에서도 좌우로 짧게 쓸면 페이지가 넘어가요. 마지막 페이지에서 왼쪽으로 길게 끌면 새 페이지를 추가해요.':'필기 모드입니다. 화면은 고정되고 한 손가락 위아래로 종이를 이동하며, 두 손가락으로 확대할 수 있어요.');};
function syncFingerMode(){const enabled=$('touch').checked,button=$('finger-drawing');if(button){button.classList.toggle('active',enabled);button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'손가락 쓰기 끄기 · 펜 전용으로 전환':'손가락 쓰기 켜기 · 기본은 펜 전용');button.title=enabled?'한 손가락 필기 · 두 손가락 확대/이동 · 페이지 이동은 화살표':'펜 전용 · 손가락 쓰기를 누르면 손가락으로도 필기';}}
$('touch').onchange=()=>{endStroke(false,drawing?.pointerType==='touch');if($('touch').checked){if(typeof drawingTools!=='undefined')drawingTools?.deactivate?.();if(typeof photoTools!=='undefined')photoTools?.deactivate?.();$('pen')?.onclick?.();}syncFingerMode();toast($('touch').checked?'손가락 쓰기: 한 손가락으로 필기하고 두 손가락으로 확대·이동하세요. 페이지 이동은 화살표를 사용하세요.':'펜 전용: 손가락 필기를 껐습니다. 한 손가락 페이지 넘김·이동을 다시 사용할 수 있어요.');};
if($('finger-drawing'))$('finger-drawing').onclick=()=>{$('touch').checked=!$('touch').checked;$('touch').onchange();};
$('eraser-size').onchange=()=>{endStroke();showEraser(null)};
for(const name of ['pen','eraser','select'])$(name).onclick=()=>{endStroke();tool=name;clearSelection();$('pan-page').checked=false;$('canvas').classList.remove('page-pan');$('touch').disabled=false;$('canvas').classList.toggle('selecting',name==='select');$('eraser-options').hidden=name!=='eraser';$('canvas').classList.toggle('erasing',name==='eraser'&&!$('pan-page').checked);showEraser(null);for(const other of ['pen','eraser','select']){$(other).classList.toggle('active',name===other);$(other).setAttribute('aria-pressed',name===other)}renderInk();$('auto-status').textContent=name==='select'?'글을 올가미로 둘러 선택한 뒤, 안쪽을 끌어 이동하세요. 변환 글은 원본 묶음과 함께 이동합니다.':name==='eraser'?'지우개: 필기는 닿은 부분을, 그림·표는 객체 전체를 지웁니다. 텍스트는 올가미로 선택 후 선택 삭제하세요. 지우기는 실행 취소할 수 있어요.':autoEnabled?'펜으로 쓰면 멈춘 뒤 자동 변환합니다.':'펜으로 바로 쓰세요. 글씨체는 폰트, 글 입력은 텍스트에서 선택하세요.'};

$('new-note').onclick=()=>{endStroke();stopAuto('새 노트를 만드는 동안 자동 변환을 껐습니다.');return notebookEditor.open();};
$('title').oninput=()=>{const title=$('title').value;for(const page of pagesFor(notes,notebookId(note))){page.title=title;page.updatedAt=Date.now();dirtyNotes.add(page.id);}dirty();for(const b of $('note-tabs').querySelectorAll('button'))if(b.dataset.noteId===notebookId(note))b.textContent=title||'제목 없는 노트';for(const b of $('note-list').querySelectorAll('button'))if(b.dataset.noteId===notebookId(note))b.querySelector('strong').textContent=title||'제목 없는 노트';};
$('ink-mode').onclick=()=>{clearSelection();stopAuto('내 필체 모드로 전환해 자동 변환을 껐습니다.');change(()=>{note.mode='ink';showResult=false})};$('text-mode').onclick=()=>{clearSelection();change(()=>{note.mode='text';showResult=false})};

$('undo').onclick=()=>{stopAuto('실행 취소를 보존하기 위해 자동 변환을 껐습니다.');endStroke();commitText();clearSelection();{const bookmark=note.bookmark,pageOrder=note.pageOrder,title=note.title,favorite=note.favorite,cover=note.cover,binding=note.binding,coverTitleSize=note.coverTitleSize,paperTheme=note.paperTheme,paper=note.paper,penKind=note.penKind,penSettings=note.penSettings,perPenWidths=note.perPenWidths,perPenColors=note.perPenColors,chalkboardPrevious=note.chalkboardPrevious;note=history.undo(note);note.pageOrder=pageOrder;if(bookmark===undefined)delete note.bookmark;else note.bookmark=bookmark;const wasBoard=note.paperTheme==='chalkboard';note.title=title;note.favorite=favorite;note.cover=cover;note.binding=binding;note.coverTitleSize=coverTitleSize;note.paperTheme=paperTheme;note.penKind=penKind;note.penSettings=penSettings;note.perPenWidths=perPenWidths;note.perPenColors=perPenColors;note.chalkboardPrevious=chalkboardPrevious;if(note.paperTheme==='chalkboard')note.paper='plain';else if(wasBoard)note.paper=paper;}autoChanged();dirty();render()};$('redo').onclick=()=>{stopAuto();endStroke();commitText();clearSelection();{const bookmark=note.bookmark,pageOrder=note.pageOrder,title=note.title,favorite=note.favorite,cover=note.cover,binding=note.binding,coverTitleSize=note.coverTitleSize,paperTheme=note.paperTheme,paper=note.paper,penKind=note.penKind,penSettings=note.penSettings,perPenWidths=note.perPenWidths,perPenColors=note.perPenColors,chalkboardPrevious=note.chalkboardPrevious;note=history.redo(note);note.pageOrder=pageOrder;if(bookmark===undefined)delete note.bookmark;else note.bookmark=bookmark;const wasBoard=note.paperTheme==='chalkboard';note.title=title;note.favorite=favorite;note.cover=cover;note.binding=binding;note.coverTitleSize=coverTitleSize;note.paperTheme=paperTheme;note.penKind=penKind;note.penSettings=penSettings;note.perPenWidths=perPenWidths;note.perPenColors=perPenColors;note.chalkboardPrevious=chalkboardPrevious;if(note.paperTheme==='chalkboard')note.paper='plain';else if(wasBoard)note.paper=paper;}autoChanged();dirty();render()};
$('shape-correct').onchange=()=>change(()=>note.shapeCorrection=$('shape-correct').checked);$('smooth').onchange=()=>change(()=>note.smooth=Number($('smooth').value)/100);$('original').onclick=()=>{clearSelection();stopAuto('원본 보기를 바꿔 자동 변환을 껐습니다.');change(()=>note.showOriginal=!note.showOriginal)};$('paper').onchange=()=>change(()=>note.paper=$('paper').value);$('font-size').onchange=()=>chooseDefaultFont(null,Number($('font-size').value));
function renderFontOptions(){
 const selected=$('selection-font').value;$('selection-font').replaceChildren(...[...FONTS,...customFonts].filter(f=>!customFontId(f.id)||customFaces.has(f.id)).map(f=>{const option=document.createElement('option');option.value=f.id;option.textContent=f.name;return option}));if([...FONTS,...customFonts].some(f=>f.id===selected))$('selection-font').value=selected;
 $('font-options').replaceChildren();
 for(const f of [...FONTS,...customFonts]){const wrap=document.createElement('div');wrap.className='font-card';const b=document.createElement('button');b.className='font-option';b.dataset.font=f.id;b.classList.toggle('active',note?.font===f.id);b.disabled=customFontId(f.id)&&!customFaces.has(f.id);const title=document.createElement('small');title.textContent=f.name;const sample=document.createElement('span');sample.style.fontFamily=`${f.id}, NanumPenScript, sans-serif`;sample.textContent=b.disabled?'불러오기 실패':'나의 하루';b.append(title,sample);b.onclick=()=>chooseDefaultFont(f.id);wrap.append(b);if(customFontId(f.id)){const del=document.createElement('button');del.className='font-delete';del.textContent='삭제';del.setAttribute('aria-label',f.name+' 글씨체 삭제');del.onclick=async()=>{if(fontBusy||!confirm('이 기기에서 글씨체를 삭제할까요? 이 글씨체를 쓰는 노트는 기본 글씨체로 표시됩니다. 원래 파일로 다시 추가할 수 있습니다.'))return;fontBusy=true;try{await deleteCustomFont(f.id);const face=customFaces.get(f.id);if(face)document.fonts.delete(face);customFaces.delete(f.id);layoutCache.clear();customFonts=customFonts.filter(x=>x.id!==f.id);renderFontOptions();render();toast('글씨체를 삭제했습니다. 노트 내용은 그대로입니다.')}catch{toast('삭제에 실패했습니다. 글씨체는 유지됩니다.')}finally{fontBusy=false}};wrap.append(del)}$('font-options').append(wrap);}
}
$('add-font').onclick=()=>{if(!fontBusy)$('font-file').click()};
$('font-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file||fontBusy)return;fontBusy=true;$('add-font').disabled=true;let record,face;try{record=await makeFontRecord(file);if(customFonts.some(f=>f.id===record.id))throw Error('이미 추가한 글씨체 파일입니다.');face=await loadCustomFace(record);await storeCustomFont(record);customFonts.push(record);customFaces.set(record.id,face);layoutCache.clear();renderFontOptions();render();toast('글씨체를 저장했습니다. 미리보기를 눌러 선택하세요.')}catch(err){if(face)document.fonts.delete(face);toast(err.name==='QuotaExceededError'?'저장 공간이 부족합니다. 글씨체가 추가되지 않았습니다.':err.message||'글씨체를 읽거나 저장하지 못했습니다. 다른 파일을 확인해주세요.')}finally{fontBusy=false;$('add-font').disabled=false}};
async function restoreFonts(){try{customFonts=await listCustomFonts();await Promise.all(customFonts.map(async f=>{try{customFaces.set(f.id,await loadCustomFace(f))}catch{toast('일부 글씨체를 불러오지 못했습니다. 기본 글씨체로 표시합니다.')}}))}catch{toast('내 글씨체 저장소를 열지 못했습니다. 기본 글씨체는 사용할 수 있습니다.')}layoutCache.clear();renderFontOptions();}
async function deleteNotebook(bookId){const pages=pagesFor(notes,bookId);if(!pages.length)return false;const title=pages[0].title||'제목 없는 노트';if(!await confirmNotebookDeletion({title,count:pages.length}))return false;let deleted=false;await transition(async()=>{const deletingActive=notebookId(note)===bookId;await removeNotesBatch(pages.map(p=>p.id),new Map(pages.map(p=>[p.id,revisions.get(p.id)||0])));const ids=new Set(pages.map(p=>p.id));for(const key of ids){dirtyNotes.delete(key);revisions.delete(key);pageHistories.delete(key);recognitionResults.delete(key);retryWarnings.delete(key);}lastPages.delete(bookId);notes=notes.filter(n=>!ids.has(n.id));if(!notes.length){const page=makeNote();notes.push(page);activatePage(page);dirty();}else if(deletingActive){activatePage(notes[0]);setSave('기기에 저장됨');}else{rememberPage();list();}setSidebar(false);deleted=true;void trashView?.refresh();});return deleted;}
$('delete-note').onclick=()=>deleteNotebook(notebookId(note));
let trashView=null;
function setSidebar(open){if(open)void trashView?.refresh();endStroke();showEraser(null);$('sidebar').hidden=!open;$('sidebar').classList.toggle('open',open);$('sidebar-backdrop').hidden=!open;document.querySelector('main').inert=open;$('menu').setAttribute('aria-expanded',String(open));if(open)$('close-sidebar').focus();else if(document.activeElement?.closest('#sidebar'))$('menu').focus();}
$('menu').onclick=()=>setSidebar($('sidebar').hidden);
$('close-sidebar').onclick=()=>setSidebar(false);$('sidebar-backdrop').onclick=()=>setSidebar(false);
document.addEventListener('keydown',e=>{if($('sidebar').hidden||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){e.preventDefault();setSidebar(false)}else if(e.key==='Tab'){const items=[...$('sidebar').querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')].filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}});
$('open-settings').onclick=()=>{endStroke();showEraser(null);$('settings-dialog').showModal()};$('close-settings').onclick=()=>$('settings-dialog').close();
$('open-handwriting').onclick=()=>{endStroke();stopAuto();editorMenus?.close();if(tool!=='select'||!selectedIds.length)$('pen').click();showEraser(null);if(note.mode!=='text')change(()=>{note.mode='text';showResult=false});else render();$('settings-dialog').showModal();};
$('retry-recognition').onclick=()=>$('recognize').onclick();$('saved-recognition').onclick=()=>{const result=recognitionResults.get(note.id);if(!result)return;$('saved-recognition-text').textContent=result.text;$('saved-recognition-info').textContent=new Date(result.createdAt).toLocaleTimeString('ko-KR')+' · 원본 '+result.strokeCount+'획의 결과입니다. 현재 필기에 자동으로 덮어쓰지 않습니다. 이 페이지를 닫으면 보관 결과는 사라집니다.';$('saved-recognition-dialog').showModal()};$('close-saved-recognition').onclick=()=>$('saved-recognition-dialog').close();
function syncPagePen(){if(!note)return;const settings=pagePenSettings(note);$('width').value=String(settings.width);$('color').value=settings.color;const board=isChalkboard(note);$('chalkboard-mode').setAttribute('aria-pressed',String(board));$('chalkboard-mode').textContent=board?'칠판 모드 끄기':'초록 칠판 · 분필';$('chalk-colors').hidden=!board;$('standard-pen-colors').hidden=board;syncPresets();}
function savePenControls(){if(!note)return;note=withPagePenSettings(note,{penKind:note.penKind,width:Number($('width').value),color:$('color').value});dirty();syncPresets();}
function applyPaperChoice(page,theme){theme=normalizePaperTheme(theme);if(theme==='chalkboard')return setChalkboardMode(page,true,page.id===note?.id?{penKind:page.penKind,width:Number($('width').value),color:$('color').value}:pagePenSettings(page)).note;const restored=isChalkboard(page)?setChalkboardMode(page,false).note:page;return {...restored,paperTheme:theme};}
$('chalkboard-mode').onclick=()=>{endStroke();clearSelection();drawingTools?.deactivate();photoTools?.deactivate();note=setChalkboardMode(note,!isChalkboard(note),{penKind:note.penKind,width:Number($('width').value),color:$('color').value}).note;dirty();render();$('pen').onclick();toast(isChalkboard(note)?'초록 칠판 모드입니다. 펜 옵션에서 분필 색을 고르세요. 기존 글씨 색상은 유지됩니다.':'이전 종이와 펜으로 돌아왔습니다.');};
for(const {color,label} of CHALK_COLORS){const button=document.createElement('button');button.type='button';button.className='color-chip';button.dataset.color=color;button.style.setProperty('--chip-color',color);button.setAttribute('aria-label',label);button.setAttribute('aria-pressed','false');$('chalk-colors').append(button);}
let quickPenSize;
function syncPresets(){quickPenSize?.refresh();for(const b of document.querySelectorAll('[data-width]'))b.setAttribute('aria-pressed',String(b.dataset.width===$('width').value));for(const b of document.querySelectorAll('[data-color]'))b.setAttribute('aria-pressed',String(b.dataset.color===$('color').value));}
for(const b of document.querySelectorAll('[data-width]'))b.onclick=()=>{endStroke();$('width').value=b.dataset.width;savePenControls()};
for(const b of document.querySelectorAll('[data-color]'))b.onclick=()=>{endStroke();$('color').value=b.dataset.color;savePenControls()};
$('width').onchange=savePenControls;$('color').oninput=savePenControls;syncPresets();
function download(blob,name){if(globalThis.kepcoSaveBlob)return globalThis.kepcoSaveBlob(blob,name);const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000)}
async function exportBackup(pages,prefix,send=async(blob,name)=>download(blob,name)){const selectedIds=pages.map(page=>page.id);endStroke();commitText();const saved=await flush();pages=selectedIds.map(key=>notes.find(page=>page.id===key)).filter(Boolean);if(pages.some(page=>page.videoObjects?.some(video=>video.provider==='local'))&&!confirm('노트 백업에는 동영상 원본이 포함되지 않습니다. 위치·연결 정보만 보관되며 다른 기기에서 복원하거나 앱 데이터를 지운 뒤에는 원본 영상을 다시 선택해야 합니다. 원본 파일도 별도로 보관해주세요. 백업을 계속할까요?'))return;const parts=backupParts(pages),backupSetId=id();if(parts.length>1&&!confirm('백업을 '+parts.length+'개 파일로 나눕니다. 모두 보관하고, 앱을 닫거나 새로고침하지 않은 상태에서 순서대로 불러오세요.'))return;for(const [i,batch]of parts.entries()){const text=JSON.stringify({version:1,backupSetId,part:i+1,partCount:parts.length,notes:batch});inspectBackup(text);if(await send(new Blob([text],{type:'application/json'}),prefix+'-'+new Date().toISOString().slice(0,10)+'-'+(i+1)+'.json')===false)throw Error('백업 파일 저장이 취소되었거나 실패했습니다. 분할 백업은 모든 파일을 다시 확인해주세요.');}recordBackupAttempt({scope:prefix==='nib-backup'?'all':'notebook',pageCount:pages.length,partCount:parts.length});toast(saved===false?'기기에 저장하지 못해 현재 앱에 남아 있는 내용으로 백업 다운로드를 요청했습니다. 파일을 직접 확인해주세요.':'백업 파일 다운로드를 요청했습니다. 파일이 저장됐는지 확인해주세요.');}
$('backup').onclick=()=>backupCenter.open();
$('backup-notebook').onclick=()=>exportBackup(pagesFor(notes,notebookId(note)),'nib-notebook').catch(e=>toast(e.message));
$('import').onclick=()=>backupCenter.open();
async function restoreBackupNotes(info){if(switching)return false;switching=true;document.querySelector('.app').inert=true;stopAuto('백업을 불러오는 동안 자동 변환을 껐습니다.');endStroke();commitText();try{const data=info.data,parsed=info.pages;const setId=typeof data.backupSetId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(data.backupSetId)?data.backupSetId:null;const previous=setId?importSets.get(setId):null;const maps={notebookMap:new Map(previous?.notebookMap),pageMap:new Map(previous?.pageMap)};const incoming=cloneImportedPages(parsed,maps).filter(p=>!notes.some(n=>n.id===p.id));for(const n of incoming){const sibling=notes.find(p=>notebookId(p)===notebookId(n));n.title=sibling?.title||(n.title+' (복사본)').slice(0,120);}if(!incoming.length){toast('이 백업 페이지는 이미 불러왔습니다.');return false;}if(notes.length+incoming.length>1000||listNotebooks([...notes,...incoming]).length>100)throw Error('합계 100개 노트·1,000페이지 이하로 불러와주세요.');if(await flush()===false)return false;const result=await saveNotesBatch(incoming,new Map(incoming.map(n=>[n.id,0])));for(const [key,rev]of result)revisions.set(key,rev);notes.push(...incoming);if(setId)importSets.set(setId,maps);list();return true;}finally{switching=false;document.querySelector('.app').inert=false;}}

$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();$('export').onclick=()=>$('export-dialog').showModal();$('close-export').onclick=()=>$('export-dialog').close();$('print').onclick=()=>{$('export-dialog').close();window.print()};
function recognitionCanvas(strokes=note.strokes){const plan=rasterPlan(strokes);if(!plan)throw Error('읽을 필기가 없습니다.');const canvas=document.createElement('canvas');canvas.width=plan.pixelWidth;canvas.height=plan.pixelHeight;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(plan.scale,plan.scale);ctx.translate(-plan.left,-plan.top);for(const s of strokes){ctx.beginPath();ctx.strokeStyle='#111111';ctx.lineWidth=s.width;ctx.lineCap='round';ctx.lineJoin='round';s.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(s.points.length===1)ctx.lineTo(s.points[0].x+.01,s.points[0].y);ctx.stroke();}return canvas;}
export async function renderPageCanvas(page,{scale=1,signal}={}){
 signal?.throwIfAborted();
 if(!Number.isInteger(scale)||scale<1||scale>3)throw Error('지원하지 않는 출력 해상도입니다.');
 const canvas=document.createElement('canvas');
 try{canvas.width=PAGE.width*scale;canvas.height=PAGE.height*scale;const ctx=canvas.getContext('2d');if(!ctx)throw Error('고해상도 PDF를 그릴 메모리가 부족합니다. 다른 앱을 닫고 다시 시도해주세요.');ctx.scale(scale,scale);drawPaperBackground(ctx,page);await drawPageImages(ctx,page);signal?.throwIfAborted();
 const groups=page.showOriginal?[]:activeConvertedGroups(page.convertedGroups||[],page.strokes),covered=new Set(groups.flatMap(g=>g.strokeIds));
 for(const stroke of page.strokes.filter(s=>!covered.has(s.id))){const points=(page.showOriginal||['circle','ellipse','polygon'].includes(stroke.heldShape))?stroke.points:(page.shapeCorrection?correctShape(stroke.points,{enabled:true})?.points:null)||smoothPoints(stroke.points,page.smooth);drawStyledStroke(ctx,stroke,points);}
 for(const group of groups){signal?.throwIfAborted();const font=resolvedFont(group.font||page.font),size=group.fontSize||page.fontSize;await document.fonts.load(`${size}px ${font}`);const layout=layoutTextObject(group,size,{measure:(text,size)=>{ctx.font=`${size}px ${font}, sans-serif`;return ctx.measureText(text).width;}}),b=group.bounds;ctx.save();ctx.beginPath();ctx.rect(b.x,b.y,b.width,b.height);ctx.clip();ctx.fillStyle='#223247';ctx.font=`${layout.fontSize}px ${font}, sans-serif`;ctx.textAlign=layout.anchor==='middle'?'center':'left';layout.lines.forEach((line,i)=>ctx.fillText(line,b.x+(layout.x||0),b.y+layout.fontSize*.9+i*layout.lineHeight));ctx.strokeStyle='#223247';for(const line of layout.decorations||[]){ctx.beginPath();ctx.lineWidth=line.width;ctx.moveTo(b.x+line.x1,b.y+line.y);ctx.lineTo(b.x+line.x2,b.y+line.y);ctx.stroke();}ctx.restore();}
 for(const object of page.drawingObjects||[]){signal?.throwIfAborted();await document.fonts.load(`${object.fontSize}px ${resolvedFont(object.font)}`);drawDrawingObject(ctx,object);}drawVideoPlaceholders(ctx,page.videoObjects||[]);signal?.throwIfAborted();return canvas;
 }catch(error){canvas.width=canvas.height=1;throw error;}
}
async function imageCanvas(inkOnly=false){return inkOnly?recognitionCanvas():renderPageCanvas(structuredClone(note));}
$('export-png').onclick=async()=>{endStroke(true);try{const filename=(note.title||'nib-note')+'.png';const c=await imageCanvas();c.toBlob(blob=>{if(blob)download(blob,filename);else toast('이미지 저장에 실패했습니다.')},'image/png');}catch(e){toast(e.message||'이미지 저장에 실패했습니다. 원본은 보존됩니다.');}};
function chunkSeparator(count){if(!count)return ' ';let bottom=-Infinity,top=Infinity;for(let i=0;i<note.strokes.length;i++)for(const p of note.strokes[i].points){if(i<count)bottom=Math.max(bottom,p.y);else top=Math.min(top,p.y);}return top>bottom+15?'\n':' ';}
function recognitionSnapshot(incremental=true){if(!note?.strokes.length||drawing)return null;const fullStrokesKey=JSON.stringify(note.strokes),groups=activeConvertedGroups(note.convertedGroups||[],note.strokes),selection=selectRecognitionStrokes(note.strokes,groups,{incremental,revisit:false});if(!selection.strokes.length)return null;const selectedIds=new Set(selection.strokes.map(s=>s.id));const baseText=groups.filter(g=>g.strokeIds.every(id=>!selectedIds.has(id))).reduce((text,g)=>text+(text&&!/\s$/.test(text)?' ':'')+g.text,'');const revisitedGroups=groups.filter(g=>g.strokeIds.some(id=>selectedIds.has(id))),style=revisitedGroups.length===1?revisitedGroups[0]:null;return {font:style?.font||note.font,fontSize:style?.fontSize||note.fontSize,noteId:note.id,revision:inkRevision,key:JSON.stringify([note.id,fullStrokesKey,[...selectedIds],baseText]),fullStrokesKey,fullCount:note.strokes.length,strokes:structuredClone(selection.strokes),baseText,append:!!baseText,revisited:selection.revisited};}
function selectedRecognitionSnapshot(){const snapshot=recognitionSnapshot(false);if(!snapshot)return null;const ids=new Set(completeSelection(note.strokes,note.convertedGroups||[],selectedIds,selectedObjectIds));if(!ids.size)return null;return {...snapshot,strokes:snapshot.strokes.filter(s=>ids.has(s.id)),selectionEpoch,font:$('selection-font').value||note.font,fontSize:Number($('selection-size').value)||note.fontSize,key:JSON.stringify([snapshot.key,[...ids],selectionEpoch])};}
async function convertSelected(){toast(ANDROID_UNAVAILABLE);return;if(recognizing)return toast('이전 인식이 끝난 뒤 선택 영역을 변환해주세요.');endStroke();stopAuto('선택 영역만 변환합니다. 자동 변환은 껐습니다.');if(!confirmRecognitionRetry())return;const snapshot=selectedRecognitionSnapshot();if(!snapshot)return toast('먼저 올가미로 글을 선택해주세요.');$('auto-status').textContent='선택한 원본 '+snapshot.strokes.length+'획만 읽고 있어요…';try{const text=await requestRecognition(snapshot);if(note.id!==snapshot.noteId)return;$('auto-status').textContent=applyRecognized(text,snapshot)?'선택한 글만 변환했습니다. 나머지 글은 유지됩니다.':'선택 또는 필기가 바뀌어 결과를 적용하지 않았습니다. 최근 인식 결과에서 확인하세요.';}catch(e){if(note.id!==snapshot.noteId)return;$('auto-status').textContent=e.message||'인식에 실패했습니다. 원본은 보존됩니다.';}}
$('selection-convert').onclick=()=>{stopAuto();if(!selectedIds.length)return;if(sessionConsent&&accessToken.length>=4){$('settings-dialog').close();convertSelected();}else{pendingSelected=true;pendingSelectionEpoch=selectionEpoch;openRecognitionSetup(false);$('ocr-message').textContent='선택한 원본 묶음만 AI에 전송합니다. 비용이 발생하며 나머지 글은 유지됩니다.';}};
$('selection-apply-font').onclick=()=>{endStroke();stopAuto();const ids=new Set(completeSelection(note.strokes,note.convertedGroups||[],selectedIds,selectedObjectIds)),groups=activeConvertedGroups(note.convertedGroups||[],note.strokes),chosen=groups.filter(g=>selectedObjectIds.includes(g.id)||g.strokeIds.some(id=>ids.has(id)));if(!chosen.length)return toast('폰트는 키보드로 추가한 글이나 기존 텍스트에 적용할 수 있습니다. 원본 필기는 그대로 유지됩니다.');const nextFont=$('selection-font').value||note.font,nextSize=Number($('selection-size').value)||note.fontSize;if(chosen.some(g=>((g.font||note.font)!==nextFont||(g.fontSize||note.fontSize)!==nextSize)&&(g.bounds.x<0||g.bounds.y<0||g.bounds.x+g.bounds.width>900||g.bounds.y+g.bounds.height>1200)))return toast('글씨체나 크기를 바꾸려면 먼저 글을 종이 안쪽으로 옮겨주세요.');history.push(note);note.convertedGroups=(note.convertedGroups||[]).map(g=>chosen.includes(g)?{...g,font:$('selection-font').value||note.font,fontSize:Number($('selection-size').value)||note.fontSize}:g);selectionEpoch++;dirty();renderInk();$('auto-status').textContent='선택한 변환 글만 글씨체를 바꿨습니다. AI 호출 없이 적용했습니다.';};
$('selection-font').onchange=()=>selectionEpoch++;$('selection-size').onchange=()=>selectionEpoch++;
$('selection-delete').onclick=()=>{const strokes=[...selectedIds],objects=[...selectedObjectIds];if(drawing?.directTouch)objects.push(drawing.objectId);endStroke();stopAuto('선택한 글을 삭제하여 자동 변환을 껐습니다.');const result=deleteSelectedContent(note,strokes,objects);if(!result.changed)return toast('삭제할 글을 먼저 선택해주세요.');history.push(note);if(activeRecognition?.noteId===note.id){activeRecognition.discardResult=true;activeRecognition.controller.abort();}note=result.note;recognitionResults.delete(note.id);retryWarnings.delete(note.id);converted.delete(note.id);clearSelection();autoChanged();dirty();render();$('auto-status').textContent=result.deletedObjects+'개 글씨 객체 · '+result.deletedStrokes+'획을 삭제했습니다. 실행 취소로 복원할 수 있어요.';};
$('selection-clear').onclick=()=>{endStroke();clearSelection();};
$('cancel-recognition').onclick=()=>{if(!activeRecognition)return;if(!confirm('응답 기다리기를 취소할까요? 원본은 유지되지만 이미 전송한 AI 요청의 처리·비용까지 취소된다고 보장할 수 없습니다.'))return;activeRecognition.controller.abort();stopAuto();};
async function requestRecognition(snapshot,{signal,budgetReserved=false}={}){requireOnlineFeature();
 if(recognizing)throw Error('이전 인식이 진행 중입니다. 잠시 기다려주세요.');
 if(signal?.aborted)throw Object.assign(new Error('전송 전에 인식을 취소했습니다.'),{name:'AbortError',code:'REQUEST_CANCELLED'});
 if(!budgetReserved){const allowance=recognitionBudget.reserve();if(!allowance.ok)throw Object.assign(new Error('최근 1분의 인식 한도에 도달했습니다. '+Math.ceil(allowance.retryInMs/1000)+'초 뒤 다시 눌러주세요. 아직 전송하지 않았습니다.'),{code:'LOCAL_REQUEST_BUDGET',retryAfterMs:allowance.retryInMs});}
 const controller=new AbortController(),forwardAbort=()=>controller.abort(signal?.reason);if(signal?.aborted)forwardAbort();else signal?.addEventListener('abort',forwardAbort,{once:true});
 const request={controller,noteId:snapshot.noteId};activeRecognition=request;recognizing=true;$('recognize').disabled=true;$('recognition-progress').hidden=false;$('cancel-recognition').hidden=false;$('recognition-progress').textContent='전송 준비 중…';
 try{
  const c=recognitionCanvas(snapshot.strokes),image=c.toDataURL('image/png').split(',')[1];
  const text=await sendRecognition({image,accessToken,signal:controller.signal,onProgress:({phase,elapsedMs})=>{if(activeRecognition!==request)return;const seconds=Math.floor(elapsedMs/1000);$('recognition-progress').textContent=(note.id===snapshot.noteId?'':'다른 페이지 · ')+(phase==='reading'?'결과 수신 중':'AI 응답 대기')+' '+seconds+'초'+(seconds>=12?' · 지연 중, 중복 전송하지 않습니다':'');},onSlow:()=>{if(note.id===snapshot.noteId)$('auto-status').textContent='AI 응답이 지연되고 있습니다. 필기는 보존되며 기다리기를 취소할 수 있어요.'}});
  recognitionResults.delete(snapshot.noteId);if(!request.discardResult&&notes.some(p=>p.id===snapshot.noteId))recognitionResults.set(snapshot.noteId,{text,createdAt:Date.now(),strokeCount:snapshot.strokes.length});while(recognitionResults.size>12)recognitionResults.delete(recognitionResults.keys().next().value);return text;
 }catch(e){
  if(e.status===429){if(Number.isFinite(e.retryAfterMs))e.message+=' '+Math.ceil(e.retryAfterMs/1000)+'초 후 직접 다시 시도해주세요.';stopAuto(e.message+' 자동 변환을 껐으며 자동으로 재전송하지 않습니다.');}
  if(e.status===401||e.status===403){sessionConsent=false;sessionAutoConsent=false;stopAuto('이용 코드가 올바르지 않아 자동 변환을 껐습니다. 지금 변환을 눌러 코드를 다시 입력해주세요.');}
  if(e.retryRequiresConfirmation&&!request.discardResult&&notes.some(p=>p.id===snapshot.noteId)){retryWarnings.add(snapshot.noteId);stopAuto((e.message||'인식 응답을 받지 못했습니다.')+' 자동 변환을 껐습니다. 인식 재시도를 눌러주세요.');}throw e;
 }finally{signal?.removeEventListener('abort',forwardAbort);if(activeRecognition===request){activeRecognition=null;$('recognition-progress').hidden=true;$('cancel-recognition').hidden=true;}recognizing=false;$('recognize').disabled=false;updateRecognitionActions();}
}
function applyRecognized(text,snapshot){if((snapshot.selectionEpoch!==undefined&&snapshot.selectionEpoch!==selectionEpoch)||drawing||note.id!==snapshot.noteId||inkRevision!==snapshot.revision||JSON.stringify(note.strokes)!==snapshot.fullStrokesKey)return false;if(!text.trim())throw Error('읽을 수 있는 글씨를 찾지 못했습니다. 원본은 보존됩니다.');const group=makeConvertedGroup(snapshot.strokes,text,{id:id(),font:snapshot.font||note.font,fontSize:snapshot.fontSize||note.fontSize});if(!group)throw Error('변환할 원본 영역이 없습니다.');const groups=(snapshot.selectionEpoch!==undefined?replaceGroups:appendTextObject)(activeConvertedGroups(note.convertedGroups||[],note.strokes),group);history.push(note);note.convertedGroups=groups;note.textPlacementMissing=false;note.text=prefixText(note.strokes.length);converted.set(note.id,{count:snapshot.fullCount,prefix:snapshot.fullStrokesKey,text:note.text});note.mode='text';note.showOriginal=false;showResult=false;if(snapshot.selectionEpoch!==undefined){selectedIds=[...group.strokeIds];selectedObjectIds=[group.id];}dirty();render();return true;}
async function convertOnce(){toast(ANDROID_UNAVAILABLE);return;if(recognizing){$('auto-status').textContent='이미 인식 중입니다. 잠시 기다려주세요.';return;}if(!confirmRecognitionRetry())return;if(autoEnabled){autoEngine.flush();return;}endStroke();if(note.text&&committedCount()===note.strokes.length){note.showOriginal=false;render();$('auto-status').textContent='이미 변환한 필기입니다. 같은 위치에서 선택한 글씨체로 표시합니다.';return;}const snapshot=recognitionSnapshot(true);if(!snapshot)return toast('먼저 종이에 글씨를 써주세요.');$('auto-status').textContent='필기를 읽고 있어요…';try{const text=await requestRecognition(snapshot);if(note.id!==snapshot.noteId)return;if(applyRecognized(text,snapshot)){$('auto-status').textContent='같은 페이지에 폰트로 바꿨습니다. 글을 선택하면 내용·크기 수정과 손글씨 복원이 가능해요.';}else $('auto-status').textContent='필기가 바뀌어 이전 결과를 적용하지 않았습니다. 다시 변환해주세요.';}catch(e){if(note.id!==snapshot.noteId)return;$('auto-status').textContent=e.message||'인식에 실패했습니다. 원본은 보존됩니다.';toast($('auto-status').textContent);}}
function openRecognitionSetup(auto){toast(ANDROID_UNAVAILABLE);return;pendingAuto=auto;if(auto)pendingSelected=false;$('ocr-message').textContent=aiConfigured?(auto?'자동 변환은 새 필기를 모아 전송합니다. AI 비용이 발생하며 언제든 끌 수 있습니다.':'동의하고 실행하면 선택한 글씨체로 바로 적용합니다. 결과 확인 버튼을 다시 누를 필요가 없습니다.'):'AI 연결 전입니다. 서버 설정을 확인해주세요.';$('run-ocr').disabled=!aiConfigured;$('run-ocr').textContent=auto?'동의하고 자동 변환 켜기':'동의하고 지금 변환';$('ocr-dialog').showModal();}
// Automatic canvas recognition is retired from the font UI. Never enable silently.
function enableAuto(){stopAuto();}
$('recognize').onclick=()=>{pendingSelected=false;if(tool==='eraser')$('pen').click?.();if(sessionConsent&&accessToken.length>=4){$('settings-dialog').close();convertOnce();}else openRecognitionSetup(false)};
$('cancel-ocr').onclick=()=>{pendingSelected=false;$('ocr-dialog').close();};
$('run-ocr').onclick=()=>{if(!$('send-consent').checked)return toast('필기 이미지 전송에 동의해주세요.');accessToken=$('access-code').value.trim();if(accessToken.length<4)return toast('4자 이상의 앱 이용 코드를 입력해주세요.');sessionConsent=true;$('ocr-dialog').close();$('settings-dialog').close();if(pendingAuto){pendingAuto=false;stopAuto();}else if(pendingSelected){pendingSelected=false;if(pendingSelectionEpoch!==selectionEpoch||!selectedIds.length)return toast('선택이 바뀌어 전송하지 않았습니다. 다시 선택해 변환해주세요.');convertSelected();}else convertOnce();};
autoEngine=createAutoConverter({budget:recognitionBudget,snapshot:()=>recognitionSnapshot(),recognize:requestRecognition,apply:applyRecognized,onStatus:s=>{if(s.type==='settled')return;const message=s.error?.message||'';const labels={writing:'필기 중입니다. 펜을 떼고 잠깐 멈추면 변환합니다.',enabled:'종이에 쓰면 잠깐 뒤 자동 변환합니다.',waiting:s.rateLimited?'분당 인식 한도를 지키며 대기 중 · '+Math.ceil(s.retryInMs/1000)+'초 남음':'필기를 멈추면 1.2초 뒤 자동 변환합니다.',recognizing:'새 필기를 읽고 있어요…',applied:'선택한 글씨체로 자동 적용했습니다. 이어서 쓰세요.',empty:'종이에 쓰면 잠깐 뒤 자동 변환합니다.',unchanged:'이미 변환한 필기입니다.',stale:'새 필기가 있어 이전 결과는 적용하지 않았어요.',error:'인식 오류: '+message+' 새로 쓰거나 지금 변환을 눌러 재시도하세요.',stopped:'반복 오류로 자동 변환을 껐습니다. '+message};if(labels[s.type])$('auto-status').textContent=labels[s.type];if(s.type==='stopped'){autoEnabled=false;render();}}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAuto('화면을 떠나 자동 변환을 껐습니다. 다시 켜면 이어서 변환합니다.');endStroke();commitText();flush();if(note)render();}});window.addEventListener('pagehide',()=>{stopAuto();endStroke();flush()});
const penPicker=mountPenPicker({getSettings:()=>({...pagePenSettings(note),perPenWidths:note.perPenWidths,perPenColors:note.perPenColors,ordinaryColor:note.chalkboardPrevious?.color}),apply:({penKind,width,color,perPenWidths,perPenColors},{colorChanged=true}={})=>{endStroke();note=selectPagePen(note,{penKind:normalizePenKind(penKind),width,perPenWidths,perPenColors,...(isChalkboard(note)&&penKind!=='chalk'&&!colorChanged?{}:{color})});$('width').value=String(note.penSettings.width);$('color').value=note.penSettings.color;syncPresets();$('pen').onclick();dirty();render();return true;}});
$('open-pen').onclick=()=>{endStroke();editorMenus.close();penPicker.toggle($('pen'));};
const paperPicker=mountPaperPicker({getNote:()=>note,apply:async({paperTheme,scope})=>{let saved=false;await transition(async()=>{const ids=new Set((scope==='notebook'?pagesFor(notes,notebookId(note)):[note]).map(p=>p.id));const changed=notes.map(p=>ids.has(p.id)?applyPaperChoice(p,paperTheme):p),pages=changed.filter(p=>ids.has(p.id));const result=await saveNotesBatch(pages,new Map(pages.map(p=>[p.id,revisions.get(p.id)||0])));for(const [key,rev]of result)revisions.set(key,rev);notes=changed;note=notes.find(p=>p.id===note.id);render();saved=true;});return saved;}});
$('open-paper').onclick=()=>{endStroke();stopAuto('속지를 고르는 동안 자동 변환을 껐습니다.');paperPicker.show();};
const notebookEditor=mountNotebookEditor({persist:async({id:bookId,title,cover,binding,coverTitleSize,paperTheme,paper})=>{let saved=false;await transition(async()=>{if(!bookId){if(listNotebooks(notes).length>=100||notes.length>=1000)throw Error('최대 100개 노트·1,000페이지까지 저장할 수 있어요.');const page=applyPaperChoice({...makeNote(),title,cover,binding,coverTitleSize,paper},paperTheme);const revision=await saveNote(page);revisions.set(page.id,revision);notes.push(page);activatePage(page);setSave('기기에 저장됨');setSidebar(false);}else{if(!notes.some(p=>notebookId(p)===bookId))throw Error('노트를 찾을 수 없습니다.');const changed=setNotebookMetadata(notes,bookId,{title,cover,binding,coverTitleSize}),pages=changed.filter(p=>notebookId(p)===bookId);const result=await saveNotesBatch(pages,new Map(pages.map(p=>[p.id,revisions.get(p.id)||0])));for(const [key,rev]of result)revisions.set(key,rev);notes=changed;note=notes.find(p=>p.id===note.id);render();}saved=true;});return saved;}});
async function renameNotebookFromCover(bookId,title){
 let saved=false;
 await transition(async()=>{
  if(!notes.some(page=>notebookId(page)===bookId))throw Error('노트를 찾을 수 없습니다.');
  const changed=setNotebookMetadata(notes,bookId,{title}),pages=changed.filter(page=>notebookId(page)===bookId);
  const result=await saveNotesBatch(pages,new Map(pages.map(page=>[page.id,revisions.get(page.id)||0])));
  for(const [key,revision]of result)revisions.set(key,revision);
  notes=changed;note=notes.find(page=>page.id===note.id);render();setSave('기기에 저장됨');saved=true;
 });
 return saved;
}
const library=mountLibrary({getNotes:()=>notes,getCurrent:()=>notebookId(note),openPage:pageId=>switchNote(pageId),deleteNotebook,renameNotebook:renameNotebookFromCover,beforeOpen:async()=>{endStroke();stopAuto('서재를 열어 자동 변환을 껐습니다.');setSidebar(false);await flush();},openNotebook,createNotebook:()=>$('new-note').onclick(),editNotebook:bookId=>{const page=pagesFor(notes,bookId)[0];return page?notebookEditor.open({id:bookId,title:page.title,cover:page.cover,binding:page.binding,coverTitleSize:page.coverTitleSize}):false;},toggleFavorite:(bookId,value)=>transition(async()=>{const changed=setNotebookFavorite(notes,bookId,value),pages=changed.filter(p=>notebookId(p)===bookId);const result=await saveNotesBatch(pages,new Map(pages.map(p=>[p.id,revisions.get(p.id)||0])));for(const [key,rev]of result)revisions.set(key,rev);notes=changed;note=notes.find(p=>p.id===note.id);list();})});
// Selection AI retains its explicit label, consent and request-budget path.
editorMenus=mountEditorMenus({beforeOpen:()=>{endStroke();pageSwipe?.cancel();},getDrawing:()=>drawingTools});
drawingTools=mountDrawingTools({compact:true,onState:state=>{if(typeof editorMenus!=='undefined')editorMenus?.syncDrawing(state)},getNote:()=>note,canDirectTouch:()=>!switching&&!(typeof photoTools!=='undefined'&&photoTools?.isActive())&&!drawing&&tool==='pen'&&!$('pan-page').checked&&!$('touch').checked,beforeGesture:()=>{endStroke();clearSelection();stopAuto('그림 작업 중에는 자동 글씨 변환을 껐습니다.');$('pan-page').checked=false;$('canvas').classList.remove('page-pan','erasing');$('touch').disabled=false;},activatePen:()=>$('pen').onclick(),openPen:()=>$('open-pen').click(),getStyle:()=>({color:$('color').value,width:Number($('width').value),font:effectiveFont(),fontSize:note.fontSize}),apply:(next,message)=>{
 if(next.id!==note.id)return false;history.push(note);
 if(activeRecognition?.noteId===note.id){activeRecognition.discardResult=true;activeRecognition.controller.abort();}
 note=next;recognitionResults.delete(note.id);retryWarnings.delete(note.id);converted.delete(note.id);autoChanged();dirty();render();$('auto-status').textContent=message||'그림을 적용했습니다. 실행 취소로 되돌릴 수 있어요.';return true;
}});
for(const key of ['pen','eraser','select','open-handwriting','keyboard-text','edit-text','open-pen','pan-page'])$(key).addEventListener('click',()=>drawingTools.deactivate(),{capture:true});
paperViewport=mountPaperViewport({container:$('paper-viewport'),paper:$('page'),beforeChange:reason=>{if(reason==='resize'&&!drawing&&!drawingTools?.hasGesture?.()&&photoTools?.isActive()&&photoTools?.isCropping?.()){photoTools.onViewportResize();paperViewport?.focusRect?.(photoTools.cropSourceBounds?.());return;}endStroke();},onChange:view=>{$('paper-zoom-reset').textContent=Math.round(view.scale*100)+'%';if(photoTools?.isCropping?.())photoTools.render();}});
pageSwipe=mountPageSwipe({canvas:$('canvas'),surface:$('paper-viewport'),viewport:paperViewport,getPageId:()=>note?.id,
 canStart:()=>!!note&&!switching&&!drawingTools?.hasPenGesture?.()&&!(typeof photoTools!=='undefined'&&photoTools?.hasGesture?.())&&!document.querySelector('dialog[open]')&&$('sidebar').hidden,
 canSwipe:t=>!drawing&&!drawingTools?.isActive()&&!(typeof photoTools!=='undefined'&&photoTools?.isActive())&&($('pan-page').checked||(tool==='pen'&&!$('touch').checked))&&pageSwipeStartAllowed(note,inputPoint(t,snapshotRect($('canvas').getBoundingClientRect())),textTargets(),$('pan-page').checked),
 canPan:t=>!drawing&&!drawingTools?.isActive()&&!(typeof photoTools!=='undefined'&&photoTools?.isActive())&&($('pan-page').checked||(tool==='pen'&&!$('touch').checked))&&($('pan-page').checked||blankPaperPoint({...note,strokes:[],photoObjects:[]},inputPoint(t,snapshotRect($('canvas').getBoundingClientRect())),textTargets())),
 getAction:direction=>{const pages=pagesFor(notes,notebookId(note)),i=pages.findIndex(p=>p.id===note.id);if(i<0)return null;if(direction>0)return i>0?'previous':null;return i<pages.length-1?'next':notes.length<1000?'add':null;},
 beforeStart:()=>endStroke(false,true),navigate:action=>$(action+'-page').onclick(),
 onProgress:state=>{const hint=$('page-add-hint');hint.hidden=!state;if(state){const label={previous:'이전 페이지로 이동',next:'다음 페이지로 이동',add:'새 페이지 추가'}[state.action];hint.textContent=state.ready?'놓으면 '+label:(state.direction>0?'→':'←')+(state.action==='add'?' 더 길게 끌어 ':' 조금 더 쓸어 ')+label;hint.classList.toggle('ready',state.ready);}}
});
$('paper-zoom-out').onclick=()=>paperViewport.zoomBy(1/1.25);
$('paper-zoom-in').onclick=()=>paperViewport.zoomBy(1.25);
$('paper-zoom-reset').onclick=()=>paperViewport.reset();
$('paper-viewport').addEventListener('wheel',e=>{e.preventDefault();if(drawing||drawingTools?.hasGesture()||photoTools?.hasGesture())return;if(e.ctrlKey||e.metaKey)paperViewport.zoomBy(Math.exp(-e.deltaY*.005));else paperViewport.panBy(-e.deltaX,-e.deltaY);},{passive:false});
$('paper-viewport').addEventListener('keydown',e=>{if(e.target!==$('paper-viewport'))return;const moves={ArrowLeft:[60,0],ArrowRight:[-60,0],ArrowUp:[0,60],ArrowDown:[0,-60]};if(moves[e.key]){e.preventDefault();paperViewport.panBy(...moves[e.key]);}});
mountKeyboardText({getNote:()=>note,getFonts:()=>[...FONTS,...customFonts].filter(f=>!customFontId(f.id)||customFaces.has(f.id)).map(f=>({...f,family:`${f.id}, NanumPenScript, sans-serif`})),beforeOpen:()=>{endStroke();stopAuto('키보드 입력 중에는 자동 변환을 껐습니다.');$('settings-dialog').close();},notify:toast,apply:(next)=>{
 history.push(note);
 if(activeRecognition?.noteId===note.id){activeRecognition.discardResult=true;activeRecognition.controller.abort();}
 note=next;recognitionResults.delete(note.id);retryWarnings.delete(note.id);converted.delete(note.id);
 clearSelection();autoChanged();dirty();render();$('auto-status').textContent='키보드 글을 추가했습니다. 손가락으로 이동하거나 선택 후 글·크기를 수정할 수 있어요.';
}});
mountTextObjectEditor({getNote:()=>note,getSelection:()=>selectedObjectIds,beforeOpen:()=>{endStroke();stopAuto('선택한 글을 수정하는 동안 자동 변환을 껐습니다.');},notify:toast,apply:(next,message)=>{
 history.push(note);
 if(activeRecognition?.noteId===note.id){activeRecognition.discardResult=true;activeRecognition.controller.abort();}
 note=next;recognitionResults.delete(note.id);retryWarnings.delete(note.id);converted.delete(note.id);
 clearSelection();autoChanged();dirty();render();$('auto-status').textContent=message;
}});
async function start(){await restoreFonts();try{const loaded=await getNotes();notes=[];for(const n of loaded){try{notes.push(validateNote(n));}catch{toast('손상된 노트는 열지 않았습니다. 원본 데이터는 삭제하지 않았어요.');}}for(const n of notes)revisions.set(n.id,n._revision||0);let activeId;try{activeId=localStorage.getItem('nib-active-page');const saved=JSON.parse(localStorage.getItem('nib-last-pages')||'[]');if(Array.isArray(saved))for(const pair of saved.slice(0,100)){if(Array.isArray(pair)&&pair.length===2&&notes.some(p=>p.id===pair[1]&&notebookId(p)===pair[0]))lastPages.set(pair[0],pair[1]);}}catch{}note=notes.find(n=>n.id===activeId)||notes[0]||{...makeNote(),cover:'ai-01'};if(!notes.length){notes.push(note);revisions.set(note.id,await saveNote(note));}rememberPage();render();setSave('기기에 저장됨')}catch{note=makeNote();notes=[note];render();setSave('저장 불가 · 백업 필요',true);toast('이 브라우저에서 저장할 수 없습니다. 작성 후 백업해주세요.')}document.querySelector('.app').inert=false;}
Promise.resolve(new Response('{"configured":false}')).then(r=>r.ok?r.json():null).then(s=>{aiConfigured=s?.configured===true;$('recognize').textContent=aiConfigured?'지금 AI로 변환':'✧ AI 인식 · 연결 전';}).catch(()=>{$('recognize').textContent='✧ AI 인식 · 연결 전';});
$('app-version').textContent='앱 '+APP_VERSION;
let reloading=false;
$('reload-app').onclick=async()=>{if(reloading)return;reloading=true;$('reload-app').disabled=true;try{const result=await safeAppReload({isBusy:()=>recognizing||fontBusy||switching||documentBusy||meetingDialog?.recording,save:async()=>{stopAuto('새로고침을 위해 자동 변환을 껐습니다.');endStroke();commitText();return flush()},hasUnsaved:()=>dirtyNotes.size>0,reload:()=>location.reload()});if(!result.ok)toast(result.reason==='busy'?'진행 중인 작업을 마친 뒤 새로고침해주세요.':'노트를 저장하지 못해 새로고침하지 않았어요. 먼저 백업해주세요.')}catch{toast('저장 상태를 확인하지 못했습니다. 새로고침하지 않았어요.')}finally{reloading=false;$('reload-app').disabled=false}};
async function checkVersion(){const next=await checkAppUpdate();if(next){$('update-notice').hidden=false;$('update-notice').textContent='새 버전이 있어요. 앱 새로고침을 눌러 적용하세요.';}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkVersion()});
for(const event of ['loadingdone','loadingerror'])document.fonts?.addEventListener(event,()=>{layoutCache.clear();if(note)renderInk()});
// Recording is separate from notebook backups. Minutes are inserted as new pages.
const diaryStore=createDiaryStore();
const backupCenter=mountBackupCenter({getPages:()=>notes,diaryStore,download,exportNotes:send=>exportBackup(notes,'nib-backup',send),restoreNotes:restoreBackupNotes,beforeOpen:async()=>{if(meetingDialog?.recording)throw Error('녹음을 마친 뒤 백업해주세요.');endStroke();commitText();stopAuto();editorMenus?.close();setSidebar(false);await flush();}});
const diaryDialog=mountDiaryDialog({store:diaryStore,onBackupCenter:()=>backupCenter.open(),toast,beforeOpen:async()=>{endStroke();pageSwipe?.cancel();stopAuto();editorMenus?.close();setSidebar(false);await flush();}});
$('toolbar-diary').onclick=()=>diaryDialog.open();
$('sidebar-diary').onclick=()=>diaryDialog.open();
$('library-diary').onclick=()=>{$('library-dialog').close();diaryDialog.open();};
let diaryTimer;function resumeDiaryReminders(){clearInterval(diaryTimer);diaryTimer=setInterval(()=>{if(document.visibilityState==='visible')diaryDialog.checkReminders().catch(()=>{});},30000);diaryDialog.checkReminders().catch(()=>{});}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')diaryDialog.checkReminders().catch(()=>{});});
window.addEventListener('pagehide',()=>clearInterval(diaryTimer));
window.addEventListener('pageshow',resumeDiaryReminders);
setTimeout(resumeDiaryReminders,1500);
const meetingDialog=mountMeetingDialog({toast,onDiaryActions:(minutes,source)=>diaryDialog.reviewMeeting(minutes,{sourceRecordingId:source?.recordingId}),beforeOpen:()=>{endStroke();stopAuto();editorMenus?.close();setSidebar(false);},getNotebookId:()=>note?notebookId(note):null,onInsertMinutes:async (text,source)=>{
 let inserted=false;await transition(async()=>{const added=createMeetingNotebook(notes,note,text,source);const saved=await saveNotesBatch(added,new Map(added.map(p=>[p.id,0])));for(const [key,rev]of saved)revisions.set(key,rev);notes.push(...added);activatePage(added[0]);setSave('기기에 저장됨');inserted=true;toast('회의록 보관함에 '+added.length+'페이지의 별도 노트로 저장했습니다. 전체 PDF로 저장할 수 있어요.');});return inserted;
}});
$('open-meetings').onclick=()=>meetingDialog.open();
// Handwriting recognition retains its own consent and handlers above; meetings stay separate.
const taskDialog=document.createElement('dialog');taskDialog.id='document-task-dialog';taskDialog.innerHTML='<h2 id="document-task-title">문서 처리</h2><p id="document-task" role="status" aria-live="polite"></p><section id="pdf-loading-preview" hidden><p>불러온 페이지 미리보기 · 모든 페이지를 읽은 뒤 새 노트로 저장합니다.</p><img id="pdf-loading-image" alt="불러온 PDF 페이지 미리보기"><div class="pdf-preview-navigation"><button id="pdf-preview-previous" type="button" aria-label="이전 미리보기 페이지">‹</button><span id="pdf-preview-position"></span><button id="pdf-preview-next" type="button" aria-label="다음 미리보기 페이지">›</button></div></section><button id="cancel-document-task">취소</button>';document.body.append(taskDialog);let documentAbort=null,pdfPreviews=[],pdfPreviewIndex=0,pdfPreviewTotal=0;
function renderPdfPreview(){const item=pdfPreviews[pdfPreviewIndex];$('pdf-loading-preview').hidden=!item;if(!item)return;$('pdf-loading-image').src=item.dataUrl;$('pdf-preview-position').textContent=(pdfPreviewIndex+1)+' / '+pdfPreviewTotal+'페이지 · '+pdfPreviews.length+'페이지 준비됨';$('pdf-preview-previous').disabled=pdfPreviewIndex<=0;$('pdf-preview-next').disabled=pdfPreviewIndex>=pdfPreviews.length-1;}
$('pdf-preview-previous').onclick=()=>{if(pdfPreviewIndex>0){pdfPreviewIndex--;renderPdfPreview();}};$('pdf-preview-next').onclick=()=>{if(pdfPreviewIndex<pdfPreviews.length-1){pdfPreviewIndex++;renderPdfPreview();}};
$('cancel-document-task').onclick=()=>{if(!$('cancel-document-task').disabled)documentAbort?.abort();};taskDialog.addEventListener('cancel',e=>{e.preventDefault();if(!$('cancel-document-task').disabled)documentAbort?.abort();});
async function documentTask(title,work){if(documentBusy)return;documentBusy=true;pdfPreviews=[];pdfPreviewIndex=0;pdfPreviewTotal=0;$('pdf-loading-preview').hidden=true;$('pdf-loading-image').removeAttribute('src');documentAbort=new AbortController();$('cancel-document-task').disabled=false;const controller=documentAbort;endStroke();editorMenus?.close();$('document-task-title').textContent=title;$('document-task').textContent='준비 중…';taskDialog.showModal();try{return await work({signal:controller.signal,onProgress:progress=>{$('document-task').textContent=typeof progress==='string'?progress:(progress.message||((progress.current||progress.page||0)+' / '+(progress.total||'?')+'페이지 처리 중'));}});}catch(e){toast(e.name==='AbortError'?'작업을 취소했습니다. 기존 노트는 그대로입니다.':e.message||'문서 처리에 실패했습니다.');}finally{taskDialog.close();pdfPreviews=[];$('pdf-loading-image').removeAttribute('src');documentBusy=false;documentAbort=null;}}
photoTools=mountPhotoTools({host:document.querySelector('.editor-chrome'),canvas:$('canvas'),getNote:()=>note,canInteract:()=>!!note&&!switching&&!drawing&&!documentBusy,beforeGesture:()=>{endStroke();clearSelection();drawingTools?.deactivate();$('pan-page').checked=false;},apply:(next,message)=>{if(!note||next.id!==note.id)return false;history.push(note);note=validateNote(next);dirty();render();if(message)toast(message);return true;}});
for(const key of ['pen','eraser','select','open-handwriting','keyboard-text','edit-text','open-pen','pan-page','open-drawing'])$(key).addEventListener('click',()=>photoTools.deactivate(),{capture:true});
$('edit-photos').onclick=()=>{if(!note?.photoObjects?.length)return toast('먼저 사진을 넣어주세요.');photoTools.activate();};
$('insert-photo').onclick=()=>{$('photo-file').value='';$('photo-file').click();};
$('photo-file').onchange=async()=>{const file=$('photo-file').files?.[0];if(!file)return;let added=false;await documentTask('사진 넣기',async({signal})=>{const pageId=note.id,photo=await createPhotoObject(file,{signal});if(signal.aborted)throw new DOMException('취소','AbortError');if(note.id!==pageId)throw Error('페이지가 바뀌었습니다. 다시 사진을 선택해주세요.');const next=validateNote({...note,photoObjects:[...(note.photoObjects||[]),photo]});history.push(note);note=next;dirty();render();added=true;});if(added){photoTools.activate();toast('사진을 끌어 옮기고 모서리로 크기를 조절하세요.');}};
$('import-pdf').onclick=()=>{$('pdf-file').value='';$('pdf-file').click();};
$('pdf-file').onchange=async()=>{const file=$('pdf-file').files?.[0];if(!file)return;await documentTask('PDF 불러오기',async options=>{
 if(listNotebooks(notes).length>=100)throw Error('최대 100개 노트까지 저장할 수 있습니다.');
 const imported=await importPdfPages(file,{...options,onDocument:({total})=>{if(notes.length+total>1000)throw Error('최대 1,000페이지까지 저장할 수 있습니다.');pdfPreviewTotal=total;},onPage:descriptor=>{pdfPreviews.push(descriptor);renderPdfPreview();}});if(options.signal.aborted)throw new DOMException('취소','AbortError');
 const descriptors=Array.isArray(imported)?imported:imported.pages;if(!descriptors?.length)throw Error('PDF 페이지를 가져오지 못했습니다.');if(notes.length+descriptors.length>1000)throw Error('최대 1,000페이지까지 저장할 수 있습니다.');
 if(await flush()===false)throw Error('기존 노트를 먼저 백업하고 저장 상태를 확인해주세요.');options.signal.throwIfAborted();
 const base=makeNote(),title=file.name.replace(/\.pdf$/i,'').slice(0,120)||'PDF 노트';
 const added=descriptors.map((data,i)=>validateNote({...makeNote(),notebookId:base.id,pageOrder:i,title,paper:'plain',pdfBackground:data.pdfBackground||data}));
 options.signal.throwIfAborted();$('cancel-document-task').disabled=true;const saved=await saveNotesBatch(added,new Map(added.map(p=>[p.id,0])));for(const [key,rev]of saved)revisions.set(key,rev);notes.push(...added);activatePage(added[0]);setSave('기기에 저장됨');toast('PDF '+added.length+'페이지를 새 노트로 가져왔습니다. 원문 위에 필기·사진·텍스트를 더할 수 있어요.');
 });};
$('meeting-pdf').onclick=()=> $('export-pdf').onclick();
$('export-pdf').onclick=async()=>{endStroke(true);commitText();$('export-dialog').close();const pages=notebookPdfSnapshot(notes,note),title=(note.title||'KEPCO 노트')+'.pdf';await documentTask('PDF 저장',async options=>{const blob=await exportPdfPages(pages,{...options,renderPage:renderPageCanvas});if(options.signal.aborted)throw new DOMException('취소','AbortError');download(blob,title);toast('PDF 저장을 시작했습니다.');});};

mountEraserSize({document,storage:(()=>{try{return localStorage;}catch{return null;}})(),onChange:()=>{endStroke();showEraser(null);}});
quickPenSize=mountPenSizeControl({id:'quick-pen-size',input:$('width'),onChange:()=>{endStroke();savePenControls();}});

let lastNormalPenKind='ballpoint';
function syncQuickTools(){if(!note)return;if(!['chalk','highlighter'].includes(note.penKind))lastNormalPenKind=note.penKind;const writing=tool==='pen';$('pen').querySelector('img').src='./tool-icons/'+lastNormalPenKind+'.webp';$('pen').setAttribute('title',(PEN_KINDS.find(p=>p.id===lastNormalPenKind)?.label||'볼펜')+' · 종류·굵기·색상');$('pen').classList.toggle('active',writing&&!['chalk','highlighter'].includes(note.penKind));$('pen').setAttribute('aria-pressed',String(writing&&!['chalk','highlighter'].includes(note.penKind)));for(const [id,kind]of [['quick-highlighter','highlighter'],['quick-chalk','chalk']]){const active=writing&&note.penKind===kind;$(id).setAttribute('aria-pressed',String(active));$(id).classList.toggle('active',active);}}
const originalPenClick=$('pen').onclick;
function chooseQuickInk(kind){endStroke();const current=pagePenSettings(note);if(kind==='chalk'&&!isChalkboard(note))note=setChalkboardMode(note,true,current).note;else note=selectPagePen(note,{penKind:kind,width:current.penKind===kind?current.width:(note.perPenWidths?.[kind]??defaultPenWidth(kind))});originalPenClick();dirty();render();syncQuickTools();}
$('pen').addEventListener('click',()=>{if(isChalkboard(note)||['chalk','highlighter'].includes(note.penKind))chooseQuickInk(lastNormalPenKind);editorMenus.close();penPicker.toggle($('pen'));});
$('quick-highlighter').onclick=()=>{chooseQuickInk('highlighter');penPicker.toggle($('quick-highlighter'));};$('quick-chalk').onclick=()=>{chooseQuickInk('chalk');penPicker.toggle($('quick-chalk'));};
for(const id of ['quick-highlighter','quick-chalk'])$(id).addEventListener('click',()=>{drawingTools.deactivate();photoTools.deactivate();editorMenus.close();},{capture:true});
$('tab-open-library').onclick=()=>$('open-library').click();
const workspaceTabs=mountWorkspaceTabs({storage:(()=>{try{return localStorage;}catch{return null;}})(),getBooks:()=>listNotebooks(notes),getCurrent:()=>note?notebookId(note):null,select:openNotebook,canNavigate:()=>{if(switching||documentBusy||meetingDialog.recording||document.querySelector('dialog[open]')){toast('열린 작업을 마친 뒤 노트를 전환해주세요.');return false;}return true;}});
start().then(checkVersion);



// Page management commits content and ordering atomically before changing UI.
async function manageCurrentPage(action){
 const pageId=note.id;
 await transition(async()=>{
  if(note.id!==pageId)throw Error('페이지가 바뀌었습니다. 다시 선택해주세요.');
  const siblings=pagesFor(notes,notebookId(note)),position=siblings.findIndex(p=>p.id===pageId);
  const result=action==='copy'?duplicatePage(notes,pageId):movePage(notes,pageId,position+(action==='up'?-1:1));
  if(!result.changedPages.length)return;
  const saved=await saveNotesBatch(result.changedPages,new Map(result.changedPages.map(p=>[p.id,revisions.get(p.id)||0])));
  for(const [key,rev]of saved)revisions.set(key,rev);
  notes=result.notes;activatePage(result.page);setSave('기기에 저장됨');
 },{keepPagesOpen:true});
}
for(const [key,label,action]of [['pages-copy','현재 페이지 복사','copy'],['pages-up','현재 페이지 앞으로','up'],['pages-down','현재 페이지 뒤로','down']]){
 const button=document.createElement('button');button.id=key;button.type='button';button.textContent=label;
 button.onclick=()=>manageCurrentPage(action);document.querySelector('.page-overview-actions').append(button);
}
$('touch').checked=false;syncFingerMode();
window.addEventListener('pageshow',event=>{if(event.persisted){endStroke(false,drawing?.pointerType==='touch');$('touch').checked=false;syncFingerMode();}});

trashView=mountTrash({
 listTrash,emptyTrash,onError:error=>toast(error?.message||String(error)),
 beforeOpen:async()=>{endStroke();commitText();await flush();setSidebar(false);return true;},
 restoreEntry:async entryId=>{let restoredOk=false;await transition(async()=>{
  const restored=await restoreTrash(entryId);for(const [key,rev]of restored.revisions)revisions.set(key,rev);
  notes.push(...restored.pages.map(validateNote));list();library.refresh();restoredOk=true;
 });return restoredOk;}
});
void trashView.refresh();
window.addEventListener('focus',()=>void trashView.refresh());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void trashView.refresh();});

mountExportOptions({getPages:()=>pagesFor(notes,notebookId(note)),getCurrentId:()=>note.id,exportSelected:async(ids,{share})=>{
 endStroke(true);commitText();if(await flush()===false)return false;
 const all=notebookPdfSnapshot(notes,note),selected=new Set(ids),pages=all.filter(page=>selected.has(page.id));
 if(!pages.length||pages.length!==selected.size){toast('페이지가 바뀌었습니다. 다시 선택해주세요.');return false;}
 const title=(note.title||'KEPCO 노트')+'-선택.pdf';$('export-dialog').close();
 const blob=await documentTask('선택 페이지 PDF 준비',async options=>{
  const result=await exportPdfPages(pages,{...options,renderPage:renderPageCanvas});if(options.signal.aborted)throw new DOMException('취소','AbortError');return result;
 });if(!blob)return false;
 if(!share){download(blob,title);toast('선택한 페이지 PDF 다운로드를 요청했습니다.');return true;}
 const file=new File([blob],title,{type:'application/pdf'}),ready=document.createElement('dialog'),heading=document.createElement('h2'),hint=document.createElement('p'),send=document.createElement('button'),save=document.createElement('button'),close=document.createElement('button');
 heading.textContent='PDF 준비 완료';hint.textContent=pages.length+'페이지 · 공유 버튼을 눌러 보낼 앱을 선택하세요.';send.textContent='준비된 PDF 공유';save.textContent='PDF 파일 저장';close.textContent='닫기';
 // Web Share must run directly from a fresh user gesture, after rendering.
 send.onclick=async()=>{send.disabled=true;try{if(!navigator.share||!navigator.canShare?.({files:[file]})){hint.textContent='이 환경에서는 직접 공유를 지원하지 않습니다. 파일을 저장한 뒤 공유해주세요.';return;}await navigator.share({files:[file],title});ready.close();}catch(error){hint.textContent=error.name==='AbortError'?'공유를 취소했습니다. 다시 시도하거나 파일을 저장할 수 있습니다.':'공유하지 못했습니다. 파일을 저장한 뒤 공유해주세요.';}finally{send.disabled=false;}};
 save.onclick=()=>{download(blob,title);ready.close();toast('PDF 다운로드를 요청했습니다.');};close.onclick=()=>ready.close();ready.addEventListener('close',()=>ready.remove(),{once:true});ready.append(heading,hint,send,save,close);document.body.append(ready);ready.showModal();return true;
}});


// Pause optional snapshot preparation while backgrounded; ordinary flush remains independent.
document.addEventListener('visibilitychange',()=>{if(document.hidden)inkSnapshotWarmer.stop();else if(note)inkSnapshotWarmer.start(note);});
window.addEventListener('pagehide',()=>inkSnapshotWarmer.stop());

// Bookmarks are page metadata; template creation never changes an existing page.
const pageTools=mountPageTools({getNote:()=>note,getPages:()=>pagesFor(notes,notebookId(note)),beforeOpen:async()=>{endStroke();commitText();return flush();},openPage:pageId=>switchNote(pageId),download,onError:e=>toast(e.message),persistBookmark:async(pageId,bookmark)=>{
 let saved=false;await transition(async()=>{const target=notes.find(p=>p.id===pageId);if(!target)throw Error('페이지를 찾을 수 없습니다.');const changed={...target,bookmark,updatedAt:Date.now()};const result=await saveNotesBatch([changed],new Map([[pageId,revisions.get(pageId)||0]]));for(const [key,rev]of result)revisions.set(key,rev);notes=notes.map(p=>p.id===pageId?changed:p);note=notes.find(p=>p.id===note.id);render();saved=true;},{keepPagesOpen:true});return saved;
},createNotebook:async(page)=>{let saved=false;await transition(async()=>{if(notes.length>=1000||listNotebooks(notes).length>=100)throw Error('최대 100개 노트·1,000페이지까지 저장할 수 있어요.');const revision=await saveNote(page);revisions.set(page.id,revision);notes.push(page);activatePage(page);setSave('기기에 저장됨');setSidebar(false);saved=true;});return saved;}});

$('android-legacy-recordings').onclick=()=>meetingDialog.open();

// Native host waits for a positive durable-save result before leaving.
window.__moaBeforeExit=async()=>{if(recognizing||fontBusy||switching||documentBusy||meetingDialog?.recording)return false;stopAuto();endStroke();commitText();const saved=await flush();return saved!==false&&dirtyNotes.size===0;};

// Local video only. Native CSP and bridge intentionally continue to reject remote frames.
videoTools=mountVideoTools({saveNote:()=>flush(),host:document.querySelector('.editor-chrome'),sharedSelection:true,onDone:()=>$('pen').onclick(),page:$('page'),canvas:$('canvas'),getNote:()=>note,makeId:id,toast,canInteract:()=>!!note&&!switching&&!drawing&&!documentBusy,beforeGesture:()=>{endStroke();clearSelection();photoTools?.deactivate();drawingTools?.deactivate();pageSwipe?.cancel();},apply:(next,message)=>{if(!note||next.id!==note.id)return false;const validated=validateNote(next);history.push(note);note=validated;dirty();render();if(message)toast(message);return true;}});
const localVideoButton=document.createElement('button');localVideoButton.type='button';localVideoButton.id='insert-local-video';localVideoButton.textContent='기기 영상 넣기';$('insert-photo').after(localVideoButton);
localVideoButton.onclick=()=>{if(documentBusy||switching)return;endStroke();editorMenus?.close();const requestedPage=note?.id,input=document.createElement('input');input.type='file';input.accept='video/*';input.hidden=true;document.body.append(input);input.onchange=async()=>{const file=input.files?.[0];input.remove();if(!file||note?.id!==requestedPage)return;$('select').onclick();await videoTools.insertLocal(file);};input.oncancel=()=>input.remove();input.click();};
for(const key of ['pen','eraser','select','open-handwriting','keyboard-text','edit-text','open-pen','pan-page','open-drawing'])$(key).addEventListener('click',()=>{if(key==='select')videoTools.arm();else videoTools.deselect();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){videoTools.suspend(true);videoExporter?.cancel();}else videoTools.render();});
videoExporter=mountVideoExport({getPages:()=>pagesFor(notes,notebookId(note)),getCurrentId:()=>note?.id,renderPage:renderPageCanvas,download,onBusyChange:busy=>{documentBusy=busy;},prepare:async()=>{if(!note||switching)throw Error('노트를 먼저 열어주세요.');endStroke();commitText();stopAuto();videoTools.suspend();if(await flush()===false||dirtyNotes.size)throw Error('노트를 저장하지 못했습니다. 저장 상태를 확인해주세요.');},getMediaInfo:(video,page,{signal}={})=>getDeviceVideoInfo(video,{isAllowed:()=>!signal?.aborted&&!document.hidden&&!switching&&!!note&&notebookId(note)===notebookId(page)&&notes.some(p=>p.id===page.id&&p.videoObjects?.some(v=>v.id===video.id&&v.assetId===video.assetId&&v.assetKey===video.assetKey))}),getMediaBlob:(video,page,{signal,maxBytes}={})=>{const book=notebookId(note),allowed=()=>!signal?.aborted&&!document.hidden&&!switching&&!!note&&notebookId(note)===book&&notebookId(page)===book&&notes.some(p=>p.id===page.id&&p.videoObjects?.some(v=>v.id===video.id&&v.assetId===video.assetId&&v.assetKey===video.assetKey));return readDeviceVideo(video,{isAllowed:allowed,maxBytes});}});

// Keep cleanup conservative: cross-window, locked, trash and undo references
// are checked before offering deletion; changing local state invalidates it.
let videoStorageSnapshot='';
const videoReferenceState=()=>JSON.stringify([...collectVideoReferences({pages:[...notes,note].filter(Boolean),trash:[],histories:[history,...pageHistories.values()]})].sort());
mountVideoStorageManager({beforeOpen:async()=>{if(documentBusy||switching||drawing)throw Error('현재 작업을 마친 뒤 열어주세요.');endStroke();commitText();stopAuto();videoTools?.suspend();if(await flush()===false)throw Error('노트를 저장하지 못해 영상 정리를 중단했습니다.');setSidebar(false);},getReferences:async()=>{
 const state=videoReferenceState(),trash=await listTrash(),stored=await getNotes();
 if(state!==videoReferenceState())throw Error('노트 상태가 바뀌었습니다. 다시 확인해주세요.');
 const references=collectVideoReferences({pages:[...notes,note,...stored].filter(Boolean),trash,histories:[history,...pageHistories.values()]});
 videoStorageSnapshot=state;return references;
},canDelete:()=>{try{return !document.hidden&&!documentBusy&&!switching&&!drawing&&videoStorageSnapshot===videoReferenceState();}catch{return false;}}});

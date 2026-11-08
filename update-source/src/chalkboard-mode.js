import {defaultPenColor,normalizePerPenColors} from './pen-color.js';
import {normalizePaperTheme,normalizePaperType} from './paper-themes.js';
import {normalizePenWidth,normalizePerPenWidths,defaultPenWidth} from './pen-width.js';
import {normalizePenKind} from './pen-renderer.js';
export const CHALK_COLORS=Object.freeze([
 {color:'#fffdf0',label:'하얀 분필'},{color:'#ffe27a',label:'노란 분필'},
 {color:'#ffacc4',label:'분홍 분필'},{color:'#9bdcff',label:'하늘 분필'},
 {color:'#ffc58b',label:'주황 분필'},{color:'#d1bcff',label:'보라 분필'}
].map(Object.freeze));
export const isChalkboard=note=>note?.paperTheme==='chalkboard';
const color=(v,fallback)=>typeof v==='string'&&/^#[a-f0-9]{6}$/i.test(v)?v.toLowerCase():fallback;
const width=normalizePenWidth;
export function normalizePenSettings(input,fallback={color:'#223247',width:3}){
 return {color:color(input?.color,fallback.color),width:width(input?.width,fallback.width)};
}
export function normalizeChalkboardPrevious(input){
 if(!input||typeof input!=='object')return null;
 const paperTheme=normalizePaperTheme(input.paperTheme),penKind=normalizePenKind(input.penKind);
 return {paperTheme:paperTheme==='chalkboard'?'white':paperTheme,paper:normalizePaperType(input.paper),penKind:penKind==='legacy'?'ballpoint':penKind,...normalizePenSettings(input)};
}
/** Current page's future-ink controls. Old notes never inherit white chalk ink. */
export function pagePenSettings(note,fallback){
 const board=isChalkboard(note),defaults=board?{color:CHALK_COLORS[0].color,width:5}:(fallback||{color:defaultPenColor(note?.penKind),width:3});
 const kind=normalizePenKind(note?.penKind);
 return {penKind:kind==='legacy'?(board?'chalk':'ballpoint'):kind,...normalizePenSettings(note?.penSettings,defaults)};
}
export function withPagePenSettings(note,settings){
 const current=pagePenSettings(note),kind=normalizePenKind(settings?.penKind??current.penKind);
 const nextKind=kind==='legacy'?'ballpoint':kind,penSettings=normalizePenSettings(settings,current);
 const perPenWidths={...normalizePerPenWidths(note.perPenWidths),[current.penKind]:current.width,...normalizePerPenWidths(settings?.perPenWidths),[nextKind]:penSettings.width};
 const perPenColors={...normalizePerPenColors(note.perPenColors),[current.penKind]:current.color,...normalizePerPenColors(settings?.perPenColors),[nextKind]:penSettings.color};
 return {...note,penKind:nextKind,penSettings,perPenWidths,perPenColors};
}
/** Pure page-local mode toggle. Existing strokes/photos/text are never rewritten. */
export function setChalkboardMode(note,enabled,currentSettings=pagePenSettings(note)){
 if(enabled){
  if(isChalkboard(note))return {note,settings:pagePenSettings(note)};
  const previous=normalizeChalkboardPrevious({...note,...currentSettings});
  const settings={penKind:'chalk',color:normalizePerPenColors(note.perPenColors).chalk??CHALK_COLORS[0].color,width:normalizePerPenWidths(note.perPenWidths).chalk??5};
  return {note:{...withPagePenSettings(note,settings),paperTheme:'chalkboard',paper:'plain',penKind:'chalk',penSettings:{color:settings.color,width:settings.width},chalkboardPrevious:previous},settings};
 }
 if(!isChalkboard(note))return {note,settings:pagePenSettings(note)};
 const previous=normalizeChalkboardPrevious(note.chalkboardPrevious)||{paperTheme:'white',paper:'ruled',penKind:'ballpoint',color:'#223247',width:3};
 const settings={penKind:previous.penKind,color:previous.color,width:previous.width};
 return {note:{...withPagePenSettings(note,settings),paperTheme:previous.paperTheme,paper:previous.paper,penKind:previous.penKind,penSettings:{color:previous.color,width:previous.width},chalkboardPrevious:null},settings};
}

/** Explicit pen choice, not tool activation or page reload. Restore paper first,
 * then apply the user's new pen so the old saved pen cannot overwrite it.
 * Omitting color (quick toolbar) resumes ordinary ink rather than white chalk. */
export function selectPagePen(note,settings){
 const kind=normalizePenKind(settings?.penKind);
 if(kind==='legacy')return note;
 const base=isChalkboard(note)&&kind!=='chalk'?setChalkboardMode(note,false).note:note;
 const current=pagePenSettings(base),colors={...normalizePerPenColors(base.perPenColors),[current.penKind]:current.color,...normalizePerPenColors(settings?.perPenColors)};
 return withPagePenSettings(base,{...settings,color:settings?.color??colors[kind]??(kind==='highlighter'||kind==='chalk'||current.penKind==='highlighter'||current.penKind==='chalk'?defaultPenColor(kind):current.color),penKind:kind});
}


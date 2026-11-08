import {COVER_PRESETS,normalizeCover,normalizeBinding,normalizeCoverTitleSize} from './notebook-covers.js';
import {listNotebooks,notebookId} from './notebooks.js';
import {pageMatchesQuery} from './content-search.js';
/** Search titles and saved readable page content, never raw handwriting. */
export function deriveLibrary(notes,{query='',sort='recent',favoritesOnly=false,category='all'}={}){
 const needle=typeof query==='string'?query.trim().toLocaleLowerCase('ko-KR'):'';
 return listNotebooks(notes).map((book,index)=>({...book,updatedAt:Math.max(0,...book.pages.map(page=>Number.isFinite(page.updatedAt)?page.updatedAt:0)),favorite:book.pages.some(page=>page.favorite===true),coverPage:book.pages[0],cover:normalizeCover(book.pages[0]?.cover),coverTitleSize:normalizeCoverTitleSize(book.pages[0]?.coverTitleSize),binding:normalizeBinding(book.pages[0]?.binding),index}))
  .filter(book=>(category!=='meeting'||book.pages[0]?.notebookKind==='meeting')&&(!favoritesOnly||book.favorite)&&(!needle||book.pages.some(page=>pageMatchesQuery(page,needle))))
  .sort((a,b)=>(sort==='name'?a.title.localeCompare(b.title,'ko'):b.updatedAt-a.updatedAt)||a.index-b.index)
  .map(({index,...book})=>book);
}
/** Metadata-only immutable toggle; preserve content timestamps and raw ink. */
export function setNotebookFavorite(notes,bookId,value){
 const favorite=value===true;
 return notes.map(page=>notebookId(page)===bookId&&page.favorite!==favorite?{...page,favorite}:page);
}

/** Validated notebook-wide metadata edit; content and modification times survive. */
export function setNotebookMetadata(notes,bookId,{title,cover,binding,coverTitleSize}={}){
 const patch={};
 if(coverTitleSize!==undefined){if(typeof coverTitleSize!=='number'||!Number.isFinite(coverTitleSize)||coverTitleSize<80||coverTitleSize>180)throw Error('표지 제목 크기는 80~180%로 선택해주세요.');patch.coverTitleSize=normalizeCoverTitleSize(coverTitleSize);}
 if(title!==undefined){if(typeof title!=='string'||!title.trim()||title.trim().length>120)throw Error('노트 제목은 공백을 제외하고 1~120자로 입력해주세요.');patch.title=title.trim();}
 if(cover!==undefined){if(!COVER_PRESETS.some(p=>p.id===cover))throw Error('지원하는 노트 표지를 선택해주세요.');patch.cover=cover;}
 if(binding!==undefined){if(!['bound','spring'].includes(binding))throw Error('지원하는 제본 방식을 선택해주세요.');patch.binding=binding;}
 return notes.map(page=>notebookId(page)===bookId&&Object.entries(patch).some(([key,value])=>page[key]!==value)?{...page,...patch}:page);
}


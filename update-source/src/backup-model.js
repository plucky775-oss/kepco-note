import {parseTemplates} from './page-templates.js';
import {parseBackup} from './core.js';
import {readDiaryBackup,DIARY_BACKUP_BYTES} from './diary-dialog.js';
export const NOTE_BACKUP_BYTES=25*1024*1024;
export function inspectBackup(text){
 const data=JSON.parse(text);if(!data||typeof data!=='object')throw Error('백업 형식이 올바르지 않습니다.');
 if(data.kind==='nib-blank-page-templates'){const templates=parseTemplates(text);return {kind:'templates',data,templates,count:templates.length,items:templates.map(t=>t.name),warning:'빈 양식만 별도 보관합니다. 기존 양식과 노트는 유지하고 새 양식으로 추가합니다. 모든 글·필기·사진·PDF·회의 정보는 제외됩니다.'};}
 if(data.format==='moa-diary-backup'){
  if(!data.diary||!Array.isArray(data.diary.entries))throw Error('다이어리 기록이 없는 파일입니다.');
  const diary=readDiaryBackup(text);return {kind:'diary',data,diary,count:diary.entries.length,items:diary.entries.map(e=>`${e.date} · ${e.title}`),warning:'노트·녹음·내 글씨체 파일은 포함되지 않습니다. 복원 시 알림과 회의 연결은 해제됩니다.'};
 }
 if(new TextEncoder().encode(text).byteLength>NOTE_BACKUP_BYTES)throw Error('노트 백업은 25MB 이하로 선택해주세요.');
 const pages=parseBackup(text),ids=new Set();for(const p of pages){if(!p.id||ids.has(p.id))throw Error('페이지를 구분하는 정보가 없거나 중복되어 복원할 수 없습니다.');ids.add(p.id);}
 const split=data.part!==undefined||data.partCount!==undefined;
 if(split&&(!Number.isSafeInteger(data.part)||!Number.isSafeInteger(data.partCount)||data.part<1||data.partCount<1||data.part>data.partCount||typeof data.backupSetId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(data.backupSetId)))throw Error('분할 백업 정보가 올바르지 않습니다.');
 return {kind:'notes',data,pages,count:pages.length,items:pages.map(p=>p.title||'제목 없는 노트'),warning:`다이어리·녹음 원본·녹음창의 편집 중 회의록·내 글씨체 파일·휴지통·별도 보관 양식은 제외됩니다.${split?` 분할 파일 ${data.part}/${data.partCount}: 앱을 닫거나 새로고침하지 않은 상태에서 모든 파일을 확인하고 복원하세요.`:''}`};
}
export async function readBackupFile(file){if(!file||file.size>DIARY_BACKUP_BYTES)throw Error('백업 파일은 256MiB 이하로 선택해주세요.');return inspectBackup(await file.text());}
export async function fingerprint(blob,subtle=globalThis.crypto?.subtle){if(!subtle)throw Error('이 환경에서는 파일이 원본과 같은지 확인할 수 없습니다.');return Array.from(new Uint8Array(await subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');}
export async function verifyDownload(file,receipt){if(!receipt)throw Error('먼저 이 화면에서 다운로드를 요청해주세요.');if(file.size!==receipt.size||await fingerprint(file)!==receipt.digest)throw Error('요청한 원본과 다른 파일입니다. 올바른 다운로드 파일을 선택해주세요.');return true;}

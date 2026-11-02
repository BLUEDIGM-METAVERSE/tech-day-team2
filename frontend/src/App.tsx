import { useRef, useState } from 'react';
import type { ExpenseRow, ReceiptData, ReceiptResult } from './types/receipt';
import { UploadPanel } from './components/UploadPanel';
import { ResultPanel } from './components/ResultPanel';
import { ExpenseList } from './components/ExpenseList';
import { PhoneLink } from './components/PhoneLink';
import { PhoneCapture } from './components/PhoneCapture';
import { extractSample } from './services/extract';
import { resizeImage } from './utils/image';
import { sectionOf } from './utils/excel';

// 같은 경비 구분 안에서 일자가 빠른 순으로 들어갈 자리를 찾는다. 일자가 없으면 맨 뒤.
// 사용자가 바꿔 둔 기존 순서는 건드리지 않는다.
function insertByDate(list: ExpenseRow[], row: ExpenseRow): ExpenseRow[] {
  const section = sectionOf(row.data);
  const date = row.data.date ?? '9999-99-99';
  let at = list.length;
  for (let i = 0; i < list.length; i++) {
    if (sectionOf(list[i].data) !== section) continue;
    if ((list[i].data.date ?? '9999-99-99') > date) { at = i; break; }
  }
  return [...list.slice(0, at), row, ...list.slice(at)];
}
// 같은 경비 구분 안에서 한 칸 위(-1) 또는 아래(+1)로 옮긴다.
function moveWithinSection(list: ExpenseRow[], id: string, dir: -1 | 1): ExpenseRow[] {
  const target = list.find(r => r.id === id);
  if (!target) return list;
  const idx = list.map((r, i) => sectionOf(r.data) === sectionOf(target.data) ? i : -1).filter(i => i >= 0);
  const pos = idx.indexOf(list.indexOf(target));
  const swap = idx[pos + dir];
  if (swap === undefined) return list;
  const next = [...list];
  [next[idx[pos]], next[swap]] = [next[swap], next[idx[pos]]];
  return next;
}

// ?room=코드로 열리면 폰 촬영 전용 화면, 아니면 PC 작업 화면.
export default function App() {
  const params = new URLSearchParams(location.search);
  const code = params.get('room'); const key = params.get('key');
  return code && /^\d{6}$/.test(code) ? <PhoneCapture room={{ code, key: key ?? '' }}/> : <Workspace/>;
}

function Workspace() {
  const [preview,setPreview]=useState<string|null>(null);
  const [draft,setDraft]=useState<ReceiptResult|null>(null);
  const [rows,setRows]=useState<ExpenseRow[]>([]);
  const [busy,setBusy]=useState(false);
  const [preparing,setPreparing]=useState(false);
  const preparingRef=useRef(false);
  const previewRef=useRef<string|null>(null);
  const requestRef=useRef(false);
  const [error,setError]=useState('');
  const version=useRef(0);
  const nextId=useRef(1); // http 접속(폰)에서는 crypto.randomUUID를 쓸 수 없어 일련번호를 쓴다.
  async function select(file?: File) {
    if(requestRef.current) return;
    const current=++version.current; previewRef.current=null; setDraft(null); setPreview(null); setError('');
    if (!file) {preparingRef.current=false; setPreparing(false); return;}
    preparingRef.current=true; setPreparing(true);
    try { const image=await resizeImage(file); if(current===version.current) {previewRef.current=image; setPreview(image);} }
    catch(e) { if(current===version.current) setError(e instanceof Error ? e.message : '이미지를 읽을 수 없습니다. 다른 이미지를 선택해 주세요.'); }
    finally { if(current===version.current) {preparingRef.current=false; setPreparing(false);} }
  }
  // 폰에서 넘어온 이미지는 이미 1600px로 줄어 있어 그대로 미리보기에 넣는다.
  function receiveImage(dataUrl: string) { if(preparingRef.current || requestRef.current || previewRef.current) return false; previewRef.current=dataUrl; version.current++; setDraft(null); setError(''); setPreview(dataUrl); return true; }
  async function extract() {
    if(requestRef.current || preparingRef.current || !preview) return;
    requestRef.current=true;
    const current=version.current;
    setBusy(true); setError(''); setDraft(null);
    try { const result=await extractSample(); if(current===version.current) setDraft(result); } catch(e) {setError(e instanceof Error ? e.message : '처리에 실패했습니다.');} finally {requestRef.current=false; setBusy(false);}
  }
  // 확인한 행을 일자순 자리에 넣고 다음 영수증을 받을 수 있게 비운다. 이미지는 메모리에서만 쓰고 보관하지 않는다.
  function addRow() {
    if(!draft) return;
    const row={...draft,id:String(nextId.current++)};
    setRows(list=>insertByDate(list,row));
    version.current++; previewRef.current=null; setDraft(null); setPreview(null);
  }
  function changeRow(id: string, data: Partial<ReceiptData>) { setRows(list=>list.map(r=>r.id===id ? {...r,data:{...r.data,...data}} : r)); }
  function removeRow(id: string) { setRows(list=>list.filter(r=>r.id!==id)); }
  function moveRow(id: string, dir: -1 | 1) { setRows(list=>moveWithinSection(list,id,dir)); }
  const draftSection=draft ? sectionOf(draft.data) : 'dept';
  const nextNo=rows.filter(r=>sectionOf(r.data)===draftSection).length+1;
  return <><header><div className="brand">지출결의서 자동화 <span>테크데이 2팀</span></div><span className="badge">OCR 시제품 · 샘플 모드</span></header>
    <main><div className="intro"><p>RECEIPT WORKSPACE</p><h1>영수증에서 필요한 정보만 간편하게</h1><p>영수증을 한 장씩 확인해 목록에 쌓은 뒤 한 번에 복사하세요. 새로고침하면 작업 내용이 사라집니다.</p></div>
      <nav aria-label="작업 순서"><span>01 영수증 선택</span><span>02 OCR 추출</span><span>03 확인 후 목록에 추가</span><span>04 한 번에 복사</span></nav>
      {error && <p className="error" role="alert">{error}</p>}
      <PhoneLink idle={!preview && !busy && !preparing} onImage={receiveImage}/>
      <div className="grid">
        <UploadPanel preview={preview} busy={busy} preparing={preparing} onSelect={select} onExtract={extract}/>
        <ResultPanel draft={draft} nextNo={nextNo} onChange={setDraft} onAdd={addRow} onDiscard={()=>setDraft(null)}/>
      </div>
      <ExpenseList rows={rows} onChange={changeRow} onRemove={removeRow} onMove={moveRow}/>
    </main></>;
}

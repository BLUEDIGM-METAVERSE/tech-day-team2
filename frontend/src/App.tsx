import { withExpenseDefaults } from './constants/accounts';
import { useEffect, useRef, useState } from 'react';
import type { ExpenseRow, ReceiptData, ReceiptResult } from './types/receipt';
import { UploadPanel } from './components/UploadPanel';
import { ResultPanel } from './components/ResultPanel';
import { ExpenseList } from './components/ExpenseList';
import { PhoneLink } from './components/PhoneLink';
import { PhoneCapture } from './components/PhoneCapture';
import { extractReceipt, getOcrMode, type OcrMode } from './services/extract';
import { resizeImage } from './utils/image';
import { sectionOf } from './utils/excel';
import { ReceiptPrintPanel } from './components/ReceiptPrintPanel';
import type { PrintItem, PrintPhoto } from './types/print';
import { loadPrintImage } from './utils/printImage';

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
  const [mode, setMode] = useState<OcrMode | null>(null);
  const [modeError, setModeError] = useState('');
  const [modeAttempt, setModeAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5_000)]);
    getOcrMode(signal).then(
      value => { if (!controller.signal.aborted) setMode(value); },
      error => { if (!controller.signal.aborted) setModeError(error.message); },
    );
    return () => controller.abort();
  }, [modeAttempt]);
  const [tab, setTab] = useState<'ocr' | 'print'>('ocr');
  const [printItems, setPrintItems] = useState<PrintItem[]>([]);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [pendingImages, setPendingImages] = useState(0);
  const pendingImagesRef = useRef(0);
  const [importingPrint, setImportingPrint] = useState(false);
  const importingPrintRef = useRef(false);
  const nextImageId = useRef(1);
  async function registerPrint(original: string, name: string, source: PrintPhoto['source']) {
    const id = `print-${nextImageId.current++}`;
    pendingImagesRef.current++; setPendingImages(count => count + 1);
    try {
      const image = await loadPrintImage(original);
      const photo: PrintPhoto = { id, kind: 'photo', name, source, original, output: original, width: image.naturalWidth, height: image.naturalHeight, crop: null, rotation: 0 };
      setPrintItems(list => [...list, photo]);
      if (source === 'ocr') setUploadedCount(count => count + 1);
    } finally { pendingImagesRef.current--; setPendingImages(count => count - 1); }
  }
  async function addPrintFiles(files: File[]) {
    if (importingPrintRef.current) return;
    importingPrintRef.current = true; setImportingPrint(true); setError('');
    const failures: string[] = [];
    try {
      for (const file of files) {
        try { const image = await resizeImage(file); await registerPrint(image, file.name, 'print'); }
        catch { failures.push(file.name); }
      }
      if (failures.length) setError(`불러오지 못한 파일: ${failures.join(', ')}. JPG·PNG·WebP 파일인지 확인해 주세요.`);
    } finally { importingPrintRef.current = false; setImportingPrint(false); }
  }
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
    try { const image=await resizeImage(file); if(current===version.current) { await registerPrint(image, file.name, 'ocr'); if(current===version.current) {previewRef.current=image; setPreview(image);} } }
    catch(e) { if(current===version.current) setError(e instanceof Error ? e.message : '이미지를 읽을 수 없습니다. 다른 이미지를 선택해 주세요.'); }
    finally { if(current===version.current) {preparingRef.current=false; setPreparing(false);} }
  }
  // 폰에서 넘어온 이미지는 이미 1600px로 줄어 있어 그대로 미리보기에 넣는다.
  function receiveImage(dataUrl: string) {
    if (tab === 'print') {
      if (importingPrintRef.current || pendingImagesRef.current) return false;
      void registerPrint(dataUrl, `휴대폰 사진 ${nextImageId.current}`, 'print').catch(() => setError('휴대폰 사진을 읽지 못했습니다. 다시 보내 주세요.'));
      return true;
    }
    if (preparingRef.current || requestRef.current || previewRef.current) return false;
    previewRef.current=dataUrl; version.current++; setDraft(null); setError(''); setPreview(dataUrl);
    void registerPrint(dataUrl, `휴대폰 사진 ${nextImageId.current}`, 'ocr').catch(() => setError('출력 사진을 준비하지 못했습니다. 다시 보내 주세요.'));
    return true;
  }
  // Paste follows the visible tab. Input fields and the crop/masking dialogs keep their own input behavior.
  useEffect(() => {
    function paste(event: ClipboardEvent) {
      if (event.defaultPrevented || document.querySelector('dialog[open]') || (event.target instanceof Element && event.target.closest('input,textarea,[contenteditable="true"]'))) return;
      const files = [...(event.clipboardData?.files ?? [])];
      if (!files.length) return;
      event.preventDefault();
      if (tab === 'print') void addPrintFiles(files);
      else if (!preparingRef.current && !requestRef.current) void select(files[0]);
    }
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  });

  async function extract(image?: string) {
    if(requestRef.current || preparingRef.current || !preview || !mode || (mode === 'gemini' && !image)) return;
    requestRef.current=true;
    const current=version.current;
    setBusy(true); setError(''); setDraft(null);
    try {
      const result = await extractReceipt(mode === 'gemini' ? image : undefined);
      if (current === version.current) setDraft({ ...result, data: withExpenseDefaults(result.data) });
    } catch (error) {
      if (current === version.current) setError(error instanceof Error ? error.message : '처리에 실패했습니다.');
    } finally {
      requestRef.current = false;
      setBusy(false);
    }
  }
  // 확인한 행을 일자순 자리에 넣고 다음 영수증을 받을 수 있게 비운다. 출력용 이미지는 별도 메모리 목록에서 유지한다.
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
  return <><header><div className="brand">지출결의서 자동화 <span>테크데이 2팀</span></div><span className="badge">{mode === 'gemini' ? 'OCR · Gemini 모드' : mode === 'mock' ? 'OCR 시제품 · 샘플 모드' : 'OCR 모드 연결 대기'}</span></header>
    <main><div className="intro"><p>RECEIPT WORKSPACE</p><h1>영수증에서 필요한 정보만 간편하게</h1><p>영수증을 한 장씩 확인해 목록에 쌓은 뒤 한 번에 복사하세요. 새로고침하면 작업 내용이 사라집니다.</p></div>
      <nav className="workspace-tabs" role="tablist" aria-label="영수증 작업 메뉴">
        {([['ocr', '01 영수증 업로드 및 OCR 추출'], ['print', `02 영수증 배치 및 출력 (${uploadedCount})`]] as const).map(([id, label]) => <button key={id} id={`${id}-tab`} type="button" role="tab" aria-controls={`${id}-panel`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); const next = event.key === 'Home' ? 'ocr' : event.key === 'End' ? 'print' : id === 'ocr' ? 'print' : 'ocr'; setTab(next); document.getElementById(`${next}-tab`)?.focus();
        }}>{label}</button>)}
      </nav>
      <PhoneLink destination={tab} idle={tab === 'print' ? !importingPrint && pendingImages === 0 : !preview && !busy && !preparing} onImage={receiveImage}/>
      <div className="app-errors">
        {error && <p className="error" role="alert">{error}</p>}
        {tab === 'ocr' && modeError && <p className="error" role="alert">{modeError} <button onClick={() => { setModeError(''); setModeAttempt(attempt => attempt + 1); }}>다시 연결</button></p>}
      </div>
      <section id="ocr-panel" className="ocr-workspace" role="tabpanel" aria-labelledby="ocr-tab" hidden={tab !== 'ocr'}>
        <div className="grid">
          <UploadPanel preview={preview} busy={busy} preparing={preparing} mode={mode} onSelect={select} onExtract={extract} onMaskEdit={() => { setDraft(null); setError(''); }}/>
          <ResultPanel draft={draft} nextNo={nextNo} onChange={setDraft} onAdd={addRow} onDiscard={()=>setDraft(null)}/>
        </div>
        <ExpenseList rows={rows} onChange={changeRow} onRemove={removeRow} onMove={moveRow}/>
      </section>
      <section id="print-panel" className="print-tab-panel" role="tabpanel" aria-labelledby="print-tab" hidden={tab !== 'print'}>
        <ReceiptPrintPanel items={printItems} processing={importingPrint || pendingImages > 0} onChange={setPrintItems} onFiles={files => void addPrintFiles(files)} onBlank={size => {
          const id = `print-${nextImageId.current++}`; setPrintItems(list => [...list, { id, kind: 'blank', size }]);
        }}/>
      </section>
    </main></>;
}

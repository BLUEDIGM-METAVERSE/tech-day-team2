import { useRef, useState } from 'react';
import type { ReceiptResult } from './types/receipt';
import { UploadPanel } from './components/UploadPanel';
import { ResultPanel } from './components/ResultPanel';
import { extractSample } from './services/extract';
import { resizeImage } from './utils/image';
export default function App() {
  const [preview,setPreview]=useState<string|null>(null);
  const [result,setResult]=useState<ReceiptResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const version=useRef(0);
  async function select(file?: File) {
    const current=++version.current; setResult(null); setPreview(null); setError('');
    if (!file) return;
    try { const image=await resizeImage(file); if(current===version.current) setPreview(image); }
    catch(e) { if(current===version.current) setError(e instanceof Error ? e.message : '이미지를 읽을 수 없습니다. 다른 이미지를 선택해 주세요.'); }
  }
  async function extract() {
    if(busy || !preview) return;
    setBusy(true); setError(''); setResult(null);
    try { setResult(await extractSample()); } catch(e) {setError(e instanceof Error ? e.message : '처리에 실패했습니다.');} finally {setBusy(false);}
  }
  return <><header><div className="brand">지출결의서 자동화 <span>테크데이 2팀</span></div><span className="badge">OCR 시제품 · 샘플 모드</span></header>
    <main><div className="intro"><p>RECEIPT WORKSPACE</p><h1>영수증에서 필요한 정보만 간편하게</h1><p>이미지를 선택하고 추출 결과를 확인하세요. 새로고침하면 작업 내용이 사라집니다.</p></div>
      <nav aria-label="작업 순서"><span>01 영수증 선택</span><span>02 OCR 추출</span><span>03 결과 확인·수정</span></nav>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="grid"><UploadPanel preview={preview} busy={busy} onSelect={select} onExtract={extract}/><ResultPanel result={result} onChange={setResult}/></div>
    </main></>;
}

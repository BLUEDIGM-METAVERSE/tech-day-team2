import type { OcrMode } from '../services/extract';
import { ReceiptMaskEditor } from './ReceiptMaskEditor';

interface Props {
  preview: string | null;
  busy: boolean;
  preparing: boolean;
  mode: OcrMode | null;
  onSelect: (file?: File) => void;
  onExtract: (image?: string) => void;
  onMaskEdit: () => void;
}

export function UploadPanel({ preview, busy, preparing, mode, onSelect, onExtract, onMaskEdit }: Props) {
  const disabled = busy || preparing;
  const gemini = mode === 'gemini';
  return <section aria-busy={disabled} className="card">
    <h2>영수증 업로드</h2>
    <p className="hint">QR로 사진을 보내거나 JPG·PNG·WebP 파일을 선택하세요.</p>
    <label className="drop">이미지 선택<input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={e => {const file=e.target.files?.[0]; e.target.value=''; if(file) onSelect(file);}} /></label>
    {preview && <button disabled={disabled} onClick={() => onSelect()}>이미지 제거</button>}
    {gemini && preview ? <ReceiptMaskEditor key={preview} preview={preview} disabled={disabled} busy={busy}
      onExtract={onExtract} onEdit={onMaskEdit}/> : <>
      {preview && <img className="preview" src={preview} alt="선택한 영수증 미리보기" />}
      <button className="primary" disabled={!mode || !preview || disabled} onClick={() => onExtract()}>
        {preparing ? '이미지 준비 중…' : busy ? '처리 중…' : gemini ? '결과 불러오기' : mode === 'mock' ? '샘플 결과 불러오기' : 'OCR 연결 확인 필요'}
      </button>
    </>}
    <p className="hint">{gemini ? '결과 불러오기를 누르면 PC에서 가림을 적용한 사진을 Google Gemini로 전송합니다.' : mode === 'mock' ? '샘플 모드입니다. 선택한 사진을 읽지 않고 고정 샘플 결과를 표시합니다.' : 'OCR 서버에 연결되면 결과를 불러올 수 있습니다.'}</p>
    <p role="status" aria-live="polite">{busy ? '영수증 결과를 가져오고 있습니다.' : preparing ? '이미지를 준비하고 있습니다.' : preview ? '이미지가 준비되었습니다.' : '이미지를 선택해 주세요.'}</p>
  </section>;
}

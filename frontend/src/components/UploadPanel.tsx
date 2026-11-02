import { useState } from 'react';
interface Props { preview: string | null; busy: boolean; onSelect: (file?: File) => void; onExtract: () => void }
export function UploadPanel({preview,busy,onSelect,onExtract}: Props) {
  const [preparing, setPreparing] = useState(false);
  const disabled = busy || preparing;
  return <section aria-busy={disabled} className="card"><h2>영수증 업로드</h2><p className="hint">마스킹한 JPG·PNG·WebP 샘플을 선택하세요.</p>
    <label className="drop">이미지 선택<input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} aria-describedby="upload-help" onChange={async e => {const file=e.target.files?.[0]; e.target.value=''; if (!file) return; setPreparing(true); try { await onSelect(file); } finally { setPreparing(false); }}} /></label>
    {preview && <><img className="preview" src={preview} alt="선택한 영수증 미리보기" /><button disabled={disabled} onClick={() => onSelect()}>이미지 제거</button></>}
    <button className="primary" disabled={!preview || disabled} onClick={onExtract}>{preparing ? '이미지 준비 중…' : busy ? '처리 중…' : '샘플 결과 불러오기'}</button>
    <p role="status" aria-live="polite">{preparing ? '이미지를 준비하고 있습니다.' : preview ? '이미지가 준비되었습니다.' : '이미지를 선택해 주세요.'}</p>
    <p id="upload-help" className="hint">현재 이미지는 서버로 전송하지 않습니다. 실제 OCR·가리기 기능은 후속 작업입니다.</p>
  </section>;
}

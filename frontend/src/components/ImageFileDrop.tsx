import { useRef, useState, type ClipboardEvent } from 'react';

interface Props { disabled?: boolean; multiple?: boolean; onFiles: (files: File[]) => void; label?: string }
export function ImageFileDrop({ disabled = false, multiple = false, onFiles, label = '영수증 사진 선택' }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  function accept(files: File[]) { if (!disabled && files.length) onFiles(multiple ? files : files.slice(0, 1)); }
  function paste(event: ClipboardEvent) {
    const files = [...event.clipboardData.files];
    if (files.length) { event.preventDefault(); accept(files); }
  }
  return <div className="file-drop-wrapper" onPaste={paste}>
    <button type="button" className={`image-file-drop${over ? ' over' : ''}`} disabled={disabled} aria-label={label}
      onClick={() => input.current?.click()}
      onDragOver={event => { event.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={event => { event.preventDefault(); setOver(false); accept([...event.dataTransfer.files]); }}>
      클릭해서 파일 선택<br/>또는 여기로 드래그 / <b>Ctrl+V</b> 붙여넣기<br/>
      <small>JPG · PNG · WebP{multiple ? ' 여러 장 가능' : ' 한 장씩 선택'}</small>
    </button>
    <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" multiple={multiple} disabled={disabled}
      onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; accept(files); }}/>
  </div>;
}

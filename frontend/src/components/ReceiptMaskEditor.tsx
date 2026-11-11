import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { drawReceipt, exportReceipt, type MaskRegion, type Point } from '../utils/masking';

interface Props {
  preview: string;
  disabled: boolean;
  busy: boolean;
  onExtract: (image: string) => void;
  onEdit: () => void;
}

function position(event: PointerEvent<HTMLCanvasElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp((event.clientY - bounds.top) / bounds.height),
  };
}

export function ReceiptMaskEditor({ preview, disabled, busy, onExtract, onEdit }: Props) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const thumbnail = useRef<HTMLCanvasElement>(null);
  const active = useRef<{ pointerId: number; start: Point } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [regions, setRegions] = useState<MaskRegion[]>([]);
  const [selection, setSelection] = useState<MaskRegion | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    const source = new Image();
    source.onload = () => setImage(source);
    source.onerror = () => setError('마스킹할 사진을 불러오지 못했습니다.');
    source.src = preview;
    return () => { source.onload = null; source.onerror = null; };
  }, [preview]);

  useLayoutEffect(() => {
    if (!canvas.current || !image) return;
    try {
      drawReceipt(canvas.current, image, selection ? [...regions, selection] : regions);
    } catch {
      setError('마스킹 미리보기를 표시하지 못했습니다.');
    }
  }, [image, regions, selection]);

  useLayoutEffect(() => {
    if (!thumbnail.current || !image) return;
    try {
      drawReceipt(thumbnail.current, image, regions);
    } catch {
      setError('마스킹 미리보기를 표시하지 못했습니다.');
    }
  }, [image, regions]);

  function edit() {
    setConfirmed(false);
    onEdit();
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled || error || active.current || event.button !== 0) return;
    const start = position(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = { pointerId: event.pointerId, start };
    setSelection({ start, end: start });
    edit();
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (active.current?.pointerId !== event.pointerId) return;
    setSelection({ start: active.current.start, end: position(event) });
  }

  function finish(event: PointerEvent<HTMLCanvasElement>) {
    if (active.current?.pointerId !== event.pointerId) return;
    const start = active.current.start;
    const end = position(event);
    if (start.x !== end.x && start.y !== end.y) setRegions(current => [...current, { start, end }]);
    cancel(event);
  }

  function cancel(event: PointerEvent<HTMLCanvasElement>) {
    if (active.current?.pointerId !== event.pointerId) return;
    active.current = null;
    setSelection(null);
  }

  function extract() {
    if (!image || !confirmed || disabled || active.current) return;
    try {
      onExtract(exportReceipt(image, regions));
    } catch {
      setError('가려진 사진을 만들지 못했습니다. 이미지를 다시 선택해 주세요.');
    }
  }

  const editing = !!selection;
  return <div>
    {image && <button type="button" className="receipt-mask-thumbnail" disabled={disabled}
      aria-label="영수증 사진 크게 보기 및 가리기" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
      <canvas ref={thumbnail} className="preview" width={image.naturalWidth} height={image.naturalHeight} aria-hidden="true" />
    </button>}
    {image && <p className="hint">사진을 클릭하면 크게 보거나 가릴 수 있습니다.</p>}
    {regions.length > 0 && <p className="hint">가린 영역 {regions.length}개</p>}
    {confirmed && <p className="hint">전송할 사진을 확인했습니다.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <dialog ref={dialog} className="receipt-mask-dialog" aria-labelledby={titleId} onClose={() => {
      active.current = null;
      setSelection(null);
    }}>
      <div className="receipt-mask-heading">
        <h2 id={titleId}>영수증에서 민감정보 가리기</h2>
        <button type="button" onClick={() => dialog.current?.close()}>닫기</button>
      </div>
      <p className="hint">사진에서 카드번호나 주소를 드래그해 가리세요. 확대하면 스크롤로 사진의 다른 부분을 볼 수 있습니다.</p>
      <div className="receipt-mask-toolbar receipt-mask-controls">
        <label className="receipt-mask-zoom">확대 <span className="receipt-mask-select"><select value={zoom} disabled={editing} onChange={event => setZoom(Number(event.target.value))}>
          <option value={100}>너비 맞춤</option>
          <option value={150}>150%</option>
          <option value={200}>200%</option>
        </select></span></label>
        <button type="button" disabled={disabled || editing || !regions.length} onClick={() => {
          setRegions(current => current.slice(0, -1));
          edit();
        }}>마지막 가림 취소</button>
      </div>
      <div className="receipt-mask-scroll" tabIndex={0} aria-label="영수증 사진 스크롤 영역">
        {image && <canvas
          ref={canvas}
          className="receipt-mask-canvas"
          width={image.naturalWidth}
          height={image.naturalHeight}
          style={{ width: `${zoom}%` }}
          aria-label="영수증 마스킹 미리보기"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
        />}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="receipt-mask-toolbar">
        <label className="receipt-mask-confirm"><input type="checkbox" checked={confirmed} disabled={disabled || editing || !image || !!error}
          onChange={event => setConfirmed(event.target.checked)}/><span>이 사진에 가릴 민감정보가 남아 있지 않음을 확인했습니다.</span></label>
        <button type="button" disabled={!confirmed || editing || !!error} onClick={() => dialog.current?.close()}>
          확인하고 닫기
        </button>
      </div>
    </dialog>
    <button type="button" className="primary" disabled={disabled || editing || !confirmed || !image || !!error} onClick={extract}>
      {busy ? '처리 중…' : '결과 불러오기'}
    </button>
  </div>;
}

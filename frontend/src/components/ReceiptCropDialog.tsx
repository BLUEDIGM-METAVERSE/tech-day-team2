import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { CropRect, PrintPhoto } from '../types/print';
import { bounded } from '../utils/printLayout';
import { loadPrintImage } from '../utils/printImage';

const FULL: CropRect = { x: 0, y: 0, width: 1, height: 1 };
const HANDLES = [
  ['nw', '왼쪽 위'], ['n', '위'], ['ne', '오른쪽 위'], ['e', '오른쪽'],
  ['se', '오른쪽 아래'], ['s', '아래'], ['sw', '왼쪽 아래'], ['w', '왼쪽'],
] as const;
type Handle = typeof HANDLES[number][0];
interface CropDrag {
  handle: Handle;
  pointerId: number;
  crop: CropRect;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
}
interface Props { photo: PrintPhoto; busy: boolean; onApply: (crop: CropRect | null) => void; onClose: () => void }
export function ReceiptCropDialog({ photo, busy, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<CropRect>(photo.crop ?? FULL);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(100);
  const [dragging, setDragging] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const drag = useRef<CropDrag | null>(null);
  const frame = useRef<number | null>(null);
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal(); }, []);
  useEffect(() => {
    let cancelled = false;
    loadPrintImage(photo.original).then(image => {
      if (cancelled || !canvas.current) return;
      const target = canvas.current; target.width = image.naturalWidth; target.height = image.naturalHeight;
      const ctx = target.getContext('2d');
      if (!ctx) { setError('사진 편집 화면을 준비하지 못했습니다.'); return; }
      ctx.drawImage(image, 0, 0); setLoaded(true);
    }).catch(() => { if (!cancelled) setError('사진을 불러오지 못했습니다.'); });
    return () => { cancelled = true; };
  }, [photo.original]);
  function point(clientX: number, clientY: number) {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  }
  function resize(current: CropRect, handle: Handle, dx: number, dy: number): CropRect {
    let left = current.x, top = current.y;
    let right = left + current.width, bottom = top + current.height;
    const minWidth = Math.min(current.width, 10 / photo.width);
    const minHeight = Math.min(current.height, 10 / photo.height);
    if (handle.includes('w')) left = bounded(left + dx, 0, right - minWidth);
    if (handle.includes('e')) right = bounded(right + dx, left + minWidth, 1);
    if (handle.includes('n')) top = bounded(top + dy, 0, bottom - minHeight);
    if (handle.includes('s')) bottom = bounded(bottom + dy, top + minHeight, 1);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
  function update(active: CropDrag) {
    const p = point(active.clientX, active.clientY);
    setCrop(resize(active.crop, active.handle, p.x - active.startX, p.y - active.startY));
  }
  function autoScroll() {
    const active = drag.current, viewport = scroll.current;
    if (!active || !viewport) return;
    const rect = viewport.getBoundingClientRect();
    const edge = 28;
    const horizontal = active.handle.includes('w') || active.handle.includes('e');
    const vertical = active.handle.includes('n') || active.handle.includes('s');
    const speed = (pointer: number, min: number, max: number) =>
      pointer < min + edge ? -bounded((min + edge - pointer) / 2, 0, 18)
        : bounded((pointer - max + edge) / 2, 0, 18);
    const left = viewport.scrollLeft, top = viewport.scrollTop;
    if (horizontal) viewport.scrollLeft += speed(active.clientX, rect.left, rect.right);
    if (vertical) viewport.scrollTop += speed(active.clientY, rect.top, rect.bottom);
    if (left !== viewport.scrollLeft || top !== viewport.scrollTop) update(active);
    frame.current = requestAnimationFrame(autoScroll);
  }
  function start(event: PointerEvent<HTMLButtonElement>, handle: Handle) {
    if (busy || event.button !== 0 || drag.current) return;
    const p = point(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { handle, pointerId: event.pointerId, crop, startX: p.x, startY: p.y, clientX: event.clientX, clientY: event.clientY };
    setDragging(true);
    frame.current = requestAnimationFrame(autoScroll);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    active.clientX = event.clientX;
    active.clientY = event.clientY;
    update(active);
  }
  function finish(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    if (cancelled) setCrop(active.crop);
    else move(event);
    drag.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setDragging(false);
  }
  const valid = crop.width * photo.width >= Math.min(10, photo.width) - 1e-6 && crop.height * photo.height >= Math.min(10, photo.height) - 1e-6;
  function change(field: keyof CropRect, value: number) {
    setCrop(current => {
      const next = { ...current, [field]: bounded(value / 100, field === 'width' || field === 'height' ? .001 : 0, field === 'x' || field === 'y' ? .999 : 1) };
      next.width = Math.min(next.width, 1 - next.x); next.height = Math.min(next.height, 1 - next.y);
      return next;
    });
  }
  return <dialog ref={dialog} className="receipt-mask-dialog receipt-crop-dialog" aria-labelledby="crop-title"
    onCancel={event => { if (busy) event.preventDefault(); }} onClose={onClose}>
    <div className="receipt-mask-heading"><h2 id="crop-title">출력할 부분 잘라내기</h2><button disabled={busy} onClick={onClose}>닫기</button></div>
    <p className="hint">테두리의 손잡이를 안쪽으로 끌어 잘라낼 부분을 조절하세요. 출력용 자르기는 OCR 마스킹과 추출 결과에 영향을 주지 않습니다.</p>
    <div className="receipt-mask-toolbar receipt-mask-controls"><label className="receipt-mask-zoom">확대 <span className="receipt-mask-select"><select value={zoom} disabled={busy || dragging} onChange={e => setZoom(Number(e.target.value))}>
      <option value={100}>너비 맞춤</option><option value={150}>150%</option><option value={200}>200%</option>
    </select></span></label><button disabled={busy || dragging} onClick={() => setCrop(FULL)}>원본 전체 사용</button></div>
    <div ref={scroll} className="receipt-mask-scroll" tabIndex={0} aria-label="자르기 사진 스크롤 영역">
      <div className="crop-stage" style={{ width: `${zoom}%` }}>
        <canvas ref={canvas} aria-label="자르기 미리보기"/>
        {loaded && <div className="crop-selection" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}>
          {HANDLES.map(([handle, label]) => <button key={handle} type="button"
            className={`crop-handle crop-handle-${handle}`} aria-label={`${label} 자르기 손잡이`} disabled={busy}
            onPointerDown={event => start(event, handle)} onPointerMove={move}
            onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
            onLostPointerCapture={event => finish(event, true)}
            onKeyDown={event => {
              const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
              const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
              if (drag.current || (!dx && !dy)) return;
              event.preventDefault();
              const step = event.shiftKey ? 10 : 1;
              setCrop(current => resize(current, handle, dx * step / photo.width, dy * step / photo.height));
            }}/>)}
        </div>}
      </div>
    </div>
    <div className="crop-coordinates">{(['x', 'y', 'width', 'height'] as const).map((field, i) => <label key={field}>{['X', 'Y', '폭', '높이'][i]} (%)<input type="number" min={0} max={100} step={.1} value={Number((crop[field] * 100).toFixed(1))} disabled={busy || dragging} onChange={event => change(field, Number(event.target.value))}/></label>)}</div>
    {error && <p className="error" role="alert">{error}</p>}
    {!valid && <p className="hint">가로·세로 10px 이상의 영역을 선택하세요.</p>}
    <div className="receipt-mask-heading"><span className="hint">{Math.round(crop.width * photo.width)} × {Math.round(crop.height * photo.height)} px</span><div>
      <button disabled={busy} onClick={onClose}>취소</button> <button className="primary crop-apply" disabled={busy || dragging || !loaded || !valid || !!error} onClick={() => onApply(crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1 ? null : crop)}>{busy ? '적용 중…' : '자르기 적용'}</button>
    </div></div>
  </dialog>;
}

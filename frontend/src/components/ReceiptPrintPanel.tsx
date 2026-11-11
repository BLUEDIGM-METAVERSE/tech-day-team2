import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { CropRect, PrintItem, PrintPhoto, PrintSettings } from '../types/print';
import { BLANK_SIZES, DEFAULT_PRINT_SETTINGS, bounded, fitPrintPosition, layoutReceipts, overlapsPrintPlacement, swapPrintPositions, type PrintPlacement, type PrintPosition } from '../utils/printLayout';
import { renderPrintImage } from '../utils/printImage';
import { ImageFileDrop } from './ImageFileDrop';
import { ReceiptCropDialog } from './ReceiptCropDialog';

interface Props {
  items: PrintItem[];
  processing: boolean;
  onChange: (update: (items: PrintItem[]) => PrintItem[]) => void;
  onFiles: (files: File[]) => void;
  onBlank: (size: number) => void;
}
interface DropPosition extends PrintPosition { width: number; height: number; valid: boolean; swap?: { id: string; position: PrintPosition } }
interface DraggedReceipt { id: string; anchorX: number; anchorY: number }
export function ReceiptPrintPanel({ items, processing, onChange, onFiles, onBlank }: Props) {
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<PrintPhoto | null>(null);
  const [editingBusy, setEditingBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const dragged = useRef<DraggedReceipt | null>(null);
  const [positions, setPositions] = useState(() => new Map<string, PrintPosition>());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropPosition | null>(null);
  const papers = useRef<HTMLDivElement>(null);
  const editLock = useRef(false);
  const { pages, columns, scaledCount } = layoutReceipts(items, settings, positions);
  function setting<K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) { setSettings(current => ({ ...current, [key]: value })); }
  function remove(id: string) {
    onChange(list => list.filter(item => item.id !== id));
    setPositions(current => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
    if (selected === id) setSelected(null);
  }
  function resizeBlank(id: string, amount: number) {
    onChange(list => list.map(item => item.id === id && item.kind === 'blank' ? { ...item, size: bounded(item.size + amount, 1, 5) } : item));
  }
  async function editPhoto(photo: PrintPhoto, crop: CropRect | null, rotation: number, close: boolean) {
    if (editLock.current) return;
    editLock.current = true; setEditingBusy(true); setError('');
    try {
      const output = await renderPrintImage(photo.original, crop, rotation);
      onChange(list => list.map(item => item.id === photo.id && item.kind === 'photo' ? { ...item, crop, rotation, output } : item));
      if (close) setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : '사진 편집에 실패했습니다.'); }
    finally { editLock.current = false; setEditingBusy(false); }
  }
  function destination(item: PrintPlacement, position: PrintPosition): DropPosition {
    const fitted = fitPrintPosition(position, item, settings);
    const valid = !pages[fitted.page]?.some(other =>
      other.item.id !== item.item.id && overlapsPrintPlacement({ ...item, ...fitted }, other));
    return { ...fitted, width: item.width, height: item.height, valid };
  }
  function position(event: DragEvent): DropPosition | null {
    const drag = dragged.current;
    const page = (event.target as HTMLElement).closest<HTMLElement>('[data-print-page]');
    if (!drag || !page) return null;
    const item = pages.flat().find(entry => entry.item.id === drag.id);
    if (!item) return null;
    const rect = page.getBoundingClientRect();
    const next = destination(item, {
      page: Number(page.dataset.printPage),
      x: (event.clientX - rect.left) * 210 / rect.width - drag.anchorX,
      y: (event.clientY - rect.top) * 297 / rect.height - drag.anchorY,
    });
    const hoveredId = (event.target as HTMLElement).closest<HTMLElement>('[data-print-id]')?.dataset.printId;
    const collisions = pages[next.page].filter(other =>
      other.item.id !== drag.id && overlapsPrintPlacement({ ...item, ...next }, other));
    const targetId = hoveredId && hoveredId !== drag.id ? hoveredId
      : collisions.length === 1 ? collisions[0].item.id : undefined;
    if (!targetId) return next;
    const swapped = swapPrintPositions(pages, drag.id, targetId, settings);
    return swapped
      ? { ...next, ...swapped.source, valid: true, swap: { id: targetId, position: swapped.target } }
      : { ...next, valid: false };
  }
  function place(id: string, next: DropPosition) {
    if (!next.valid) {
      setStatus('다른 항목과 겹칩니다. 빈 위치에 놓아 주세요.');
      return;
    }
    // Preserve the positions of all other items when switching to manual placement.
    const updated = new Map<string, PrintPosition>();
    pages.forEach((page, index) => {
      for (const entry of page) updated.set(entry.item.id, { page: index, x: entry.x, y: entry.y });
    });
    updated.set(id, { page: next.page, x: next.x, y: next.y });
    if (next.swap) updated.set(next.swap.id, next.swap.position);
    setPositions(updated);
    setStatus(next.swap ? '두 항목의 위치를 맞바꿨습니다.' : '출력 위치를 변경했습니다.');
  }
  function endDrag() { dragged.current = null; setDraggingId(null); setDrop(null); }
  function keyboardMove(event: KeyboardEvent, item: PrintPlacement, page: number) {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5],
    };
    const direction = directions[event.key];
    if (!event.altKey || !direction) return;
    event.preventDefault();
    place(item.item.id, destination(item, { page, x: item.x + direction[0], y: item.y + direction[1] }));
  }
  async function print() {
    if (!items.length || processing || printing || editingBusy) return;
    setPrinting(true); setError('');
    try {
      await Promise.all([...papers.current!.querySelectorAll('img')].map(image => image.decode()));
      window.print();
    } catch { setError('출력할 사진을 준비하지 못했습니다. 사진을 확인한 뒤 다시 시도해 주세요.'); }
    finally { setPrinting(false); }
  }
  function photoTools(photo: PrintPhoto) {
    return <><button type="button" title="잘라내기" aria-label={`${photo.name} 잘라내기`} disabled={editingBusy} onClick={() => { setError(''); setEditing(photo); }}>잘라내기</button><button type="button" title="회전" aria-label={`${photo.name} 회전`} disabled={editingBusy} onClick={() => void editPhoto(photo, photo.crop, (photo.rotation + 90) % 360, false)}>⟳</button></>;
  }
  return <>
    <div className="print-workspace">
      <aside className="card print-sidebar"><h2>영수증 인쇄 배치</h2>
        <ImageFileDrop multiple disabled={processing} onFiles={onFiles} label="출력 전용 사진 선택"/>
        <p className="hint">01 사진 외에 출력 전용 사진도 추가할 수 있습니다.</p>
        <div className="print-options"><h3>빈 영역 추가 <small>· 실물 영수증 부착용</small></h3><div className="blank-sizes">{BLANK_SIZES.map((name, i) => <button key={name} onClick={() => onBlank(i + 1)}>{name}</button>)}</div><p className="hint">빈 영역은 미리보기에 추가됩니다. 자리가 부족하면 다음 열이나 다음 장에 배치합니다.</p></div>
        <div className="print-options"><h3>크기 / 배치</h3>
          <label className="print-setting-row">영수증 폭 (mm)<input type="number" min={30} max={190} value={Number.isNaN(settings.width) ? '' : settings.width} onChange={e => setting('width', e.target.valueAsNumber)} onBlur={e => setting('width', bounded(e.target.valueAsNumber, 30, 190, 80))}/></label>
          <div className="print-setting-row">빠른 선택<div className="print-widths">{[58, 80, 95, 190].map(width => <button key={width} onClick={() => setting('width', width)}>{width === 190 ? 'A4 꽉' : width}</button>)}</div></div>
          <label className="print-setting-row">영수증 간격 (mm)<input type="number" min={0} max={20} value={Number.isNaN(settings.gap) ? '' : settings.gap} onChange={e => setting('gap', e.target.valueAsNumber)} onBlur={e => setting('gap', bounded(e.target.valueAsNumber, 0, 20, 6))}/></label>
          <label className="print-setting-row">용지 여백 (mm)<input type="number" min={5} max={30} value={Number.isNaN(settings.margin) ? '' : settings.margin} onChange={e => setting('margin', e.target.valueAsNumber)} onBlur={e => setting('margin', bounded(e.target.valueAsNumber, 5, 30, 10))}/></label>
          <p className="hint">좌우 최소 여백은 입력한 값의 절반입니다.</p>
        </div>
        <div className="print-options"><h3>옵션</h3>{([
          ['cut', '인쇄 시 사진 자르는 선 표시'], ['caption', '파일명 표시'], ['gray', '흑백으로 인쇄'], ['blankLabel', "빈 영역에 '영수증 부착' 문구 인쇄"],
        ] as const).map(([key, label]) => <label className="print-checkbox" key={key}><input type="checkbox" checked={settings[key]} onChange={e => setting(key, e.target.checked)}/>{label}</label>)}</div>
        <button className="primary" disabled={!items.length || processing || printing || editingBusy} onClick={() => void print()}>{printing ? '출력 준비 중…' : '인쇄 / PDF 저장'}</button>
        <button className="print-clear" disabled={processing || editingBusy || !items.length} onClick={() => { onChange(() => []); setPositions(new Map()); setSelected(null); setStatus('출력 목록을 비웠습니다.'); }}>출력 목록 전체 비우기</button>
        <p className="hint">인쇄 설정: A4 세로 · 배율 100% · 여백 없음<br/>머리글 / 바닥글 해제</p>
      </aside>
      <div className="print-preview">
        <div className="print-preview-heading"><div><h2>A4 출력 미리보기</h2><p className="hint">사진·빈 영역을 용지 위 원하는 위치로 드래그하세요. 사진을 더블클릭하면 잘라내기가 열립니다.</p></div><span>A4 {pages.length}장 · {positions.size ? '직접 배치' : `${columns}열`}{scaledCount > 0 && ` · 긴 사진 ${scaledCount}장 축소`}</span></div>
        <p className="hint print-drag-help">다른 항목 위에 놓으면 공간이 충분할 때 위치를 맞바꿉니다. 항목을 선택하고 Alt+방향키를 눌러 5mm씩 이동할 수도 있습니다.</p>
        {positions.size > 0 && <button className="print-auto-layout" type="button" onClick={() => { setPositions(new Map()); setStatus('자동 배치로 돌아갔습니다.'); }}>자동 배치로 되돌리기</button>}
        {scaledCount > 0 && <p className="notice print-scale-note">긴 사진은 한 장에 들어가도록 축소했습니다. 인쇄 전 글자 크기를 확인하세요.</p>}
        {error && <p className="error print-error" role="alert">{error}</p>}
        <p className="hint print-status" role="status" aria-live="polite">{processing ? '사진을 준비하고 있습니다.' : status}</p>
        <div ref={papers} className={`print-paper-scroll${settings.gray ? ' print-gray' : ''}`}
          onDragOver={event => { if (!dragged.current) return; event.preventDefault(); const next = position(event); setDrop(next); event.dataTransfer.dropEffect = next?.valid ? 'move' : 'none'; }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null); }}
          onDrop={event => {
            const source = dragged.current;
            if (!source) return;
            event.preventDefault();
            const next = position(event);
            endDrag();
            if (next) place(source.id, next);
          }}>
          {pages.length ? pages.map((page, index) => <div className="print-page-wrap" key={index}><div className="print-page-label">PAGE {index + 1} / {pages.length} · A4 210 × 297 mm</div>
            <div className="print-page" data-print-page={index}>
              {drop?.page === index && <div aria-hidden="true" className={`print-position-guide${drop.valid ? '' : ' invalid'}`} style={{ left: `${drop.x}mm`, top: `${drop.y}mm`, width: `${drop.width}mm`, height: `${drop.height}mm` }}/>}
              {page.map(entry => {
                const { item, x, y, width, height } = entry;
                return <div key={item.id} data-print-id={item.id} draggable={!editingBusy} tabIndex={0}
                aria-label={`${items.indexOf(item) + 1}번 ${item.kind === 'photo' ? item.name : '빈 영역'} · 드래그 또는 Alt와 방향키로 이동`}
                className={`print-receipt${item.kind === 'blank' ? ' print-blank' : ''}${settings.cut || item.kind === 'blank' ? ' cut' : ''}${selected === item.id ? ' selected' : ''}${draggingId === item.id ? ' dragging' : ''}`}
                style={{ left: `${x}mm`, top: `${y}mm`, width: `${width}mm`, height: `${height}mm` }}
                onClick={() => setSelected(item.id)} onDoubleClick={() => { if (item.kind === 'photo') { setError(''); setEditing(item); } }}
                onKeyDown={event => { if (event.target === event.currentTarget) keyboardMove(event, entry, index); }}
                onDragStart={event => {
                  if ((event.target as HTMLElement).closest('button') || editingBusy) { event.preventDefault(); return; }
                  const rect = event.currentTarget.getBoundingClientRect();
                  dragged.current = {
                    id: item.id,
                    anchorX: (event.clientX - rect.left) * width / rect.width,
                    anchorY: (event.clientY - rect.top) * height / rect.height,
                  };
                  setDraggingId(item.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', item.id);
                }} onDragEnd={endDrag}>
                <span className="print-receipt-number">{items.indexOf(item) + 1}</span>
                {item.kind === 'photo' ? <><img src={item.output} alt={item.name} draggable={false}/>{settings.caption && <div className="print-caption">{item.name}</div>}</> : settings.blankLabel && <span>영수증 부착<br/>{BLANK_SIZES[item.size - 1]}</span>}
                <div className="print-receipt-tools" onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
                  {item.kind === 'photo' ? photoTools(item) : <>
                    <button type="button" aria-label="빈 영역 작게" disabled={item.size <= 1} onClick={() => resizeBlank(item.id, -1)}>−</button>
                    <button type="button" aria-label="빈 영역 크게" disabled={item.size >= 5} onClick={() => resizeBlank(item.id, 1)}>+</button>
                  </>}
                  <button type="button" title="출력에서 제외" aria-label="출력에서 제외" onClick={() => remove(item.id)}>×</button>
                </div>
              </div>; })}
            </div>
          </div>) : <div className="print-empty">출력할 영수증이 없습니다.<br/>QR 또는 사진 업로드로 영수증을 추가하세요.</div>}
        </div>
      </div>
    </div>
    {editing && <ReceiptCropDialog key={editing.id} photo={editing} busy={editingBusy} onClose={() => { if (!editLock.current) setEditing(null); }} onApply={crop => void editPhoto(editing, crop, editing.rotation, true)}/>}
  </>;
}

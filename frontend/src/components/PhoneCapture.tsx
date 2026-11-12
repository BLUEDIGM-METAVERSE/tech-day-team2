import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { checkRoom, isRoomGone, sendImage, type RoomRef } from '../services/relay';
import { resizeImage } from '../utils/image';

const MAX_FILES = 5; // 폰 화면에 담아 둘 수 있는 장수
const TOAST_MS = 3000;
interface Shot { id: number; image: string }
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
const CHECK_WAIT_MS = 1500;  // 방 확인 응답을 기다리는 최대 시간. 넘기면 열려 있다고 보고 진행한다.
const CHECK_FRESH_MS = 2000; // 손가락이 닿을 때 시작한 확인을 클릭에서 그대로 쓰는 시간
interface RoomCheck { startedAt: number; done: boolean; gone: boolean; result: Promise<boolean> }

// 폰 쪽: ?room=코드로 열리는 촬영 전용 화면. 찍은 사진을 1600px로 줄여 화면에 담아 두고, 전송을 누르면 PC 방으로 보낸다.
export function PhoneCapture({ room }: { room: RoomRef }) {
  const code = room.code;
  const [state, setState] = useState<'checking' | 'ready' | 'gone'>('checking');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [shots, setShots] = useState<Shot[]>([]); // 전송 전 폰 화면에 담아 둔 사진
  const nextId = useRef(0);
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    checkRoom(room).then(() => setState('ready')).catch(e => setState(isRoomGone(e) ? 'gone' : 'ready'));
  }, [room]);

  // 촬영·선택 버튼을 누를 때 방이 아직 열려 있는지 확인하고, PC가 새로고침·새 코드 발급으로 방을 닫았으면
  // 카메라·갤러리를 열지 않고 만료 안내로 바꾼다. 손가락이 닿는 순간 조회를 시작해 두고, 클릭 시점에
  // 결과가 나와 있으면 그대로 따른다. 아직이면 열기를 잠시 미루고 결과를 본 뒤 연다.
  // 통신 오류나 응답 지연은 방이 닫힌 것으로 보지 않는다.
  const roomCheck = useRef<RoomCheck | null>(null);
  const reopening = useRef(false); // 확인 후 우리가 다시 낸 클릭은 그대로 통과시킨다.
  function startCheck(): RoomCheck {
    const check: RoomCheck = { startedAt: Date.now(), done: false, gone: false, result: Promise.resolve(false) };
    const late = new Promise<boolean>(resolve => window.setTimeout(() => resolve(false), CHECK_WAIT_MS));
    check.result = Promise.race([checkRoom(room).then(() => false, isRoomGone), late]).then(gone => {
      check.done = true; check.gone = gone;
      if (gone) setState('gone');
      return gone;
    });
    roomCheck.current = check;
    return check;
  }
  function guardOpen(e: MouseEvent<HTMLInputElement>) {
    if (reopening.current) { reopening.current = false; return; }
    const input = e.currentTarget;
    const recent = roomCheck.current && Date.now() - roomCheck.current.startedAt < CHECK_FRESH_MS ? roomCheck.current : null;
    const check = recent ?? startCheck();
    roomCheck.current = null;
    if (check.done) { if (check.gone) e.preventDefault(); return; }
    e.preventDefault();
    void check.result.then(gone => { if (!gone) { reopening.current = true; input.click(); } });
  }

  // 5장을 넘겼을 때 잠깐 띄우는 안내
  function showToast(text: string) {
    window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => setToast(''), TOAST_MS);
  }
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // 찍거나 고른 사진은 줄여서 폰 화면에 먼저 담아 둔다. 담긴 사진과 합쳐 5장을 넘으면 하나도 담지 않고 안내한다.
  // 읽지 못한 사진은 담지 않는다.
  async function add(taken: File[]) {
    if (!taken.length || busy) return;
    if (shots.length + taken.length > MAX_FILES) { showToast(`전송할 수 있는 이미지는 최대 ${MAX_FILES}장입니다.`); return; }
    setBusy(true);
    let added = 0, unread = 0, unreadReason = '';
    try {
      for (const [i, file] of taken.entries()) {
        setMessage(`${taken.length > 1 ? `${i + 1}/${taken.length} ` : ''}사진을 줄이는 중…`);
        let image: string;
        try { image = await resizeImage(file, 'image/jpeg', 0.85); }
        catch (e) { unread++; unreadReason = errorText(e); continue; }
        const id = nextId.current++;
        setShots(list => [...list, { id, image }]);
        added++;
      }
      const parts: string[] = [];
      if (added) parts.push(`${added}장을 담았습니다. 확인한 뒤 전송을 눌러 주세요.`);
      if (unread) parts.push(taken.length > 1 ? `읽지 못한 사진 ${unread}장은 담지 않았습니다.` : unreadReason);
      setMessage(parts.join(' '));
    } finally { setBusy(false); }
  }
  // 입력값을 비우면 FileList도 비워지므로 먼저 배열로 복사해 둔다.
  function pick(input: HTMLInputElement) { const files = [...(input.files ?? [])]; input.value = ''; void add(files); }
  function remove(id: number) { setShots(list => list.filter(s => s.id !== id)); setMessage(''); }

  // 담아 둔 사진을 순서대로 한 장씩 보낸다. 보낸 사진은 화면에서 빼고, 전송이 막히면 남은 사진은 그대로 둔다.
  async function sendAll() {
    if (!shots.length || busy) return;
    setBusy(true);
    const queue = shots;
    let done = 0, stopReason = '';
    try {
      for (const [i, shot] of queue.entries()) {
        setMessage(`${queue.length > 1 ? `${i + 1}/${queue.length} ` : ''}PC로 보내는 중… (${Math.round(shot.image.length * 0.75 / 1024)}KB)`);
        try { await sendImage(room, shot.image); }
        catch (e) {
          if (isRoomGone(e)) { setState('gone'); return; }
          stopReason = errorText(e); break;
        }
        done++; setSent(n => n + 1);
        setShots(list => list.filter(s => s.id !== shot.id));
      }
      const parts: string[] = [];
      if (done) parts.push(`${done}장을 PC로 보냈습니다. PC 화면을 확인하세요.`);
      if (stopReason) parts.push(`전송 실패: ${stopReason} · 보내지 못한 사진 ${queue.length - done}장은 남겨 두었습니다. 같은 Wi-Fi인지도 확인해 주세요.`);
      setMessage(parts.join(' '));
    } finally { setBusy(false); }
  }

  const full = shots.length >= MAX_FILES;
  const blocked = busy || full; // 처리 중이거나 5장이 찼으면 더 담지 않는다.
  return <main className="phone-page">
    <p className="eyebrow">RECEIPT CAPTURE</p>
    <h1>영수증 촬영</h1>
    {state === 'checking' && <p className="hint">PC 연결을 확인하는 중…</p>}
    {state === 'gone' && <p className="error" role="alert">연결이 만료되었거나 코드가 올바르지 않습니다. PC 화면의 QR을 다시 찍어 주세요.</p>}
    {state === 'ready' && <>
      <p className="hint">PC 연결 코드 <strong>{code}</strong>. 사진을 최대 {MAX_FILES}장까지 담아 확인한 뒤 <strong>전송</strong>을 누르면 PC 화면으로 들어갑니다. 전송한 사진은 이 폰과 서버에 남지 않습니다.</p>
      <label className={'shoot' + (blocked ? ' busy' : '')} onPointerDown={() => { if (!blocked) startCheck(); }}>
        {shots.length === 0 ? '영수증 촬영' : '다음 영수증 촬영'}
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={blocked} onClick={guardOpen} onChange={e => pick(e.target)}/>
      </label>
      <label className={'shoot pick' + (blocked ? ' busy' : '')} onPointerDown={() => { if (!blocked) startCheck(); }}>
        사진·파일에서 선택
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={blocked} onClick={guardOpen} onChange={e => pick(e.target)}/>
      </label>
      {shots.length > 0 && <>
        <p className="hint tray-head">보낼 사진 {shots.length}/{MAX_FILES}장{full ? ' · 전송하거나 삭제하면 더 담을 수 있습니다' : ''}</p>
        <ul className="tray">
          {shots.map((shot, i) => <li key={shot.id}>
            <img src={shot.image} alt={`보낼 영수증 ${i + 1}`}/>
            <button type="button" aria-label={`보낼 영수증 ${i + 1} 삭제`} disabled={busy} onClick={() => remove(shot.id)}>×</button>
          </li>)}
        </ul>
        <button type="button" className="send" disabled={busy} onClick={() => void sendAll()}>{busy ? '처리 중…' : `PC로 전송 (${shots.length}장)`}</button>
      </>}
      {message && <p className="notice" role="status">{message}</p>}
      {sent > 0 && <p className="hint">보낸 사진 {sent}장</p>}
    </>}
    <div role="status" aria-live="polite" className={'toast' + (toast ? ' show' : '')}>{toast}</div>
  </main>;
}

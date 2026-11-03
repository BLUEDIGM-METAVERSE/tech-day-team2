import { useEffect, useState } from 'react';
import { checkRoom, isRoomGone, sendImage, type RoomRef } from '../services/relay';
import { resizeImage } from '../utils/image';

// 폰 쪽: ?room=코드로 열리는 촬영 전용 화면. 찍은 사진을 1600px로 줄여 PC 방으로 보낸다.
export function PhoneCapture({ room }: { room: RoomRef }) {
  const code = room.code;
  const [state, setState] = useState<'checking' | 'ready' | 'gone'>('checking');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [last, setLast] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    checkRoom(room).then(() => setState('ready')).catch(e => setState(isRoomGone(e) ? 'gone' : 'ready'));
  }, [room]);

  async function send(file?: File) {
    if (!file || busy) return;
    setBusy(true); setMessage('사진을 줄이는 중…');
    try {
      const image = await resizeImage(file, 'image/jpeg', 0.85);
      setMessage(`PC로 보내는 중… (${Math.round(image.length * 0.75 / 1024)}KB)`);
      const result = await sendImage(room, image);
      setLast(image); setSent(n => n + 1);
      setMessage(result.pending > 1 ? `PC로 보냈습니다. PC에서 처리를 기다리는 사진이 ${result.pending}장 있습니다.` : 'PC로 보냈습니다. PC 화면을 확인하세요.');
    } catch (e) {
      if (isRoomGone(e)) setState('gone');
      else setMessage('전송 실패: ' + (e instanceof Error ? e.message : String(e)) + ' · 같은 Wi-Fi인지도 확인해 주세요.');
    } finally { setBusy(false); }
  }

  return <main className="phone-page">
    <p className="eyebrow">RECEIPT CAPTURE</p>
    <h1>영수증 촬영</h1>
    {state === 'checking' && <p className="hint">PC 연결을 확인하는 중…</p>}
    {state === 'gone' && <p className="error" role="alert">연결이 만료되었거나 코드가 올바르지 않습니다. PC 화면의 QR을 다시 찍어 주세요.</p>}
    {state === 'ready' && <>
      <p className="hint">PC 연결 코드 <strong>{code}</strong>. 찍은 사진은 PC 화면으로 바로 들어가고, 이 폰과 서버에는 남지 않습니다.</p>
      <label className={'shoot' + (busy ? ' busy' : '')}>
        {busy ? '보내는 중…' : sent === 0 ? '영수증 촬영' : '다음 영수증 촬영'}
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e => { send(e.target.files?.[0]); e.target.value = ''; }}/>
      </label>
      <label className={'shoot pick' + (busy ? ' busy' : '')}>
        사진·파일에서 선택
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { send(e.target.files?.[0]); e.target.value = ''; }}/>
      </label>
      {message && <p className="notice" role="status">{message}</p>}
      {last && <img className="preview" src={last} alt={`마지막으로 보낸 영수증 (${sent}번째)`}/>}
      {sent > 0 && <p className="hint">보낸 사진 {sent}장</p>}
    </>}
  </main>;
}

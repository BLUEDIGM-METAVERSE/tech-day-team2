import { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { checkRoom, closeRoom, createRoom, isRoomGone, nextImage, type RoomInfo } from '../services/relay';

interface Props { destination?: 'ocr' | 'print'; idle: boolean; onImage: (dataUrl: string) => boolean | void }
const POLL_MS = 2000;

function phoneUrl(room: RoomInfo): string {
  // PC가 localhost로 열려 있어도 폰은 LAN 주소로 들어와야 하므로 서버가 알려준 주소를 쓴다.
  const host = room.hosts.includes(location.hostname) ? location.hostname : (room.hosts[0] ?? location.hostname);
  const port = location.port ? ':' + location.port : '';
  return `${location.protocol}//${host}${port}/?room=${room.code}&key=${room.key}`;
}
function qrDataUrl(text: string): string {
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  return qr.createDataURL(4, 2);
}
function remainingText(expiresAt: number, now: number): string {
  const sec = Math.max(0, Math.round((expiresAt - now) / 1000));
  return sec >= 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec}초`;
}

// PC 쪽: 방을 만들어 QR을 보여주고, 폰이 올린 이미지를 가져와 업로드 흐름에 넣는다.
// 방은 생성 30분 후 닫히고, PC에서 만료를 확인하면 새 코드를 발급한다.
export function PhoneLink({ idle, onImage, destination = 'ocr' }: Props) {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [pending, setPending] = useState(0);
  const [closesAt, setClosesAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const heldImage = useRef<string|null>(null);
  const polling = useRef(false); // 탭 전환으로 타이머가 바뀌어도 진행 중인 조회와 겹치지 않는다.
  const onImageRef = useRef(onImage); onImageRef.current = onImage;

  async function openRoom(previous?: RoomInfo | null) {
    if (previous) closeRoom(previous).catch(() => {}); // 이전 코드를 즉시 무효화한다
    try { const r = await createRoom(); setRoom(r); setClosesAt(r.closesAt); setPending(0); setError(''); }
    catch { setError('폰 연결을 준비하지 못했습니다. 서버 상태를 확인해 주세요.'); }
  }
  useEffect(() => { openRoom(); }, []);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  useEffect(() => {
    if (!room) return;
    const timer = window.setInterval(async () => {
      if (polling.current) return; polling.current = true;
      try {
        if (idle && heldImage.current) {
          if (onImageRef.current(heldImage.current) !== false) heldImage.current=null;
          return;
        }
        if (idle) {
          // PC가 비어 있을 때만 다음 사진을 가져온다. 확인 중인 영수증을 덮어쓰지 않기 위해서다.
          const next = await nextImage(room);
          setPending(next.pending); setClosesAt(next.closesAt);
          if (next.image && onImageRef.current(next.image) === false) heldImage.current=next.image;
        } else {
          const st = await checkRoom(room);
          setPending(st.pending); setClosesAt(st.closesAt);
        }
        setError('');
      } catch (e) {
        if (isRoomGone(e)) await openRoom(); // 만료되면 새 코드 발급
        else setError('서버와 연결이 불안정합니다.');
      } finally { polling.current = false; }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [room, idle]);

  if (error && !room) return <section className="card phone-bar"><div className="info"><p className="hint" role="alert">{error}</p></div><button type="button" className="renew" onClick={() => openRoom()}>다시 시도</button></section>;
  if (!room) return <section className="card phone-bar"><p className="hint">폰 연결 준비 중…</p></section>;
  const url = phoneUrl(room);
  return <section className="card phone-bar" aria-label="폰으로 촬영해서 보내기">
    {idle && <img src={qrDataUrl(url)} alt="폰 연결용 QR 코드" width={112} height={112}/>}
    <div className="info">
      <div className="head"><h3>폰으로 촬영해서 보내기</h3><span className="code" aria-label="연결 코드">{room.code}</span></div>
      {idle
        ? <p className="hint">같은 Wi-Fi에서 폰 카메라로 QR을 찍고 영수증을 촬영하면 {destination === 'print' ? '출력 목록에 추가됩니다' : '왼쪽 미리보기에 들어옵니다'}. 주소에 연결 전용 열쇠가 들어 있어 코드만으로는 보낼 수 없습니다.</p>
        : <p className="hint">폰 연결됨. 확인 중인 영수증을 처리하면 다음 사진을 가져옵니다.</p>}
      <p className="hint meta" role="status">
        {pending > 0 ? `대기 중인 사진 ${pending}장` : '대기 중인 사진 없음'} · 이 코드 종료까지 {remainingText(closesAt, now)} · 발급 후 {room.maxLifeMinutes}분간 사용 가능{error ? ` · ${error}` : ''}
      </p>
    </div>
    <button type="button" className="renew" onClick={() => openRoom(room)}>새 코드 받기</button>
  </section>;
}

// 폰 → PC 이미지 중계 API. 서버 메모리에만 잠깐 머무는 방(6자리 코드 + 비밀 열쇠)을 통해 이미지를 넘긴다.
// 코드는 사람이 보는 표시용이고 인증은 QR 주소에 든 열쇠가 한다.
import { requestJson as call } from './http';

export interface RoomInfo { code: string; key: string; hosts: string[]; expiresAt: number; closesAt: number; maxLifeMinutes: number; idleMinutes: number }
export interface RoomRef { code: string; key: string }

const roomPath = (room: RoomRef, action = '') => `/api/rooms/${room.code}${action}?key=${encodeURIComponent(room.key)}`;

export function createRoom(): Promise<RoomInfo> { return call('/api/rooms', { method: 'POST' }); }
export function closeRoom(room: RoomRef): Promise<{ closed: boolean }> { return call(roomPath(room), { method: 'DELETE' }); }
export function checkRoom(room: RoomRef): Promise<{ ok: true; pending: number; expiresAt: number; closesAt: number }> { return call(roomPath(room)); }
export function sendImage(room: RoomRef, dataUrl: string): Promise<{ pending: number }> {
  return call(roomPath(room, '/images'), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: dataUrl });
}
export function nextImage(room: RoomRef): Promise<{ image: string | null; pending: number; expiresAt: number; closesAt: number }> { return call(roomPath(room, '/next')); }
export function isRoomGone(error: unknown): boolean { return (error as { status?: number })?.status === 404; }

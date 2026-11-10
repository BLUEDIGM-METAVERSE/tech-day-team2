import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mockEngine } from './ocr/engine.mjs';
import { OcrError } from './ocr/gemini.mjs';

// ---- 폰 → PC 이미지 중계(시제품) ----
// PC가 방(6자리 코드 + 비밀 열쇠)을 만들고, 폰이 QR로 받은 코드·열쇠로 이미지를 올리면 PC가 가져간다.
// 이미지는 서버 메모리에만 잠깐 있다가 PC가 가져가는 즉시 지워진다. 디스크·DB·로그에 남기지 않는다.
// - 코드는 사람이 보는 표시용이고, 실제 인증은 QR 주소에 든 열쇠가 한다. 코드가 우연히 같아도 열쇠가 다르면 거부된다.
// - 닫힌 방의 코드는 한동안 재발급하지 않는다(서버 메모리 기준, 재시작하면 초기화).
const ROOM_MAX_LIFE_MS = 30 * 60 * 1000;  // PC가 계속 보고 있어도 만든 지 30분이면 닫힘
const RECENT_CODE_MS = 6 * 60 * 60 * 1000; // 닫힌 코드를 다시 쓰지 않는 기간
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_QUEUE = 20;
const rooms = new Map();       // code -> { key, queue: string[], createdAt }
const recentCodes = new Map(); // code -> 닫힌 시각

function json(res, status, body) { res.writeHead(status); res.end(JSON.stringify(body)); }
function fail(res, status, code, message) { json(res, status, { error: { code, message } }); }

// 같은 Wi-Fi의 폰이 접속할 수 있는 이 PC의 IPv4 주소 목록
function lanHosts() {
  const hosts = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const nic of list ?? []) {
      if (nic.family === 'IPv4' && !nic.internal && !nic.address.startsWith('169.254.')) hosts.push(nic.address);
    }
  }
  return hosts;
}
function newCode() {
  let code;
  do { code = String(Math.floor(100000 + Math.random() * 900000)); } while (rooms.has(code) || recentCodes.has(code));
  return code;
}
function closeRoom(code) {
  if (rooms.delete(code)) recentCodes.set(code, Date.now());
}
function expired(room, now = Date.now()) { return now >= closesAt(room); }
// PC가 계속 보고 있어도 넘길 수 없는 절대 종료 시각. PC 화면의 남은 시간 표시는 이 값을 쓴다.
function closesAt(room) { return room.createdAt + ROOM_MAX_LIFE_MS; }
function keyMatches(room, key) {
  if (typeof key !== 'string') return false;
  // 글자 수가 같아도 멀티바이트 문자면 바이트 길이가 다르다. timingSafeEqual은 길이가 다르면 예외를 던지므로 바이트로 비교한다.
  const given = Buffer.from(key);
  const expected = Buffer.from(room.key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
// 코드와 열쇠가 모두 맞는 살아 있는 방만 돌려준다. 틀리면 존재 여부를 알리지 않고 undefined.
function openRoom(code, key) {
  const room = rooms.get(code);
  if (!room) return undefined;
  if (expired(room)) { closeRoom(code); return undefined; }
  if (!keyMatches(room, key)) return undefined;
  return room;
}
// 본문을 끝까지 읽되 상한을 넘으면 그 뒤는 버린다. 중간에 끊으면 클라이언트가 응답을 못 받으므로 끝까지 받은 뒤 413을 돌려준다.
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let tooLarge = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (tooLarge) return;
      if (size > limit) { tooLarge = true; chunks.length = 0; return; }
      chunks.push(chunk);
    });
    req.on('end', () => tooLarge ? reject(new Error('TOO_LARGE')) : resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (expired(room, now)) closeRoom(code);
  for (const [code, closedAt] of recentCodes) if (now - closedAt > RECENT_CODE_MS) recentCodes.delete(code);
}, 30 * 1000).unref();

const IMAGE_SIGNATURES = {
  'image/png': bytes => bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  'image/jpeg': bytes => bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')),
  'image/webp': bytes => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
};

async function extractImage(req, res, engine) {
  const mimeType = req.headers['content-type'];
  if (!Object.hasOwn(IMAGE_SIGNATURES, mimeType)) {
    req.resume();
    return fail(res, 415, 'BAD_IMAGE', 'JPG·PNG·WebP 이미지를 선택해 주세요.');
  }
  // 마스킹 확인은 현재 생략한다. PC 미리보기에서 확인한 사진을 사용한다.
  let bytes;
  try { bytes = await readBody(req, MAX_BODY_BYTES); }
  catch (error) {
    if (res.destroyed) return;
    if (error.message === 'TOO_LARGE') return fail(res, 413, 'BAD_IMAGE', '이미지는 최대 8 MiB까지 보낼 수 있습니다.');
    return fail(res, 400, 'BAD_IMAGE', '이미지를 읽을 수 없습니다.');
  }
  if (!IMAGE_SIGNATURES[mimeType](bytes)) return fail(res, 400, 'BAD_IMAGE', '이미지가 비어 있거나 파일 형식이 올바르지 않습니다.');

  const controller = new AbortController();
  const cancel = () => controller.abort();
  res.once('close', cancel);
  try {
    if (res.destroyed) return;
    const result = await engine.extract({ bytes, mimeType, signal: controller.signal });
    if (!controller.signal.aborted) return json(res, 200, result);
  } catch (error) {
    if (controller.signal.aborted) return;
    if (error instanceof OcrError) {
      console.warn('[OCR][gemini] 추출 실패', { code: error.code, status: error.status });
      return fail(res, error.status, error.code, error.message);
    }
    throw error;
  } finally {
    res.off('close', cancel);
  }
}

async function route(req, res, engine) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (!URL.canParse(req.url, 'http://localhost')) { req.resume(); return fail(res, 400, 'BAD_REQUEST', '요청 주소가 올바르지 않습니다.'); }
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'ok', mode: engine.mode });

  if (req.method === 'POST' && url.pathname === '/api/extract') {
    if (engine.mode === 'gemini') return extractImage(req, res, engine);
    req.resume();
    return json(res, 200, await engine.extract());
  }

  // 방 만들기 (PC)
  if (req.method === 'POST' && url.pathname === '/api/rooms') {
    req.resume();
    const now = Date.now();
    const code = newCode();
    const room = { key: randomBytes(16).toString('hex'), queue: [], createdAt: now };
    rooms.set(code, room);
    return json(res, 201, { code, key: room.key, hosts: lanHosts(), expiresAt: closesAt(room), closesAt: closesAt(room), maxLifeMinutes: ROOM_MAX_LIFE_MS / 60000, idleMinutes: ROOM_MAX_LIFE_MS / 60000 });
  }

  const match = /^\/api\/rooms\/(\d{6})(\/images|\/next)?$/.exec(url.pathname);
  if (match) {
    const [, code, action] = match;
    const room = openRoom(code, url.searchParams.get('key'));
    if (!room) { req.resume(); return fail(res, 404, 'ROOM_NOT_FOUND', '연결이 만료되었거나 코드가 올바르지 않습니다. PC 화면의 QR을 다시 찍어 주세요.'); }

    // 방 상태 (폰 연결 확인·PC 대기 수 표시)
    if (req.method === 'GET' && !action) return json(res, 200, { ok: true, pending: room.queue.length, expiresAt: closesAt(room), closesAt: closesAt(room) });

    // 방 닫기 (PC의 "새 코드 받기"): 즉시 무효화하고 코드를 재사용 금지 목록에 넣는다
    if (req.method === 'DELETE' && !action) { req.resume(); closeRoom(code); return json(res, 200, { closed: true }); }

    // 이미지 올리기 (폰): 본문은 data:image/...;base64 문자열
    if (req.method === 'POST' && action === '/images') {
      if (room.queue.length >= MAX_QUEUE) { req.resume(); return fail(res, 429, 'QUEUE_FULL', 'PC에서 먼저 받은 사진을 처리한 뒤 다시 보내 주세요.'); }
      let body;
      try { body = (await readBody(req, MAX_BODY_BYTES)).toString('utf8'); }
      catch (e) { return fail(res, e.message === 'TOO_LARGE' ? 413 : 400, 'BAD_IMAGE', '이미지가 너무 크거나 읽을 수 없습니다.'); }
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body)) return fail(res, 400, 'BAD_IMAGE', '지원하지 않는 이미지 형식입니다.');
      room.queue.push(body);
      return json(res, 202, { pending: room.queue.length });
    }

    // 다음 이미지 가져가기 (PC): 전달 즉시 서버에서 지운다
    if (req.method === 'GET' && action === '/next') {
      const image = room.queue.shift() ?? null;
      return json(res, 200, { image, pending: room.queue.length, expiresAt: closesAt(room), closesAt: closesAt(room) });
    }
  }

  req.resume();
  return fail(res, 404, 'NOT_FOUND', '요청한 경로를 찾을 수 없습니다.');
}

// 처리 중 예외가 나도 서버는 살아 있어야 한다. 예외 메시지에 요청 값이 섞일 수 있어 응답·로그에는 오류 종류만 남긴다.
export function createApp({ engine = mockEngine } = {}) {
  return createServer(async (req, res) => {
    try { await route(req, res, engine); }
    catch (e) {
      console.error('요청 처리 실패:', e?.name ?? 'Error');
      req.resume();
      if (res.headersSent) res.destroy();
      else fail(res, 500, 'INTERNAL_ERROR', '서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  });
}

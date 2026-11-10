import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { request } from 'node:http';
import { once } from 'node:events';
import { createApp } from './app.mjs';

// 이미지 값은 형식만 맞춘 가짜 데이터다.
const IMAGE = 'data:image/png;base64,AAAA';
const JSON_TYPE = 'application/json; charset=utf-8';

async function listen(app) {
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  return app.address().port;
}
let app, port;
const url = path => `http://127.0.0.1:${port}${path}`;
const call = async (path, init) => {
  const res = await fetch(url(path), init);
  return { status: res.status, type: res.headers.get('content-type'), body: await res.json() };
};
const newRoom = async () => (await call('/api/rooms', { method: 'POST' })).body;
const roomPath = (room, action = '') => `/api/rooms/${room.code}${action}?key=${room.key}`;
const sendImage = (room, body = IMAGE) => call(roomPath(room, '/images'), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
// fetch는 주소를 미리 고치므로 비정상 경로는 http 모듈로 그대로 보낸다.
const rawGet = path => new Promise((resolve, reject) => {
  request({ host: '127.0.0.1', port, path }, res => {
    let text = ''; res.on('data', d => { text += d; }); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
  }).on('error', reject).end();
});
const assertAlive = async () => assert.equal((await call('/api/health')).status, 200);

before(async () => { app = createApp(); port = await listen(app); });
after(() => { app.closeAllConnections(); app.close(); });

test('health는 현재 엔진 모드를 알려 준다', async () => {
  const res = await call('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.type, JSON_TYPE);
  assert.deepEqual(res.body, { status: 'ok', mode: 'mock' });
});

test('extract는 계약 형태의 샘플을 돌려주고 샘플임을 표시한다', async () => {
  const { status, body } = await call('/api/extract', { method: 'POST' });
  assert.equal(status, 200);
  assert.equal(body.engine, 'mock');
  assert.match(body.data.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof body.data.merchant, 'string');
  assert.ok(Number.isInteger(body.data.amount));
  assert.ok(body.warnings.some(w => w.includes('가짜')));
});

test('없는 경로와 허용하지 않는 메서드는 404 NOT_FOUND', async () => {
  assert.deepEqual((await call('/api/none')).body.error.code, 'NOT_FOUND');
  const res = await call('/api/extract');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('해석할 수 없는 주소는 400으로 답하고 서버가 죽지 않는다', async () => {
  const res = await rawGet('//');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'BAD_REQUEST');
  await assertAlive();
});

test('글자 수가 같은 멀티바이트 키는 404로 답하고 서버가 죽지 않는다', async () => {
  const room = await newRoom();
  const res = await call(`/api/rooms/${room.code}?key=${encodeURIComponent('가'.repeat(room.key.length))}`);
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'ROOM_NOT_FOUND');
  await assertAlive();
});

test('키가 없거나 틀린 방 요청은 404 ROOM_NOT_FOUND', async () => {
  const room = await newRoom();
  for (const path of [`/api/rooms/${room.code}`, `/api/rooms/${room.code}?key=${'0'.repeat(room.key.length)}`]) {
    const res = await call(path);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'ROOM_NOT_FOUND');
  }
});

test('QR 연결은 활동 없이도 30분간 유지되고 발급 시각 기준으로 만료된다', async t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const room = await newRoom();
  const deadline = now + 30 * 60 * 1000;
  assert.equal(room.expiresAt, deadline);
  assert.equal(room.closesAt, deadline);
  now = deadline - 1000;
  assert.equal((await call(roomPath(room))).status, 200);
  now = deadline;
  assert.equal((await call(roomPath(room))).status, 404);
});

test('사진은 보낸 순서대로 한 번만 전달되고 닫힌 방은 쓸 수 없다', async () => {
  const room = await newRoom();
  assert.equal((await call(roomPath(room))).body.pending, 0);
  assert.deepEqual(await sendImage(room).then(r => [r.status, r.body.pending]), [202, 1]);
  assert.equal((await call(roomPath(room, '/next'))).body.image, IMAGE);
  assert.equal((await call(roomPath(room, '/next'))).body.image, null);
  assert.equal((await call(roomPath(room), { method: 'DELETE' })).body.closed, true);
  assert.equal((await call(roomPath(room))).status, 404);
});

test('형식이 다르거나 너무 큰 사진은 BAD_IMAGE, 큐가 차면 QUEUE_FULL', async () => {
  const room = await newRoom();
  const bad = await sendImage(room, 'not-an-image');
  assert.deepEqual([bad.status, bad.body.error.code], [400, 'BAD_IMAGE']);
  const large = await sendImage(room, 'x'.repeat(8 * 1024 * 1024 + 1));
  assert.deepEqual([large.status, large.body.error.code], [413, 'BAD_IMAGE']);
  for (let i = 0; i < 20; i++) assert.equal((await sendImage(room)).status, 202);
  const full = await sendImage(room);
  assert.deepEqual([full.status, full.body.error.code], [429, 'QUEUE_FULL']);
});

test('업로드 중 연결이 끊겨도 서버가 죽지 않는다', async () => {
  const room = await newRoom();
  const socket = connect(port, '127.0.0.1');
  await once(socket, 'connect');
  socket.write(`POST ${roomPath(room, '/images')} HTTP/1.1\r\nHost: x\r\nContent-Type: text/plain\r\nContent-Length: 1000\r\n\r\ndata:`);
  await new Promise(resolve => setTimeout(resolve, 50));
  socket.destroy();
  await new Promise(resolve => setTimeout(resolve, 50));
  await assertAlive();
});

test('엔진을 교체하면 health와 extract가 그 엔진을 따른다', async () => {
  const result = { data: { date: null, merchant: null, amount: null }, engine: 'fake', warnings: [] };
  const other = createApp({ engine: { mode: 'fake', extract: async () => result } });
  const otherPort = await listen(other);
  try {
    assert.equal((await (await fetch(`http://127.0.0.1:${otherPort}/api/health`)).json()).mode, 'fake');
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${otherPort}/api/extract`, { method: 'POST' })).json(), result);
  } finally { other.closeAllConnections(); other.close(); }
});

test('엔진 예외는 500으로 바꾸고 예외 내용을 응답·로그에 남기지 않으며 서버는 계속 동작한다', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const secret = '가짜비밀값-12000';
  const broken = createApp({ engine: { mode: 'fake', extract: async () => { throw new Error(secret); } } });
  const brokenPort = await listen(broken);
  try {
    const res = await fetch(`http://127.0.0.1:${brokenPort}/api/extract`, { method: 'POST' });
    const text = await res.text();
    assert.equal(res.status, 500);
    assert.equal(JSON.parse(text).error.code, 'INTERNAL_ERROR');
    assert.ok(!text.includes(secret));
    assert.equal(logged.mock.callCount(), 1);
    assert.ok(!JSON.stringify(logged.mock.calls[0].arguments).includes(secret));
    assert.equal((await fetch(`http://127.0.0.1:${brokenPort}/api/health`)).status, 200);
  } finally { broken.closeAllConnections(); broken.close(); }
});

test('Gemini 이미지 계약을 확인하고 유효한 본문만 엔진에 전달한다', async t => {
  const { readFile } = await import('node:fs/promises');
  const { OcrError } = await import('./ocr/gemini.mjs');
  const image = await readFile(new URL('./ocr/samples/receipt-01.jpg', import.meta.url));
  let calls = 0;
  const engine = {
    mode: 'gemini',
    async extract({ bytes, mimeType, signal }) {
      assert.deepEqual(bytes, image);
      assert.equal(mimeType, 'image/jpeg');
      assert.equal(signal.aborted, false);
      if (++calls === 3) throw new OcrError(429, 'OCR_QUOTA', '할당량을 확인해 주세요.');
      return { data: { date: null, merchant: null, amount: null }, engine: 'gemini', warnings: [] };
    },
  };
  const app = createApp({ engine });
  const port = await listen(app);
  t.after(() => { app.closeAllConnections(); app.close(); });
  const post = (body, mimeType = 'image/jpeg') => fetch(`http://127.0.0.1:${port}/api/extract`, {
    method: 'POST', body, headers: { 'Content-Type': mimeType },
  });
  for (const [body, type, status, code] of [
    [image, 'text/plain', 415, 'BAD_IMAGE'],
    [image, 'image/png', 400, 'BAD_IMAGE'],
    [Buffer.alloc(0), 'image/jpeg', 400, 'BAD_IMAGE'],
    [Buffer.alloc(8 * 1024 * 1024 + 1), 'image/jpeg', 413, 'BAD_IMAGE'],
  ]) {
    const response = await post(body, type);
    assert.equal(response.status, status);
    assert.equal((await response.json()).error.code, code);
  }
  assert.equal(calls, 0);
  const ok = await post(image);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).engine, 'gemini');
  const api = (path, init) => fetch(`http://127.0.0.1:${port}${path}`, init);
  const room = await (await api('/api/rooms', { method: 'POST' })).json();
  try {
    const sent = await api(roomPath(room, '/images'), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `data:image/jpeg;base64,${image.toString('base64')}`,
    });
    assert.equal(sent.status, 202);
    const next = await api(roomPath(room, '/next'));
    assert.equal(next.status, 200);
    const { image: relayedImage } = await next.json();
    const phonePhoto = Buffer.from(relayedImage.split(',')[1], 'base64');
    const extracted = await post(phonePhoto);
    assert.equal(extracted.status, 200);
    assert.equal((await extracted.json()).engine, 'gemini');
  } finally {
    await api(roomPath(room), { method: 'DELETE' });
  }
  const quota = await post(image);
  assert.equal(quota.status, 429);
  assert.equal((await quota.json()).error.code, 'OCR_QUOTA');
});

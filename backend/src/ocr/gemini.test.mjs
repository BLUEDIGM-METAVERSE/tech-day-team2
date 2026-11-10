import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGeminiEngine } from './gemini.mjs';

const image = { bytes: Buffer.from('test image'), mimeType: 'image/jpeg', signal: new AbortController().signal };
const response = text => Response.json({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'internal' }, { text }] } }],
});
const engine = fetchImpl => createGeminiEngine({ apiKey: 'test-key', model: 'gemini-test', fetchImpl });

test('Gemini에 이미지와 스키마를 보내고 OCR 원문을 기존 파서로 정규화한다', async () => {
  const result = await engine(async (url, request) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    assert.equal(request.headers['x-goog-api-key'], 'test-key');
    const body = JSON.parse(request.body);
    assert.deepEqual(body.contents[0].parts[1].inlineData, { mimeType: image.mimeType, data: image.bytes.toString('base64') });
    assert.deepEqual(body.generationConfig.responseJsonSchema.required, ['text']);
    return response(JSON.stringify({ text: '상호: 테스트상점\n거래일자: 2026.11.10\n결제금액: 12,300원' }));
  }).extract(image);
  assert.deepEqual(result, { data: { date: '2026-11-10', merchant: '테스트상점', amount: 12300 }, engine: 'gemini', warnings: [] });
});

test('판독 가능한 값이 없으면 빈 필드와 검토 경고를 표시한다', async () => {
  const result = await engine(async () => response('{"text":""}')).extract(image);
  assert.deepEqual(result.data, { date: null, merchant: null, amount: null });
  assert.ok(result.warnings.length);
});

test('판독 불가 표시가 포함된 거래처와 금액 일부를 확정하지 않는다', async () => {
  const text = '상호: 서울[판독 불가]\n거래일자: 2026.11.10\n결제금액: [판독 불가] 123원\n합계: 123원';
  const result = await engine(async () => response(JSON.stringify({ text }))).extract(image);
  assert.deepEqual(result.data, { date: '2026-11-10', merchant: null, amount: null });
  assert.equal(result.warnings.length, 2);
});

test('Gemini 오류와 잘못된 응답은 원문을 포함하지 않는 오류로 변환한다', async () => {
  const cases = [
    [() => Response.json({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }, { status: 400 }), 'OCR_AUTH'],
    [() => new Response('secret', { status: 403 }), 'OCR_AUTH'],
    [() => new Response('secret', { status: 429 }), 'OCR_QUOTA'],
    [() => new Response('secret', { status: 504 }), 'OCR_TIMEOUT'],
    [() => response('{"text":17}'), 'OCR_BAD_RESPONSE'],
    [() => new Response('secret'), 'OCR_BAD_RESPONSE'],
  ];
  for (const [reply, code] of cases) {
    await assert.rejects(engine(async () => reply()).extract(image), error => error.code === code && !error.message.includes('secret'));
  }
});

test('클라이언트 취소를 공급자 요청에 전달한다', async () => {
  const controller = new AbortController();
  const pending = engine(async (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  })).extract({ ...image, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('백엔드 콘솔에 민감 항목을 걸러낸 OCR 텍스트를 출력한다', async t => {
  const info = t.mock.method(console, 'info', () => {});
  const text = '상호: 테스트상점\n카드번호: 0000-1111-2222-3333\n거래일자: 2026-11-10\n결제금액: 12,300원';
  await engine(async () => response(JSON.stringify({ text }))).extract(image);
  const log = info.mock.calls.find(({ arguments: [label] }) => label.includes('판독 텍스트'));
  assert.ok(log);
  const payload = JSON.parse(log.arguments[1]);
  assert.ok(payload.requestId);
  assert.match(payload.text, /상호: 테스트상점\n—\n거래일자: 2026-11-10/);
  assert.doesNotMatch(payload.text, /카드번호|0000-1111-2222-3333/);
  const processed = info.mock.calls.find(({ arguments: [label] }) => label.includes('후처리 완료'));
  assert.ok(processed);
  assert.deepEqual(processed.arguments[1].data, { date: '2026-11-10', merchant: '테스트상점', amount: 12300 });
  assert.deepEqual(processed.arguments[1].warnings, []);
  assert.doesNotMatch(JSON.stringify(processed.arguments[1]), /카드번호|0000-1111-2222-3333/);
});

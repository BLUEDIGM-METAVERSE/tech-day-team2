import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, requestJson } from '../src/services/http.ts';
import { isReceiptResult } from '../src/services/receiptResult.ts';

const respondWith = (status, text) => { globalThis.fetch = async () => new Response(text, { status }); };
const failWith = name => { globalThis.fetch = async () => { throw Object.assign(new Error('Failed to fetch'), { name }); }; };
const failure = () => requestJson('/api/x').then(() => assert.fail('실패해야 한다'), e => e);

test('성공 응답은 본문을 돌려준다', async () => {
  respondWith(200, '{"ok":true}');
  assert.deepEqual(await requestJson('/api/x'), { ok: true });
});
test('서버 오류는 서버의 안내·상태·코드를 전달한다', async () => {
  respondWith(404, '{"error":{"code":"ROOM_NOT_FOUND","message":"만료"}}');
  const error = await failure();
  assert.ok(error instanceof ApiError);
  assert.deepEqual([error.message, error.status, error.code], ['만료', 404, 'ROOM_NOT_FOUND']);
});
test('서버가 꺼졌을 때 proxy의 본문 없는 500은 통신 실패로 안내한다', async () => {
  respondWith(500, '');
  const error = await failure();
  assert.equal(error.status, 500);
  assert.match(error.message, /서버와 통신하지 못했습니다/);
});
test('네트워크 실패는 브라우저 원문 대신 재시도 안내로 바꾼다', async () => {
  failWith('TypeError');
  const error = await failure();
  assert.doesNotMatch(error.message, /Failed to fetch/);
  assert.match(error.message, /다시 시도/);
});
test('시간 초과는 지연 안내로 구분한다', async () => {
  failWith('TimeoutError');
  assert.match((await failure()).message, /지연/);
});
test('성공 상태인데 JSON이 아니면 형식 오류로 안내한다', async () => {
  respondWith(200, '<html></html>');
  assert.match((await failure()).message, /형식/);
});

const valid = { data: { date: '2026-10-29', merchant: '가짜상점', amount: 1000 }, engine: 'mock', warnings: [] };
test('계약에 맞는 결과와 누락값 null을 허용한다', () => {
  assert.equal(isReceiptResult(valid), true);
  assert.equal(isReceiptResult({ ...valid, data: { date: null, merchant: null, amount: null } }), true);
});
test('계약과 다른 결과를 거부한다', () => {
  for (const bad of [null, {}, { ...valid, data: null }, { ...valid, data: { ...valid.data, amount: '1000' } }, { ...valid, data: { ...valid.data, amount: 10.5 } },
    { ...valid, data: { ...valid.data, date: 20261029 } }, { ...valid, engine: undefined }, { ...valid, warnings: 'x' }, { ...valid, warnings: [1] }]) {
    assert.equal(isReceiptResult(bad), false);
  }
});

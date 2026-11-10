import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rowsHtml, rowsTsv } from '../src/utils/excel.ts';

const rows = [
  { date: '2026-11-10', account: '의료비', description: '약제비', merchant: '테스트약국', amount: 3200, payment: '개인카드' },
  { date: '2026-11-11', account: '야근(특근)식비', merchant: '테스트식당', amount: 7000, payment: '법인카드' },
];

test('일반 복사의 텍스트와 HTML은 상세 데이터 행만 포함한다', () => {
  assert.deepEqual(rowsTsv(rows, false).split('\n'), [
    '2026-11-10\t의료비\t약제비\t테스트약국\t3200\t개인카드',
    '2026-11-11\t야근(특근)식비\t\t테스트식당\t7000\t법인카드',
  ]);
  assertBodyRows(rowsHtml(rows, false));
});

test('양식 복사는 상세 행 수와 B~X 병합 열 배치를 유지한다', () => {
  const lines = rowsTsv(rows, true).split('\n').map(line => line.split('\t'));
  assert.deepEqual(lines.map(line => line.length), [23, 23]);
  assert.deepEqual([0, 2, 5, 14, 17, 20].map(index => lines[0][index]), [
    '2026-11-10', '의료비', '약제비', '테스트약국', '3200', '개인카드',
  ]);
  const html = rowsHtml(rows, true);
  assertBodyRows(html);
  assert.deepEqual([...html.matchAll(/colspan="(\d+)"/g)].map(match => Number(match[1])), [
    2, 3, 9, 3, 3, 3, 2, 3, 9, 3, 3, 3,
  ]);
});

function assertBodyRows(html) {
  assert.equal([...html.matchAll(/<tr>/g)].length, rows.length);
  assert.doesNotMatch(html, /<thead|<tfoot|<th\b|>일자<|>계정과목<|>[^<]*합계</);
  assert.match(html, /<tbody><tr>[\s\S]*테스트약국[\s\S]*<\/tr><tr>[\s\S]*테스트식당[\s\S]*<\/tr><\/tbody>/);
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { duplicateGroups, duplicatesOf, merchantKey, sameMerchant, sameReceipt } from '../src/utils/duplicate.ts';

const row = (date, merchant, amount, extra = {}) => ({ date, merchant, amount, ...extra });

test('거래처는 공백·대소문자·전각·법인 표기 차이를 무시하고 비교한다', () => {
  assert.equal(merchantKey('스타벅스 강남점'), merchantKey('스타벅스강남점'));
  assert.equal(merchantKey('(주)테스트상사'), merchantKey('주식회사 테스트상사'));
  assert.equal(merchantKey('㈜테스트상사'), merchantKey('테스트상사'));
  assert.equal(merchantKey('ＡＢＣ Mart'), merchantKey('abc mart'));
  assert.notEqual(merchantKey('스타벅스 강남점'), merchantKey('스타벅스 역삼점'));
});

test('일자·금액·거래처 중 하나라도 비면 비교하지 않는다', () => {
  assert.equal(sameReceipt(row(null, '테스트식당', 7000), row(null, '테스트식당', 7000)), false);
  assert.equal(sameReceipt(row('2026-11-11', '  ', 7000), row('2026-11-11', '  ', 7000)), false);
  assert.equal(sameReceipt(row('2026-11-11', '테스트식당', null), row('2026-11-11', '테스트식당', null)), false);
  assert.deepEqual(duplicateGroups([row(null, null, null), row(null, null, null)]), []);
});

test('세 값이 모두 같을 때만 같은 내역으로 묶는다', () => {
  const rows = [
    row('2026-11-11', '테스트식당', 7000),
    row('2026-11-11', '다른식당', 7000),
    row('2026-11-12', '테스트식당', 7000),
    row('2026-11-11', '테스트식당', 7500),
    row('2026-11-11', '테스트 식당', 7000),
  ];
  assert.deepEqual(duplicateGroups(rows), [[0, 4]]);
});

test('거래처 앞뒤에 다른 글자가 붙어도 같은 거래처로 본다', () => {
  assert.equal(sameMerchant('KJFOOD', '[영수증] KJFOOD'), true);
  assert.equal(sameMerchant('테스트식당 강남점', '테스트식당'), true);
  assert.equal(sameMerchant('가', '가나다식당'), false);
  assert.equal(sameMerchant('KJFOOD', 'KJMART'), false);
  assert.equal(sameMerchant('[영수증]', '(주)'), false);
  const rows = [row('2026-11-11', 'KJFOOD', 12000), row('2026-11-11', '[영수증] KJFOOD', 12000), row('2026-11-11', '[영수증] KJFOOD', 9000)];
  assert.deepEqual(duplicateGroups(rows), [[0, 1]]);
  assert.deepEqual(duplicatesOf(rows.slice(0, 1), rows[1]), [0]);
});

test('경비 구분·계정과목·결제수단이 달라도 같은 내역으로 본다', () => {
  const rows = [
    row('2026-11-11', '테스트식당', 7000, { section: 'dept', account: '회의비', payment: '법인카드' }),
    row('2026-11-11', '테스트식당', 7000, { section: 'project', account: '식비', project: 'P-1' }),
  ];
  assert.deepEqual(duplicateGroups(rows), [[0, 1]]);
});

test('새 내역과 같은 기존 행을 찾는다', () => {
  const rows = [row('2026-11-10', '테스트약국', 3200), row('2026-11-11', '테스트식당', 7000)];
  assert.deepEqual(duplicatesOf(rows, row('2026-11-11', '(주)테스트식당', 7000)), [1]);
  assert.deepEqual(duplicatesOf(rows, row('2026-11-11', '테스트식당', 7001)), []);
  assert.deepEqual(duplicatesOf(rows, row('2026-11-11', null, 7000)), []);
});

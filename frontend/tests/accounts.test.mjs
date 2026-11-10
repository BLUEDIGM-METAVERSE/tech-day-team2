import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withExpenseDefaults } from '../src/constants/accounts.ts';

const receipt = merchant => ({ date: '2026-11-10', merchant, amount: 12000 });

test('병원·의원·진료과와 약국에 의료비 기본값을 적용한다', () => {
  for (const merchant of ['우리의원', '서울병원', '서울 이비인후과', '미래내과', '우리외과']) {
    const result = withExpenseDefaults(receipt(merchant));
    assert.deepEqual([result.account, result.description, result.payment], ['의료비', '의료비', '개인카드']);
  }
  const pharmacy = withExpenseDefaults(receipt('우리병원 앞 약국'));
  assert.deepEqual([pharmacy.account, pharmacy.description], ['의료비', '약제비']);
});

test('식당은 기존 목록의 식비를 선택하고 불명확한 상호는 계정과목을 비운다', () => {
  assert.equal(withExpenseDefaults(receipt('우리식당')).account, '야근(특근)식비');
  assert.equal(withExpenseDefaults(receipt('테스트상점')).account, undefined);
  assert.equal(withExpenseDefaults(receipt(null)).payment, '개인카드');
});

test('기존 값과 프로젝트경비 선택 범위를 존중한다', () => {
  const original = { ...receipt('우리의원'), account: '기타경비', description: '', payment: '법인카드' };
  assert.deepEqual(withExpenseDefaults(original), original);
  const project = withExpenseDefaults({ ...receipt('우리병원'), section: 'project' });
  assert.equal(project.account, undefined);
  assert.equal(project.payment, undefined);
});

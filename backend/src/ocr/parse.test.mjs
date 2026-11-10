import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText } from './parse.mjs';

// 테스트 값은 모두 지어낸 가짜 값이다.
const dateOf = text => parseReceiptText(text).data.date;
const amountOf = text => parseReceiptText(text).data.amount;
const merchantOf = text => parseReceiptText(text).data.merchant;
const hasWarning = (text, word) => parseReceiptText(text).warnings.some(w => w.includes(word));

test('전체 영수증에서 세 필드를 모두 뽑고 경고가 없다', () => {
  const text = [
    '[영수증]',
    '상호: 가나다 테스트상점',
    '사업자번호: 000-00-00000',
    'TEL 010-0000-0000',
    '거래일시 2026-10-29 13:05:22',
    '테스트 상품  2  3,000  6,000',
    '공급가액      10,000',
    '부가세         1,000',
    '합 계         11,000',
    '결 제 금 액   11,000원',
    '받은돈        20,000',
    '거스름돈       9,000',
    '카드번호 0000-11**-****-3333',
  ].join('\n');
  assert.deepEqual(parseReceiptText(text), {
    data: { date: '2026-10-29', merchant: '가나다 테스트상점', amount: 11000 },
    warnings: [],
  });
});

test('빈 입력과 문자열이 아닌 입력은 예외 없이 전부 null과 경고를 돌려준다', () => {
  for (const input of ['', '   \n ', undefined, null, 123, {}, [], true]) {
    const result = parseReceiptText(input);
    assert.deepEqual(result.data, { date: null, merchant: null, amount: null });
    assert.ok(result.warnings.length > 0);
  }
});

test('날짜 표기를 모두 지원한다', () => {
  for (const text of ['2026-10-29', '2026.10.29', '2026/10/29', '26/10/29', '26-10-29', '2026년 10월 29일', '2026 년 10 월 29 일']) {
    assert.equal(dateOf(text), '2026-10-29', text);
  }
  assert.equal(dateOf('2026.1.5'), '2026-01-05');
});

test('날짜 뒤에 시각이 붙어도 된다', () => {
  assert.equal(dateOf('2026-10-29 13:05'), '2026-10-29');
  assert.equal(dateOf('26/10/29 13:05:22'), '2026-10-29');
  assert.equal(dateOf('2026년 10월 29일 오후 1시'), '2026-10-29');
});

test('없는 날짜는 후보에서 제외한다', () => {
  assert.equal(dateOf('2026-02-31'), null);
  assert.equal(dateOf('26-13-01'), null);
  assert.equal(dateOf('2026-02-31\n2026-03-01'), '2026-03-01');
  assert.equal(dateOf('2028-02-29'), '2028-02-29');
  assert.equal(dateOf('2026-02-29'), null);
  assert.ok(hasWarning('2026-02-31', '날짜'));
});

test('서로 다른 유효 날짜가 여럿이면 null과 경고, 표기만 다르면 하나로 본다', () => {
  assert.equal(dateOf('2026-10-29\n2026-10-30'), null);
  assert.ok(hasWarning('2026-10-29\n2026-10-30', '날짜'));
  assert.equal(dateOf('2026-10-29\n26/10/29\n2026년 10월 29일'), '2026-10-29');
});

test('전화번호·사업자번호·카드번호를 날짜로 오인하지 않는다', () => {
  for (const text of ['010-0000-0000', '02-000-0000', '000-00-00000', '0000-1111-2222-3333', 'TEL 26-10-29', '전화: 26-10-29',
    '사업자번호 26-10-29', '카드번호 2026-10-29', '26-10-29-11', '11-26-10-29', '2026-10-2911']) {
    assert.equal(dateOf(text), null, text);
  }
  assert.equal(dateOf('TEL 010-0000-0000 2026-10-29 13:05'), '2026-10-29');
  assert.equal(dateOf('HOTEL 2026-10-29'), '2026-10-29');
});

test('금액은 최종 금액 라벨이 합계보다 우선한다', () => {
  assert.equal(amountOf('합계 12,000\n결제금액 10,000'), 10000);
  assert.equal(amountOf('총액 12,000\n승인금액 10,000'), 10000);
  assert.equal(amountOf('합계 12,000\n받을금액 10,000'), 10000);
  assert.equal(amountOf('합계 12,000\n청구금액 10,000'), 10000);
  assert.equal(amountOf('합계 12,000 결제금액 10,000'), 10000);
  assert.equal(amountOf('결제금액 10,000 합계 12,000'), 10000);
});

test('합계 계열 라벨과 글자 사이 공백을 인식한다', () => {
  for (const text of ['합계금액 5,000', '합계 5,000', '총액 5,000', '총 금액 5,000', '합 계 5,000', '결 제 금 액 5,000', '합 계 금 액 : 5,000', '합계:5000', '합계：5,000', '총합계 5,000']) {
    assert.equal(amountOf(text), 5000, text);
  }
});

test('쉼표와 원·₩ 표기를 처리한다', () => {
  for (const text of ['합계 12,000원', '합계 12,000 원', '합계 ₩12,000', '합계 ₩ 12,000', '합계 ￦12,000', '합계 12000', '합계 ....... 12,000', '합계 ---- 12,000']) {
    assert.equal(amountOf(text), 12000, text);
  }
});

test('제외 라벨 줄은 금액 후보가 아니다', () => {
  for (const word of ['부가세', '부가가치세', '세액', '과세', '면세', '공급가액', '봉사료', '받은돈', '받은금액', '거스름돈', '잔돈', '할인', '포인트', '단가', '수량']) {
    assert.equal(amountOf(`${word} 합계 7,000`), null, word);
    assert.equal(amountOf(`${word} 합계 7,000\n합계 9,000`), 9000, word);
  }
  assert.equal(amountOf('부 가 세 합계 7,000'), null);
  assert.equal(amountOf('받 은 금 액 7,000\n결제금액 9,000'), 9000);
});

test('같은 우선순위의 금액이 충돌하면 null과 경고, 아래 단계로 내려가지 않는다', () => {
  assert.equal(amountOf('합계 5,000\n총액 6,000'), null);
  assert.ok(hasWarning('합계 5,000\n총액 6,000', '금액'));
  assert.equal(amountOf('결제금액 5,000\n승인금액 6,000\n합계 5,000'), null);
  assert.equal(amountOf('합계 5,000\n총액 5,000'), 5000);
  assert.equal(amountOf('합계 3 12,000'), null);
});

test('라벨이 없으면 가장 큰 숫자를 고르지 않는다', () => {
  assert.equal(amountOf('테스트 상품 3,000\n다른 상품 90,000'), null);
  assert.ok(hasWarning('테스트 상품 3,000\n다른 상품 90,000', '금액'));
  assert.equal(amountOf('금액 3,000'), null);
});

test('0 이하와 소수는 후보에서 제외하고 0으로 대체하지 않는다', () => {
  for (const text of ['합계 0', '합계 0원', '합계 -5,000', '합계 - 5,000', '합계 ₩-5,000', '합계 12.5', '합계 12,000.50']) {
    assert.equal(amountOf(text), null, text);
  }
  assert.equal(amountOf('결제금액 0\n합계 5,000'), 5000);
});

test('금액의 점 천 단위 구분자와 공백을 제거한다', () => {
  for (const text of ['합 계 : 42. 700  ', '합계 ₩42.700원', '합계 1. 234 . 567']) {
    assert.equal(amountOf(text), text.includes('567') ? 1234567 : 42700);
  }
  assert.equal(amountOf('합 계 : 42. 700\n받을금액 : 42. 700\n받은금액 : 42. 700'), 42700);
  assertNoAmount('합계 42. 70');
  assertNoAmount('합계 -42. 700');
  assertNoAmount('합계 42. 700 USD');
  assertNoAmount('합계 42. 700\n합계 43. 700');
});

test('금액 라벨 뒤의 번호·시각·비율·깨진 숫자를 금액으로 읽지 않는다', () => {
  assert.equal(amountOf('합계 12,000 TEL 010-0000-0000'), 12000);
  assert.equal(amountOf('승인금액 12,000 승인번호 00001111'), 12000);
  for (const text of ['합계 13:05', '합계 2026-10-29', '합계 10%', '합계 3개', '합계 12 000', '합계 12,00', '합계 1,2,3', '합계 99999999999999999999']) {
    assert.equal(amountOf(text), null, text);
  }
  // '합계'를 품은 다른 낱말은 라벨이 아니다.
  assert.equal(amountOf('종합 계좌 1000'), null);
  assert.equal(amountOf('통합계산서 1000'), null);
});

test('거래처 라벨과 구분자를 인식한다', () => {
  for (const text of ['상호: 테스트상점', '상호：테스트상점', '상호 테스트상점', '상호명 : 테스트상점', '가맹점 테스트상점', '가맹점명: 테스트상점', '매장명 테스트상점', '상 호 : 테스트상점', '가 맹 점 명 테스트상점']) {
    assert.equal(merchantOf(text), '테스트상점', text);
  }
  assert.equal(merchantOf('상호 : (주)가나다 테스트점  '), '(주)가나다 테스트점');
  assert.equal(merchantOf('사업자번호 000-00-00000 상호: 테스트상점'), '테스트상점');
  assert.equal(merchantOf('상호: 테스트상점 대표 김가짜 TEL 010-0000-0000'), '테스트상점');
});

test('거래일과 금액이 확인되고 상단에 이름 후보가 하나면 상호 라벨 없이 읽는다', () => {
  assert.equal(merchantOf('테스트상점\n2026-10-29\n합계 1,000'), '테스트상점');
  assert.equal(merchantOf('신용카드 매출전표\n서울이비인후과\n거래일시 2026-10-29\n합계 1,000'), '서울이비인후과');
  assert.equal(merchantOf('매출전표\n테스트상점\n다른이름\n2026-10-29\n합계 1,000'), null);
  assert.equal(merchantOf('매출전표\n2026-10-29\n합계 1,000'), null);
  assert.ok(hasWarning('테스트상점\n합계 1,000', '거래처'));
});

test('서로 다른 거래처가 여럿이면 null과 경고, 공백만 다르면 하나로 본다', () => {
  assert.equal(merchantOf('상호: 테스트상점\n가맹점명: 다른상점'), null);
  assert.ok(hasWarning('상호: 테스트상점\n가맹점명: 다른상점', '거래처'));
  assert.equal(merchantOf('상호: 테스트 상점\n가맹점명: 테스트상점'), '테스트 상점');
});

test('라벨 뒤가 상호가 아니면 값으로 쓰지 않는다', () => {
  for (const text of ['상호테스트상점', '가맹점번호 00001111', '가맹점 번호 00001111', '가 맹 점 번 호 00001111', '가맹점 00001111', '가맹점 정보', '가맹점 주소: 가짜시 가짜구',
    '가맹점 수수료 1,000', '가맹점 보관용', '본 영수증 가맹점 보관용', '상호:', '협상호 테스트']) {
    assert.equal(merchantOf(text), null, text);
  }
});

test('줄바꿈 종류와 전각 문자를 처리한다', () => {
  assert.deepEqual(parseReceiptText('상호：테스트상점\r\n２０２６-１０-２９\r합계　１２，０００').data,
    { date: '2026-10-29', merchant: '테스트상점', amount: 12000 });
});

// ---- 검토 지적 회귀 테스트 ----
// 전체 영수증 형태에서 금액·날짜·거래처 하나만 바꿔 넣어 조용한 오류(경고 없는 잘못된 값)를 확인한다.
const receipt = (...lines) => ['상호: 가짜상점', '2026-10-29 13:05', ...lines].join('\n');
const assertNoAmount = text => {
  assert.equal(amountOf(text), null, text);
  assert.ok(hasWarning(text, '금액'), `경고 없음: ${text}`);
};
const assertNoDate = text => {
  assert.equal(dateOf(text), null, text);
  assert.ok(hasWarning(text, '날짜') || hasWarning(text, '거래일'), `경고 없음: ${text}`);
};
const assertNoMerchant = text => {
  assert.equal(merchantOf(text), null, text);
  assert.ok(hasWarning(text, '거래처'), `경고 없음: ${text}`);
};

test('지적 1: 천 단위 구분자가 깨진 금액은 앞 조각으로 읽지 않는다', () => {
  for (const text of ['합계 11, 000', '합계 11 ,000', '합계 12 , 000', '합계 12,OOO', '합계 1,OOO', "합계 12'000",
    '합계 12;000', '합계 12`000', '합계 12·000', '합계 12_000', '결제금액 5,​000']) {
    assertNoAmount(text);
    assertNoAmount(receipt(text));
  }
  assertNoAmount('합계 11, 000\n합계 12,000');
});

test('지적 2: 최종 금액 라벨의 값을 읽지 못하면 합계로 내려가지 않는다', () => {
  for (const text of ['합계 12,000\n결제금액 10 000', '합계 12,000\n결제금액 1O,OOO', '합계 12,000\n결제금액\n10,000', '결제금액 :\n10,000\n합계 12,000']) {
    assertNoAmount(text);
  }
  // 값이 있는 같은 라벨이 있으면 빈 라벨은 문제가 아니다.
  assert.equal(amountOf('결제금액\n결제금액 10,000\n합계 12,000'), 10000);
});

test('지적 3: 제외 낱말이 붙은 최종 금액 줄이 있으면 할인 전 합계를 채택하지 않는다', () => {
  for (const text of ['합계 12,000\n할인 후 결제금액 10,000', '합계 12,000\n결제금액(할인후) 10,000', '합계 12,000\n포인트 사용 후 결제금액 10,000',
    '합계 12,000\n쿠폰적용 결제금액 10,000', '합계 12,000\n할인 2,000  결제금액 10,000']) {
    assertNoAmount(text);
  }
  assert.equal(amountOf('할인 후 결제금액 10,000\n결제금액 10,000\n합계 12,000'), 10000);
});

test('지적 4: 수식어가 붙은 최종 금액 라벨을 믿지 않는다', () => {
  for (const text of ['누적 결제금액 150,000\n합계 11,000', '당월 승인금액 500,000\n합계 11,000', '이전 결제금액 3,000\n합계 11,000',
    '현금 결제금액 3,000\n합계 11,000', '상품권 결제금액 3,000\n합계 11,000']) {
    assertNoAmount(text);
  }
  for (const text of ['총 결제금액 5,000', '최종 결제금액 5,000', '최 종 결 제 금 액 5,000', '실결제금액 5,000']) {
    assert.equal(amountOf(text), 5000, text);
  }
});

test('지적 5: 거래처 라벨 뒤가 다른 항목이면 값으로 쓰지 않는다', () => {
  for (const text of ['가맹점 전화번호 02-000-0000', '가맹점 사업자번호 000-00-00000', '가맹점 사업자등록번호: 000-00-00000', '가맹점 대표자 김가짜',
    '가맹점 연락처 010-0000-0000', '가맹점 TEL 02-000-0000', '가맹점 문의 1588-0000', '가맹점 서명', '가맹점 유의사항',
    '상호 대표자 전화번호', '상호: 대표자: 김가짜', '상호 간 협의 후 환불됩니다']) {
    assertNoMerchant(text);
  }
  assert.equal(merchantOf('가맹점명: 가짜마트\n가맹점 전화번호 02-000-0000'), '가짜마트');
});

test('지적 6: 거래처 값에 같은 줄의 다른 항목을 섞지 않는다', () => {
  for (const text of ['상호 가짜마트 2026-10-29 13:05', '상호: 가짜마트 합계 1,000', '상호: 가짜마트 일시 2026-10-29', '상호: 가짜마트 000-00-00000',
    '상호: 가짜마트 T:02-000-0000', '상호: 가짜마트 ☎ 02-000-0000', '상호: 가짜마트 (대표: 김가짜)', '상호: 가짜마트 / 대표 김가짜', '상호 (법인명) 가짜마트']) {
    assert.equal(merchantOf(text), '가짜마트', text);
  }
  // 상호 안의 낱말과 숫자는 유지한다.
  assert.equal(merchantOf('상호: (주)가짜 카드 2호점'), '(주)가짜 카드 2호점');
});

test('지적 7: 지원 표기가 기한 줄의 날짜뿐이면 거래일로 채택하지 않는다', () => {
  for (const text of ['2026. 10. 29 13:05\n교환기한 2026-11-05', '26.10.29 13:05\n쿠폰 유효기간 2027-12-31', '26년 10월 29일\n쿠폰 유효기간 2026-12-31',
    '쿠폰 유효기간 2027-12-31', '2026-10-29\n교환기한 2026-11-05', '2026. 10. 29\n2026-11-05']) {
    assertNoDate(text);
  }
  assert.equal(dateOf('2026. 10. 29\n2026-10-29'), '2026-10-29');
  assert.equal(dateOf('2026-10-29\n교환기한 2026-10-29'), '2026-10-29');
});

test('지적 8: 번호를 날짜로 읽지 않는다', () => {
  for (const text of ['단말기번호 26-10-29', 'POS 26-10-29', '계좌번호 26-10-29', '상품코드 12-11-30', 'NO.26-10-29', 'SN26-10-29', 'TEL) 26-10-29',
    'TEL:(02) 26-10-29', '전화 02 26-10-29', 'T.26-10-29', 'H.P 26-10-29', '카드 26-10-29', '카드 No 26-10-29', '승인 No 26-10-29', '카드번호\n26-10-29',
    '카드번호\n2026-10-29', '26-10-29-****', '2026-10-29-****', '회원번호 26-10-29', '회원번호 2026-10-29']) {
    assertNoDate(text);
  }
  assert.equal(dateOf('거래일시: 26-10-29 13:05'), '2026-10-29');
  assert.equal(dateOf('TEL 010-0000-0000 26-10-29'), '2026-10-29');
  assert.equal(dateOf('카드번호 0000-11**-****-3333\n26-10-29'), '2026-10-29');
});

test('지적 9: 음수 표기와 취소·환불 전표의 금액을 지출로 쓰지 않는다', () => {
  for (const text of ['합계 5,000-', '합계 ₩5,000-', '합계 △5,000', '합계 ▲5,000', '합계 (5,000)', '합계 —5,000', '승인취소\n승인금액 11,000', '환불 합계 5,000']) {
    assertNoAmount(text);
    assertNoAmount(receipt(text));
  }
  // 환불 안내문만 있는 정상 영수증은 막지 않는다.
  assert.equal(amountOf('합계 5,000\n교환 및 환불은 7일 이내'), 5000);
});

test('지적 10: 합계 뒤에 할인·봉사료가 있으면 합계를 최종 금액으로 쓰지 않는다', () => {
  for (const text of ['합계 10,000\n할인 2,000\n카드 8,000', '합계 10,000\n할인 2,000\n결제 8,000', '메뉴합계 8,000\n봉사료 800\n총 결제 8,800', '음식합계 10,000\n봉사료 1,000\n받을돈 11,000']) {
    assertNoAmount(text);
  }
  assert.equal(amountOf('합계 10,000\n할인 2,000\n결제금액 8,000'), 8000);
  assert.equal(amountOf('할인 2,000\n합계 8,000'), 8000);
  assert.equal(amountOf('합계 10,000\n할인 0\n봉사료 0'), 10000);
  assert.equal(amountOf('합계 10,000\n적립 포인트 100'), 10000);
});

test('지적 11: 수식어가 붙은 합계를 최종 합계로 쓰지 않는다', () => {
  for (const text of ['중간합계 9,000', '부분합계 9,000', '품목합계 9,000', '거래금액 8,000\n상품합계 9,000', '세금합계 1,000', '영세 합계 1,000', '건수 합계 3', '월 누적 합계 150,000']) {
    assertNoAmount(text);
  }
  assert.equal(amountOf('메뉴합계 10,000\n합계 12,000'), 12000);
});

test('지적 12: 외화 금액을 원 단위로 쓰지 않는다', () => {
  for (const text of ['합계 $12', '합계 USD 12', '합계 12 USD', '결제금액 ¥5,000', '결제금액 €20', '승인금액 100 달러', '승인금액 1,000 엔', '승인금액 USD 120']) {
    assertNoAmount(text);
  }
  assert.equal(amountOf('합계 KRW 12,000'), 12000);
});

test('지적 13: 붙은 시각과 하이픈 시각을 날짜로 오인하지 않는다', () => {
  for (const text of ['26/10/29-13:05', '2026-10-29-13:05', '2026-10-29 13-05-22']) {
    assert.equal(dateOf(text), '2026-10-29', text);
  }
  // 시각이 될 수 없는 값은 다른 날짜로 보아 충돌 처리한다.
  assertNoDate('2026-10-29 26-10-30');
});

test('지적 14(미수정): 2자리 연도는 명세대로 20YY로 읽는다', () => {
  // 명세가 YY/MM/DD와 20YY를 정했으므로 '12/10/26'은 2012-10-26이다. 규칙을 바꾸려면 팀 합의가 필요하다.
  assert.equal(dateOf('12/10/26'), '2012-10-26');
});

test('점 표기와 2자리 연도 한글 표기를 날짜로 읽는다', () => {
  for (const text of ['2026. 10. 29', '2026. 10. 29.', '2026. 10. 29 13:05', '2026 . 10 . 29', '26.10.29', '26. 10. 29', '26.10.29 13:05', '거래일시: 26.10.29', '26년 10월 29일',
    '2026. 10. 29 13-05-22', '2026. 10. 29. 13.05.22']) {
    assert.equal(dateOf(text), '2026-10-29', text);
  }
  assert.equal(dateOf('2026. 3. 5'), '2026-03-05');
  assert.equal(merchantOf('상호: 가짜마트 2026. 10. 29'), '가짜마트');
});

test('점 표기라도 번호·소수·없는 날짜는 날짜로 읽지 않는다', () => {
  for (const text of ['단말기번호 26.10.29', '승인번호 2026.10.29', '상품 26.10.29', '26.10.29.11', '1.26.10.29', '26.10.291', '2026. 2. 31', '26.13.01', '1,026.10.29']) {
    assertNoDate(text);
  }
  assertNoDate('2026. 10. 29\n26.10.30');
});

test('카드 수식어가 붙은 최종 금액은 다른 결제·다른 합계가 없을 때만 쓴다', () => {
  for (const text of ['카드 결제금액 11,000', '신용카드 승인금액 11,000', '체크 카드 결제금액 11,000', '법인카드 승인금액 11,000', '카드 결제금액 11,000원\n합계 11,000', '합계 11,000\n현금 0\n카드 결제금액 11,000']) {
    assert.equal(amountOf(text), 11000, text);
  }
  for (const text of ['카드 결제금액 3,000\n현금 결제금액 8,000', '카드 결제금액 3,000\n상품권 결제금액 8,000', '카드 결제금액 3,000\n현금 8,000', '카드 결제금액 3,000\n상품권: 8,000',
    '카드 결제금액 3,000\n합계 11,000', '합계 12,000\n할인 2,000\n카드 결제금액 10,000', '카드 결제금액 3,000\n카드 결제금액 8,000', '누적 카드 결제금액 150,000', '취소 카드 결제금액 11,000']) {
    assertNoAmount(text);
  }
  // 카드 수식어는 최종 금액 라벨에만 허용한다.
  assertNoAmount('카드 합계 11,000');
});

const appCapture = (first = '가나다만두') => ['이용내역 상세', '', first, '22,000 원', '2026.10.28. 19:14:26', '결제정보', '이용금액  22,000 원', '부가세  2,000원', '봉사료  0원',
  '이용카드  본인', '0000********0000', '이용구분  일시불', '승인번호  00000000', '가맹점 정보', '업종  0000/스넥/휴게음식점', '사업자번호  000-00-00000', '주소  서울특별시 가나구 테스트대로 000 1층', '전화번호  02-000 -0000'].join('\n');

test('카드 앱 이용내역 캡처에서 세 필드를 모두 뽑는다', () => {
  assert.deepEqual(parseReceiptText(appCapture()), { data: { date: '2026-10-28', merchant: '가나다만두', amount: 22000 }, warnings: [] });
  assert.equal(merchantOf('< 이용내역 상세 >\n샘플호텔 레스토랑'), '샘플호텔 레스토랑');
  assert.equal(merchantOf('이용 내역 상세\n가나다만두 22,000 원'), '가나다만두');
});

test('앱 캡처 제목 다음 줄이 상호가 아니면 거래처를 비운다', () => {
  for (const first of ['22,000 원', '22,000원', '2026.10.28. 19:14:26', '결제정보', '결제 정보', '가맹점 정보', '이용금액  22,000 원']) {
    assert.equal(merchantOf(appCapture(first)), null, first);
  }
  assert.equal(merchantOf('이용내역 상세'), null);
  // 제목이 없으면 첫 줄을 추측하지 않는다.
  assert.equal(merchantOf('가나다만두\n이용금액 22,000 원'), null);
});

test('앱 캡처에서도 라벨이 붙은 상호를 먼저 쓴다', () => {
  assert.equal(merchantOf('이용내역 상세\n다른이름\n가맹점명: 가나다만두'), '가나다만두');
  assert.equal(merchantOf('이용내역 상세\n상호: 가나다만두'), '가나다만두');
});

test('이용금액을 최종 금액으로 읽되 믿을 수 없는 표기는 비운다', () => {
  assert.equal(amountOf('이용금액 22,000 원\n부가세 2,000원\n봉사료 8,000원'), 22000);
  assert.equal(amountOf('합계 12,000\n할인 2,000\n이용금액 10,000'), 10000);
  assert.equal(amountOf('카드 이용금액 22,000 원'), 22000);
  for (const text of ['누적 이용금액 150,000', '이번달 이용금액 150,000\n합계 22,000', '이용금액 22,000\n이용금액 33,000', '이용금액\n22,000', '이용금액 22, 000', '이용금액 $22', '승인취소\n이용금액 22,000']) {
    assertNoAmount(text);
  }
});

test('OCR이 날짜 뒤 공백을 빠뜨려도 붙은 시각을 허용한다', () => {
  for (const text of ['2026.10.29.19:14:26', '2026.10.29.19:14', '26.10.29.19:14:26', '2026-10-29.19:14']) {
    assert.equal(dateOf(text), '2026-10-29', text);
  }
  // 시각이 아니면 여전히 번호로 본다.
  for (const text of ['2026.10.29.19', '26.10.29.11', '2026.10.29.1914']) {
    assertNoDate(text);
  }
});

test('OCR이 합계를 함계로 읽어도 합계로 처리한다', () => {
  assert.equal(amountOf('함계 6,200'), 6200);
  assert.equal(amountOf('함계 6,200\n합계 6,200'), 6200);
  assert.equal(amountOf('함계 6,200\n결제금액 5,000'), 5000);
  for (const text of ['함계 6,200\n합계 7,000', '소함계 6,200', '함계 6,200\n할인 1,000']) {
    assertNoAmount(text);
  }
});

test('OCR의 합게 표기를 합계로 처리하고 충돌이나 소계는 제외한다', () => {
  for (const text of ['합게 6,200', '합게 금액: 6,200원', '합게액 6,200']) {
    assert.equal(amountOf(text), 6200);
  }
  assert.equal(amountOf('합게 6,200\n결제금액 5,000'), 5000);
  assertNoAmount('합게 6,200\n합계 7,000');
  assertNoAmount('소합게 6,200');
});

test('공백이 아주 길거나 날짜가 반복되는 입력에서도 오래 걸리지 않는다', () => {
  const started = performance.now();
  assert.equal(amountOf(`합계 1${' '.repeat(200000)}x`), 1);
  assert.equal(dateOf('26-10-29 '.repeat(50000)), '2026-10-29');
  assert.ok(performance.now() - started < 5000);
});

test('경고에 원문을 넣지 않고 로그를 출력하지 않는다', t => {
  const spies = ['log', 'info', 'warn', 'error', 'debug'].map(name => t.mock.method(console, name, () => {}));
  const { warnings } = parseReceiptText('상호: 비밀상점\n가맹점: 다른비밀상점\n합계 1,234\n총액 5,678\n2026-10-29\n2026-10-30');
  for (const spy of spies) assert.equal(spy.mock.callCount(), 0);
  assert.equal(warnings.length, 3);
  for (const warning of warnings) assert.doesNotMatch(warning, /비밀|1,234|5,678|2026/);
});

test('민감정보 8종을 결과 후보에서 제외하고 같은 줄의 정상 필드는 유지한다', () => {
  for (const label of ['카드사', '카드번호', '승인번호', '가맹점번호', '매입사명', '거래처 주소', '거래처 사업자번호', '거래처 전화번호']) {
    const text = `상호: 테스트상점 ${label}: 2026-01-01 거래일자: 2026-11-10 결제금액: 12,300원`;
    const result = parseReceiptText(text);
    assert.deepEqual(result, { data: { date: '2026-11-10', merchant: '테스트상점', amount: 12300 }, warnings: [] }, label);
  }
});

test('별도 줄의 민감정보가 카드 앱의 거래처나 날짜가 되지 않는다', () => {
  const result = parseReceiptText('이용내역 상세\n카 드 사 :\n테스트카드\n거래처 주소:\n2026-01-01\n승인일자: 2026-11-10\n결제금액: 12,300원');
  assert.deepEqual(result.data, { date: '2026-11-10', merchant: null, amount: 12300 });
});

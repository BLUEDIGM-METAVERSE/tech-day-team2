import type { ReceiptData } from '../types/receipt';

// 같은 영수증을 두 번 넣었는지 알려 주기 위한 비교. 일자·금액이 같고 거래처가 같아 보이면 같은 내역으로 본다.
// 같은 가게에서 같은 날 같은 금액을 두 번 쓴 정상 건도 있으므로 경고에만 쓰고 추가·복사를 막지 않는다.
// 계정과목·상세내역·결제수단·프로젝트번호·경비 구분은 사용자가 고르는 값이라 비교하지 않는다.

// 거래처는 OCR·수기 입력의 표기 차이를 줄여 비교한다: 전각·반각, 대소문자, 법인 표기((주)·㈜·주식회사),
// 그리고 공백·괄호·기호(글자와 숫자가 아닌 것)를 모두 뺀다.
export function merchantKey(merchant: string | null | undefined): string {
  return (merchant ?? '').normalize('NFKC').toLowerCase().replace(/\(주\)|주식회사/g, '').replace(/[^\p{L}\p{N}]/gu, '');
}

// 한쪽이 다른 쪽을 포함해도 같은 거래처로 본다. OCR이 "[영수증] KJFOOD"처럼 앞뒤에 다른 글자를 붙여 읽는 경우가 있다.
// 한 글자짜리는 우연히 포함되기 쉬워 완전히 같을 때만 인정한다.
const MIN_PARTIAL = 2;
export function sameMerchant(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = merchantKey(a), y = merchantKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= MIN_PARTIAL && long.includes(short);
}

// 일자·금액·거래처 중 하나라도 비어 있으면 비교하지 않는다.
export function sameReceipt(a: ReceiptData, b: ReceiptData): boolean {
  if (!a.date || a.date !== b.date) return false;
  if (a.amount === null || a.amount === undefined || a.amount !== b.amount) return false;
  return sameMerchant(a.merchant, b.merchant);
}

// 목록에서 같은 내역이 둘 이상인 묶음만 돌려준다. 값은 rows의 인덱스이며, 서로 이어지는 행은 한 묶음으로 합친다.
export function duplicateGroups(rows: ReceiptData[]): number[][] {
  const group = rows.map((_, i) => i);
  rows.forEach((row, i) => {
    for (let j = 0; j < i; j++) {
      if (group[i] === group[j] || !sameReceipt(row, rows[j])) continue;
      const from = group[i], to = group[j];
      group.forEach((g, k) => { if (g === from) group[k] = to; });
    }
  });
  const byGroup = new Map<number, number[]>();
  group.forEach((g, i) => byGroup.set(g, [...(byGroup.get(g) ?? []), i]));
  return [...byGroup.values()].filter(list => list.length > 1);
}

// 새로 넣으려는 내역과 같은 기존 행의 인덱스.
export function duplicatesOf(rows: ReceiptData[], d: ReceiptData): number[] {
  return rows.flatMap((row, i) => sameReceipt(row, d) ? [i] : []);
}

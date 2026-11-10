import type { ReceiptData, ReceiptResult } from '../types/receipt';

export type Section = NonNullable<ReceiptResult['data']['section']>;

// 팀이 제공한 지출결의서 계정과목 목록(2026-11-02). 시트와 연동하지 않으며 목록 변경은 이 파일에서 한다.
const OVERTIME_MEAL = '야근(특근)식비';
const MEDICAL = '의료비';
const PERSONAL_CARD = '개인카드';

export const ACCOUNTS: Record<Section, readonly string[]> = {
  dept: [OVERTIME_MEAL, '업무교통비', '접대비', '부서회식비', '조직관리비', '소모품비', '운반비', '동호회비', '기타경비', '유류비', '주차통행료', MEDICAL, '자녀교육비', '직무교육비'],
  project: [OVERTIME_MEAL, '업무교통비', '회의비(내부)', '접대비', '소모품비', '기타경비'],
};

// 부서경비 결제수단 목록(2026-11-02 팀 제공). 프로젝트경비의 마지막 열은 프로젝트번호이며 직접 입력한다.
export const PAYMENTS: readonly string[] = ['법인카드', PERSONAL_CARD, '현금영수증'];


// 거래처명에서 유형이 드러나는 경우에만 초안의 기본값을 채운다.
const CLINIC_NAME = /병원|의원|이비인후과|내과|외과|소아청소년과|소아과|산부인과|피부과|안과|치과|한의원|정형외과|비뇨의학과|가정의학과/;
const RESTAURANT_NAME = /식당|음식점|레스토랑|분식|한식|중식당|일식당|양식당|국밥|곰탕|설렁탕|칼국수|냉면|김밥|떡볶이|삼겹살|돈까스|돈가스|초밥|치킨|피자|족발|보쌈|버거/;

export function withExpenseDefaults(data: ReceiptData): ReceiptData {
  const merchant = (data.merchant ?? '').normalize('NFKC').replace(/\s+/g, '');
  const pharmacy = merchant.includes('약국');
  const medical = pharmacy || CLINIC_NAME.test(merchant);
  const section = data.section ?? 'dept';
  const account = medical ? MEDICAL : RESTAURANT_NAME.test(merchant) ? OVERTIME_MEAL : undefined;

  return {
    ...data,
    account: data.account ?? (account && ACCOUNTS[section].includes(account) ? account : undefined),
    description: data.description ?? (pharmacy ? '약제비' : medical ? MEDICAL : undefined),
    payment: data.payment ?? (section === 'dept' ? PERSONAL_CARD : undefined),
  };
}

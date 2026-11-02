import type { ReceiptResult } from '../types/receipt';

export type Section = NonNullable<ReceiptResult['data']['section']>;

// 팀이 제공한 지출결의서 계정과목 목록(2026-11-02). 시트와 연동하지 않으며 목록 변경은 이 파일에서 한다.
export const ACCOUNTS: Record<Section, readonly string[]> = {
  dept: ['야근(특근)식비', '업무교통비', '접대비', '부서회식비', '조직관리비', '소모품비', '운반비', '동호회비', '기타경비', '유류비', '주차통행료', '의료비', '자녀교육비', '직무교육비'],
  project: ['야근(특근)식비', '업무교통비', '회의비(내부)', '접대비', '소모품비', '기타경비'],
};

// 부서경비 결제수단 목록(2026-11-02 팀 제공). 프로젝트경비의 마지막 열은 프로젝트번호이며 직접 입력한다.
export const PAYMENTS: readonly string[] = ['법인카드', '개인카드', '현금영수증'];

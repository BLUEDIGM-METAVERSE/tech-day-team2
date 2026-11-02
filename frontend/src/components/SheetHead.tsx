import type { Section } from '../constants/accounts';
// 원본 양식의 열 머리글. actions가 true면 삭제 열을 덧붙인다.
export function SheetHead({ section, actions = false }: { section: Section; actions?: boolean }) {
  const project = section === 'project';
  return <thead>
    <tr className="excel-columns"><th></th><th>A</th><th>B:C</th><th>D:F</th><th>G:O</th><th>P:R</th><th>S:U</th><th>V:X</th>{actions && <th></th>}</tr>
    <tr><th className="row-number">{project ? 45 : 21}</th><th>NO</th><th>일자</th><th>계정과목</th><th>비용 상세내역 (전체)</th><th>거래처</th><th>금액</th><th>{project ? '프로젝트번호' : '결제수단'}</th>{actions && <th>순서·삭제</th>}</tr>
  </thead>;
}

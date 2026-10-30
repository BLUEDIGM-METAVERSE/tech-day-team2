import type { ReceiptResult } from '../types/receipt';
// 탭·개행을 정리하고 입력값의 엑셀 수식 실행을 방지한다.
export function excelText(value: string | number | null | undefined): string {
  const text = String(value ?? '').replace(/[\t\r\n]/g, ' ');
  return /^\s*[=+@-]/.test(text) ? "'" + text : text;
}
export function receiptTsv(result: ReceiptResult, template: boolean): string {
  const d = result.data;
  const values = [d.date, d.account, d.description, d.merchant, d.amount, d.section === 'project' ? d.project : d.payment];
  if (!template) return values.map(excelText).join('\t');
  // B~X 범위: 병합 셀의 첫 열 B/D/G/P/S/V에만 값을 배치한다.
  const cells = Array<string>(23).fill('');
  [0,2,5,14,17,20].forEach((index, i) => { cells[index] = excelText(values[i]); });
  return cells.join('\t');
}

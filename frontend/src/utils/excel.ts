import type { ReceiptData } from '../types/receipt';

// 탭·개행을 정리하고 입력값의 엑셀 수식 실행을 방지한다.
export function excelText(value: string | number | null | undefined): string {
  const text = String(value ?? '').replace(/[\t\r\n]/g, ' ');
  return /^\s*[=+@-]/.test(text) ? "'" + text : text;
}

export function sectionOf(d: ReceiptData): 'dept' | 'project' { return d.section === 'project' ? 'project' : 'dept'; }

// 최소 검증: 일자·거래처가 있고 금액이 0보다 큰 정수.
export function isRowValid(d: ReceiptData): boolean {
  return !!d.date && !!d.merchant?.trim() && d.amount !== null && Number.isInteger(d.amount) && d.amount > 0;
}

// 열 순서: 일자 / 계정과목 / 비용 상세내역 / 거래처 / 금액 / 결제수단(프로젝트경비는 프로젝트번호)
type Raw = string | number | null | undefined;
function rawValues(d: ReceiptData): Raw[] {
  return [d.date, d.account, d.description, d.merchant, d.amount, d.section === 'project' ? d.project : d.payment];
}
function rowValues(d: ReceiptData): string[] { return rawValues(d).map(excelText); }

// 원본 양식 상세 행(월 탭 22~36·46~60행)의 병합 폭과 서식. 2026-11-02 양식 사본에서 읽은 값이다.
// B:C 일자, D:F 계정과목, G:O 비용 상세내역, P:R 거래처, S:U 금액, V:X 결제수단 → 합계 23열(B~X).
interface Column { span: number; first: number; align: 'left' | 'center' | 'right'; valign: 'bottom' | 'middle'; wrap?: boolean }
const COLUMNS: Column[] = [
  { span: 2, first: 0, align: 'center', valign: 'bottom' },
  { span: 3, first: 2, align: 'center', valign: 'bottom' },
  { span: 9, first: 5, align: 'left', valign: 'bottom', wrap: true },
  { span: 3, first: 14, align: 'center', valign: 'bottom' },
  { span: 3, first: 17, align: 'right', valign: 'bottom' },
  { span: 3, first: 20, align: 'left', valign: 'middle' }, // 결제수단은 사용자 요청으로 왼쪽 정렬
];
const TOTAL_COLUMNS = 23;
const FONT = 'font-family:Arial;font-size:9pt;color:#000000;background-color:#ffffff;';
const BORDER = 'border:1px solid #000000;';
const DATE_FORMAT = 'yyyy. M. d';
const AMOUNT_FORMAT = '#,##0;-#,##0';

export function rowTsv(d: ReceiptData, template: boolean): string {
  const values = rowValues(d);
  if (!template) return values.join('\t');
  // B~X 범위: 병합 셀의 첫 열 B/D/G/P/S/V에만 값을 배치한다.
  const cells = Array<string>(TOTAL_COLUMNS).fill('');
  COLUMNS.forEach((col, i) => { cells[col.first] = values[i]; });
  return cells.join('\t');
}

// 여러 행은 개행으로 이어 붙인다. 시트에 붙여넣으면 아래로 연속된 행에 들어간다.
export function rowsTsv(rows: ReceiptData[], template: boolean): string {
  return rows.map(d => rowTsv(d, template)).join('\n');
}

// ---- HTML 표 ----
// 탭 텍스트를 병합 셀 위에 붙여넣으면 시트가 병합을 풀고, 일반 HTML은 시트 서식을 덮어쓴다.
// 그래서 구글 시트가 자기 클립보드에 쓰는 형식(colspan + data-sheets-* 속성 + 인라인 서식)으로
// 병합 폭·글꼴·정렬·테두리·날짜·금액 형식을 원본 행과 같게 맞춰 보낸다.
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function dateParts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
// 시트 날짜 일련번호: 1899-12-30 기준 일수
function dateSerial(y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}
interface HtmlCell { text: string; value: string; format?: string }
function textCell(v: Raw): HtmlCell {
  const t = excelText(v);
  return { text: t, value: JSON.stringify({ 1: 2, 2: t }) };
}
function htmlCells(d: ReceiptData): HtmlCell[] {
  const [date, account, description, merchant, amount, last] = rawValues(d);
  const parts = typeof date === 'string' ? dateParts(date) : null;
  const dateCell: HtmlCell = parts
    ? { text: `${parts[0]}. ${parts[1]}. ${parts[2]}`, value: JSON.stringify({ 1: 3, 3: dateSerial(...parts) }), format: JSON.stringify({ 1: 5, 2: DATE_FORMAT, 3: 1 }) }
    : textCell(date);
  const amountCell: HtmlCell = typeof amount === 'number'
    ? { text: amount.toLocaleString('ko-KR'), value: JSON.stringify({ 1: 3, 3: amount }), format: JSON.stringify({ 1: 2, 2: AMOUNT_FORMAT, 3: 1 }) }
    : textCell(amount);
  return [dateCell, textCell(account), textCell(description), textCell(merchant), amountCell, textCell(last)];
}
export function rowsHtml(rows: ReceiptData[], template: boolean): string {
  const body = rows.map(d => '<tr>' + htmlCells(d).map((c, i) => {
    const col = COLUMNS[i];
    const style = FONT + (template ? BORDER : '') + `text-align:${col.align};vertical-align:${col.valign};white-space:${col.wrap ? 'normal' : 'nowrap'};`;
    const attrs = ` data-sheets-value="${esc(c.value)}"` + (c.format ? ` data-sheets-numberformat="${esc(c.format)}"` : '');
    return `<td${template ? ` colspan="${col.span}"` : ''} style="${style}"${attrs}>${esc(c.text)}</td>`;
  }).join('') + '</tr>').join('');
  return '<meta charset="utf-8"><google-sheets-html-origin>'
    + '<table cellspacing="0" cellpadding="0" dir="ltr" border="1" style="border-collapse:collapse;border:none;font-family:Arial;font-size:9pt;" data-sheets-root="1">'
    + '<tbody>' + body + '</tbody></table></google-sheets-html-origin>';
}

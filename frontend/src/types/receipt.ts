export interface ReceiptData {
  date: string | null; merchant: string | null; amount: number | null;
  account?: string; description?: string; payment?: string; project?: string; section?: 'dept' | 'project';
}
// 서버 응답 형태. docs/connection.md와 함께 관리한다.
export interface ReceiptResult { data: ReceiptData; engine: string; warnings: string[] }
// 목록에 추가한 행. 브라우저 메모리에만 존재한다.
export interface ExpenseRow extends ReceiptResult { id: string }

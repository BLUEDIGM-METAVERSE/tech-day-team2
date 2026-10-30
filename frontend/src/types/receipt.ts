export interface ReceiptResult {
  data: { date: string | null; merchant: string | null; amount: number | null;
    account?: string; description?: string; payment?: string; project?: string; section?: 'dept' | 'project' };
  engine: string; warnings: string[];
}

import type { ReceiptResult } from '../types/receipt';

// docs/connection.md의 기본 결과 계약. 값이 없으면 null이며 금액은 원 단위 정수다.
export function isReceiptResult(value: unknown): value is ReceiptResult {
  const result = value as ReceiptResult | null;
  const data = result?.data;
  if (!data || typeof data !== 'object') return false;
  return (data.date === null || typeof data.date === 'string')
    && (data.merchant === null || typeof data.merchant === 'string')
    && (data.amount === null || Number.isInteger(data.amount))
    && typeof result?.engine === 'string'
    && Array.isArray(result?.warnings) && result.warnings.every(w => typeof w === 'string');
}

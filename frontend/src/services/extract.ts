import type { ReceiptResult } from '../types/receipt';
// 초기 서버는 파일을 받지 않고 가짜 응답만 제공합니다.
export async function extractSample(): Promise<ReceiptResult> {
  const response = await fetch('/api/extract', { method: 'POST' });
  if (!response.ok) throw new Error('결과를 불러오지 못했습니다. 서버 연결을 확인하고 다시 시도해 주세요.');
  return response.json();
}

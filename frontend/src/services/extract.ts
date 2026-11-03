import type { ReceiptResult } from '../types/receipt';
import { BAD_RESPONSE, ApiError, requestJson } from './http';
import { isReceiptResult } from './receiptResult';

// 샘플 API용 임시 값. 실제 OCR의 타임아웃은 팀 합의 후 정한다.
const EXTRACT_TIMEOUT_MS = 30 * 1000;

// 초기 서버는 파일을 받지 않고 가짜 응답만 제공합니다.
export async function extractSample(): Promise<ReceiptResult> {
  const body = await requestJson<unknown>('/api/extract', { method: 'POST', signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS) });
  if (!isReceiptResult(body)) throw new ApiError(BAD_RESPONSE);
  return body;
}

import type { ReceiptResult } from '../types/receipt';
import { BAD_RESPONSE, ApiError, requestJson } from './http';
import { isReceiptResult } from './receiptResult';

const EXTRACT_TIMEOUT_MS = 30_000;
export type OcrMode = 'mock' | 'gemini';

export async function getOcrMode(signal: AbortSignal): Promise<OcrMode> {
  const health = await requestJson<{ status?: unknown; mode?: unknown }>('/api/health', { signal });
  if (health.status !== 'ok' || (health.mode !== 'mock' && health.mode !== 'gemini')) {
    throw new ApiError(BAD_RESPONSE);
  }
  return health.mode;
}

export async function extractReceipt(image?: string): Promise<ReceiptResult> {
  const signal = AbortSignal.timeout(EXTRACT_TIMEOUT_MS);
  const body = image ? await (await fetch(image, { signal })).blob() : undefined;
  const headers = body ? { 'Content-Type': body.type } : undefined;
  const result = await requestJson<unknown>('/api/extract', { method: 'POST', body, headers, signal });
  if (!isReceiptResult(result) || result.engine !== (body ? 'gemini' : 'mock')) {
    throw new ApiError('서버의 OCR 모드 또는 응답 형식이 바뀌었습니다. 새로고침 후 다시 시도해 주세요.');
  }
  return result;
}

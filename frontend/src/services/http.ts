// 서버 호출 공통 처리. 브라우저의 원문 오류 대신 사용자가 다음 행동을 알 수 있는 안내로 바꾼다.
// Vite proxy는 API 서버가 꺼져 있으면 본문 없는 500을 돌려주므로, 오류 본문이 없으면 통신 실패로 안내한다.
const UNREACHABLE = '서버와 통신하지 못했습니다. 서버 실행 상태를 확인하고 다시 시도해 주세요.';
const TIMED_OUT = '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.';
export const BAD_RESPONSE = '서버 응답 형식이 올바르지 않습니다. 잠시 후 다시 시도해 주세요.';

export class ApiError extends Error {
  status?: number;
  code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(path, init); }
  catch (e) { throw new ApiError((e as Error)?.name === 'TimeoutError' ? TIMED_OUT : UNREACHABLE); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(body?.error?.message ?? UNREACHABLE, response.status, body?.error?.code);
  if (body === null) throw new ApiError(BAD_RESPONSE, response.status);
  return body as T;
}

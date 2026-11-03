// ---- 서버와 추출 엔진의 연결 지점 ----
// 서버는 mode(/api/health에 표시)와 extract()(공통 결과 반환)만 사용한다. 실제 OCR도 같은 형태로 추가하면 서버의 경로 처리를 고치지 않고 교체할 수 있다.
// 이미지 입력·OCR 전용 오류는 합의 전이라 정하지 않았다. 지금 extract()가 예외를 던지면 서버는 500 INTERNAL_ERROR로 응답한다.
export const mockEngine = {
  mode: 'mock',
  async extract() {
    return { data: { date: '2026-10-29', merchant: '샘플상점', amount: 12000 }, engine: 'mock', warnings: ['개발용 가짜 결과입니다. 실제 OCR은 연결되지 않았습니다.'] };
  },
};

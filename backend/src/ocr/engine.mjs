// 모의 엔진은 Gemini와 같은 결과 계약을 사용하며 이미지 없이 실행할 수 있다.
export const mockEngine = {
  mode: 'mock',
  async extract() {
    console.info('[OCR][mock] 고정 샘플 반환 · 이미지 판독 없음');
    return { data: { date: '2026-10-29', merchant: '샘플상점', amount: 12000 }, engine: 'mock', warnings: ['개발용 가짜 결과입니다. 실제 OCR은 연결되지 않았습니다.'] };
  },
};

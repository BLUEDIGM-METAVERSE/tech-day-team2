# 연결 규칙 — 개발용 초안

프런트: 127.0.0.1:5173, 서버: 127.0.0.1:3001. Vite가 `/api`를 서버로 전달한다.

- `GET /api/health`: 상태와 mock 모드 반환.
- `POST /api/extract`: 현재 요청 본문 없이 고정 샘플 반환. 실제 OCR이 아니며 이미지를 전송하지 않는다.
- 응답: `{data:{date:string|null,merchant:string|null,amount:number|null},engine:string,warnings:string[]}`.
- 누락은 null, 날짜는 YYYY-MM-DD, 금액은 원 단위 정수. 오류는 `{error:{code,message}}`.
- 실제 multipart 이미지 전송, OCR 엔진, 추가 추출 필드·신뢰도, 오류 코드·타임아웃은 팀 합의 후 확장한다.
- 프런트 상태는 메모리에만 둔다. 로그·브라우저 스토리지·디스크에 영수증을 저장하지 않는다.

## 엑셀 출력

결과 화면은 원본 시안의 상세 열 순서를 따른다. `account`, `description`, `payment`, `project`, `section`은 사용자 편집용 선택 필드다. 원본 목록 연동 전까지 직접 입력하고 AI 추천값을 만들지 않는다.

6열 복사는 탭으로 구분한 값 한 행을 내보낸다. 원본 양식용 복사는 B~X의 23열을 만들고 B/D/G/P/S/V 위치만 채운다. 머리글·NO·합계는 제외한다. 문자열의 탭·개행을 정리하고 수식 시작 문자는 텍스트로 처리한다. 시트 API 쓰기는 없다.

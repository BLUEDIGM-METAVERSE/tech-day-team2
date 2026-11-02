# API·데이터 계약

기본 주소는 프런트 `127.0.0.1:5173`, API `127.0.0.1:3001`이다. 프런트는 `/api`를 호출하고 Vite 프록시가 API 서버로 전달한다.

## 샘플 추출

- `GET /api/health` → `200 {status:"ok",mode:"mock"}`.
- `POST /api/extract` → 요청 본문 없이 고정 샘플을 반환한다. 이미지를 전송하거나 OCR을 수행하지 않는다.
- 응답: `{data:{date:string|null,merchant:string|null,amount:number|null},engine:string,warnings:string[]}`.
- 날짜는 `YYYY-MM-DD`, 금액은 원 단위 정수다. 누락값은 `null`이며 금액을 0으로 대체하지 않는다.
- 오류: `{error:{code,message}}`. 등록되지 않은 경로는 `404 NOT_FOUND`다.

실제 OCR의 이미지 전송 방식·추가 필드·신뢰도·오류·타임아웃은 팀 합의 후 정한다.

## 폰 → PC 이미지 중계

서버 메모리에 사진을 대기시켰다가 PC로 전달하는 시제품이다. 호출 함수는 `frontend/src/services/relay.ts`에 있다.

### 방 생성과 연결

`POST /api/rooms` → `201`과 다음 필드를 반환한다.

| 필드 | 의미 |
| :-- | :-- |
| `code` | 표시용 6자리 코드 |
| `key` | 방 접근용 32자리 16진수 키 |
| `hosts` | PC의 외부 인터페이스 IPv4 주소 목록 |
| `expiresAt` | 유휴 만료와 최대 사용 시간 중 먼저 도달하는 시각 |
| `closesAt` | 생성 후 30분이 되는 종료 시각 |
| `maxLifeMinutes` / `idleMinutes` | 최대 사용 시간 30분 / 유휴 시간 10분 |

시각은 모두 epoch 밀리초다. PC는 `closesAt`으로 남은 시간을 표시한다.

폰 주소는 `<protocol>://<host>:<port>/?room=<code>&key=<key>`다. PC의 QR을 스캔해 접속하며 코드만 입력하는 기능은 없다. 기본 개발 서버는 로컬 접속만 허용하므로 LAN 실행이 필요하다([README](../README.md)).

### 방 API

아래 요청은 모두 `?key=<key>`가 필요하다. 코드·키가 틀리거나 방이 만료되면 `404 ROOM_NOT_FOUND`를 반환한다.

| 요청 | 성공 응답 | 용도 |
| :-- | :-- | :-- |
| `GET /api/rooms/:code` | `200 {ok:true,pending,expiresAt,closesAt}` | 연결 확인·대기 수 조회 |
| `DELETE /api/rooms/:code` | `200 {closed:true}` | 방 닫기 |
| `POST /api/rooms/:code/images` | `202 {pending}` | 사진 보내기 |
| `GET /api/rooms/:code/next` | `200 {image,pending,expiresAt,closesAt}` | 다음 사진 가져오기. 없으면 `image:null` |

이미지 요청 본문은 `Content-Type: text/plain`의 `data:image/(png|jpeg|webp);base64,...` 문자열이다. 폰 화면은 긴 변 최대 1600px, JPEG 품질 0.85로 변환해 보낸다.

- 본문 상한: 8MiB(8 × 1024 × 1024바이트). 초과하면 `413 BAD_IMAGE`.
- 형식 불일치·본문 읽기 실패: `400 BAD_IMAGE`.
- 방별 대기 사진 20장에 도달하면 추가 전송은 `429 QUEUE_FULL`.

PC는 2초마다 방을 조회한다. 선택한 이미지가 없고 처리 중이 아닐 때만 다음 사진을 가져온다. 서버는 응답할 사진을 큐에서 즉시 제거한다.

### 만료와 보관

- 방은 생성 후 30분 또는 마지막 유효한 방 요청 후 10분에 만료된다. PC의 주기적 조회도 활동으로 처리한다.
- PC가 만료 응답을 받으면 새 방을 만든다. 폰은 새 QR을 스캔해야 한다. **새 코드 받기**로도 방을 교체할 수 있다.
- 닫힌 코드는 6시간 재사용하지 않는다. 서버 재시작 시 기록은 사라지지만 새 키가 발급되므로 이전 QR은 사용할 수 없다.
- 요청 횟수 제한은 없다. 공개 배포 전 사용자 인증·접근 제한을 별도로 정한다.
- 이미지는 브라우저와 서버 메모리에만 둔다. 서버 큐는 사진 전달·방 만료 시 삭제하며, 폰에는 마지막 전송 사진의 미리보기가 남는다. 영수증을 디스크·로그·브라우저 저장소에 저장하지 않는다.

## 결과 편집과 엑셀 복사

`account`, `description`, `payment`, `project`, `section`은 사용자 편집용 선택 필드다. `section`은 `dept` 또는 `project`이며 생략하면 부서경비로 처리한다.

- `account`: 경비 구분별 계정과목 목록에서 선택.
- `payment`: 결제수단 목록에서 선택.
- `description`, `project`: 직접 입력.
- 목록은 `frontend/src/constants/accounts.ts`에서 관리하며 시트와 연동하지 않는다.

일자·거래처가 있고 금액이 0보다 큰 정수여야 목록 추가·복사가 가능하다. 현재 검증은 날짜 형식·실제 날짜 유효성이나 시트 드롭다운 허용값까지 검사하지 않는다. 목록 상한은 없으며 경비 구분별 15행 초과 시 경고한다.

### 복사 배치

복사 단위는 경비 구분별 목록 전체다. 행은 개행, 열은 탭으로 구분한다.

| 방식 | 열 배치 |
| :-- | :-- |
| 6열 | 일자 / 계정과목 / 비용 상세내역 / 거래처 / 금액 / 결제수단(프로젝트경비는 프로젝트번호) |
| 원본 양식용 | B~X의 23열 중 B/D/G/P/S/V에만 값 배치 |

머리글·NO·합계·엔진·경고는 제외한다. 텍스트 금액에는 쉼표·원 표시를 넣지 않는다. 문자열의 탭·개행은 공백으로 바꾸고, 공백 뒤 `=`, `+`, `@`, `-`로 시작하는 값에는 작은따옴표를 붙인다.

### HTML과 수동 복사

두 방식 모두 `text/plain`과 구글 시트용 `text/html`을 함께 복사한다. HTML은 `<google-sheets-html-origin>`, `data-sheets-value`, `data-sheets-numberformat`을 사용한다.

원본 양식용 HTML에는 다음 서식을 넣는다.

- 병합 폭: `colspan 2/3/9/3/3/3`.
- 글꼴·테두리: Arial 9pt, 검은 가는 테두리.
- 정렬: 일자·계정과목·거래처 가운데, 상세내역·마지막 열 왼쪽, 금액 오른쪽. 상세내역은 줄바꿈 허용.
- 일자: 날짜 일련번호와 `yyyy. M. d` 형식. 금액: 숫자와 `#,##0;-#,##0` 형식.

Clipboard API가 실패하거나 없으면 `copy` 이벤트와 `execCommand`로 재시도한다. 모두 실패하면 수동 복사용 텍스트를 제공한다. 수동 복사에는 HTML 병합·서식이 포함되지 않는다.

원본 양식은 부서경비 22~36행, 프로젝트경비 46~60행 중 첫 빈 행의 B열에서 Ctrl+V로 붙여넣는다. 병합·서식 호환성은 실제 양식 사본에서 확인해야 한다. 시트 API로 직접 쓰지는 않는다.

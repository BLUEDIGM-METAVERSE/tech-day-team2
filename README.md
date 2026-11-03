# 테크데이 2팀 · 영수증 OCR

영수증을 선택하고 결과를 확인·수정한 뒤 엑셀에 붙여넣는 React·Node.js 시제품입니다. 현재는 고정 샘플 결과를 사용하며, 실제 OCR·마스킹·사용자 인증·배포는 미구현입니다.

## 실행

Node.js 22.12 이상과 npm이 필요합니다. 저장소 루트에서 실행하세요.

```bash
npm ci
npm run dev
```

화면은 http://127.0.0.1:5173, API는 http://127.0.0.1:3001 입니다.

```bash
npm run check
npm run build
```

## 영수증 선택과 폰 촬영

- 마스킹한 JPG·PNG·WebP 샘플을 선택합니다. 긴 변이 1600px를 넘으면 브라우저에서 축소합니다.
- **샘플 결과 불러오기**는 이미지 분석 없이 고정 응답을 가져옵니다.
- PC 화면 상단의 QR을 폰으로 스캔하면 촬영 화면이 열립니다. 6자리 코드는 표시용이며, 연결에는 QR 주소의 `key`가 필요합니다.
- 폰 사진은 서버 메모리에서 대기합니다. PC에 선택한 이미지가 없고 처리 중이 아닐 때 가져오며, 가져온 사진은 서버 큐에서 삭제합니다.
- 새로고침하면 해당 화면의 이미지·결과가 사라집니다. 서버에 대기 중인 사진은 방이 만료될 때까지 남을 수 있습니다.

기본 실행은 PC 로컬 접속용입니다. 폰 연결을 시험하려면 같은 Wi-Fi에서 프런트를 LAN에 열어야 합니다. 터미널 두 개에서 각각 실행하세요.

```bash
npm run dev -w backend
```

```bash
npm exec -w frontend -- vite --host 0.0.0.0
```

API는 로컬 주소를 유지하고 Vite 프록시로 연결합니다. LAN 테스트 허용 여부는 팀 검토가 남아 있습니다.

## 결과 확인과 엑셀 복사

열 순서는 **일자 / 계정과목 / 비용 상세내역 / 거래처 / 금액 / 결제수단**입니다. 프로젝트경비의 마지막 열은 프로젝트번호입니다.

결과를 수정하고 **목록에 추가**하면 경비 구분별 목록에 들어갑니다. 새 행은 일자순 위치에 삽입하며, 기존 행은 수정·삭제하거나 ▲▼로 이동할 수 있습니다. 수동으로 바꾼 기존 순서는 유지합니다. 계정과목·결제수단은 제공된 목록에서 선택하고 프로젝트번호는 직접 입력합니다.

| 복사 방식 | 붙여넣는 위치와 내용 |
| :-- | :-- |
| 엑셀용 복사 (6열) | 빈 셀에 상세 값 6개를 여러 행으로 붙여넣기 |
| 원본 양식용 복사 (B~X) | 부서경비 22~36행, 프로젝트경비 46~60행 중 첫 빈 행의 B열에서 붙여넣기. B/D/G/P/S/V에 값 배치 |

- 복사 단위는 경비 구분별 목록 전체입니다. 머리글·NO·합계는 제외합니다.
- 일자·거래처와 0보다 큰 정수 금액이 있어야 목록 추가·복사가 가능합니다. 경비 구분별 15행을 넘으면 경고합니다.
- 원본 양식용 복사는 병합 폭과 서식을 담은 HTML도 함께 복사합니다. Ctrl+V로 붙여넣고, 실제 Excel·Google 시트 호환성은 양식 사본에서 확인하세요.
- 자동 복사가 실패하면 수동 복사용 텍스트를 제공합니다. 수동 복사는 병합·서식을 포함하지 않습니다.

화면 폭은 최대 1680px입니다. 1450px 이하에서는 업로드와 결과 확인 영역을 세로로 배치하며, 넓은 표는 가로로 스크롤합니다. 시트에 직접 쓰는 기능은 없습니다.

## 담당별 시작점

| 담당 | 주요 파일 |
| :-- | :-- |
| 업로드 | `frontend/src/components/UploadPanel.tsx`, `frontend/src/utils/image.ts` |
| 결과·엑셀 | `frontend/src/components/ResultPanel.tsx`, `frontend/src/components/ExpenseList.tsx`, `frontend/src/utils/excel.ts`, `frontend/src/utils/clipboard.ts` |
| 서버·연결 | `backend/src/server.mjs`, `backend/src/app.mjs`, `frontend/src/services/extract.ts`, `frontend/src/services/relay.ts`, `frontend/src/services/http.ts` |
| 폰 연결 화면 | `frontend/src/components/PhoneLink.tsx`, `frontend/src/components/PhoneCapture.tsx` |
| OCR·추출 | `backend/src/ocr/`, API 계약은 `docs/connection.md` |

공통 상태는 `frontend/src/App.tsx`, 타입은 `frontend/src/types/receipt.ts`에서 관리합니다.

`AGENTS.md`를 읽고 기능 브랜치에서 작업하며 팀원 1명 리뷰 후 병합합니다. 결정 사항은 `docs/decisions.md`, AI 활용은 `docs/ai-usage.md`에 기록합니다. 키·시트 주소·실제 영수증은 커밋하지 않습니다.

## 업무와 TODO

전체 분담·통합 순서는 [업무 종합](docs/TEAM_PLAN.md)을 참고하세요. 각 TODO는 실제로 확인한 항목만 체크합니다.

- [담당 1: 업로드](docs/TODO_01_UPLOAD.md)
- [담당 2: 결과·엑셀](docs/TODO_02_RESULT_EXCEL.md)
- [담당 3: 서버·연결](docs/TODO_03_SERVER.md)
- [담당 4: OCR·추출](docs/TODO_04_OCR.md)

## 업로드 안정화

파일 선택 취소 시 기존 선택을 유지하고, 준비 중 상태를 안내합니다. PC 이미지 준비 중에는 폰 수신을 대기하며 새 이미지로 교체된 이전 요청 결과를 표시하지 않습니다. PNG 미리보기와 폰 전송용 JPEG 변환을 모두 지원합니다.

테스트: `node --experimental-strip-types --test frontend/tests/image.test.mjs`

## 서버·연결 안정화

API 서버가 꺼져 있거나 오류를 반환하면 화면에 안내를 표시합니다. 선택한 이미지는 유지되므로 같은 버튼으로 다시 시도할 수 있습니다. 오류 코드와 안내 기준은 [연결 계약](docs/connection.md)을 참고하세요.

테스트: `npm test -w backend`, `node --experimental-strip-types --test frontend/tests/http.test.mjs`


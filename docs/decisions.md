# 결정과 확인 사항

## 현재 구성

사용자 요청에 따라 React + TypeScript(Vite), Node.js 개발용 서버, npm workspaces를 준비했다. 현재 개발 기준은 이 React·Node.js 구성이다.

## 미결정

실제 OCR 엔진·대체 경로, API 키 관리, 마스킹 방식, 인증, 배포, 이미지 요청 제한, 최종 JSON 계약. 외부 OCR은 미연결이며 키 입력 기능도 없다. 개발 서버는 로컬에만 바인딩한다. 인증 결정 전 공개 배포하지 않는다.

## HTML 시안 분석

`document/slack/index.html`은 CSS·DOM 조작과 기획 Markdown을 포함한 단일 HTML 시안이다. 로그인·연결·작업·완료 화면, 시트 재현, 마스킹·메일·인쇄 모달을 포함한다. 현재 범위에는 업로드, 미리보기, 결과 편집, 오류·경고 표시, 파란 강조색과 회색 카드 레이아웃을 활용했다.

시안의 localStorage 저장, Google 시트·메일 동작, 가짜 계정 정보는 이식하지 않았다. 규칙 문서의 현재 시제품 범위가 시안보다 우선한다. 원본 규칙 파일은 `document/slack/AGENT.md`였다. 현재 저장소 루트 `AGENTS.md`는 실제 구현 기준으로 재작성했으며 과거 규칙은 `docs/legacy/AGENTS-apps-script.md`에 보관한다.

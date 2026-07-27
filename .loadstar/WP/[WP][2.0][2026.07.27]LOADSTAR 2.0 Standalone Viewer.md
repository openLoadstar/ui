## [STATUS] S_IDL

### IDENTITY
- SUMMARY: LOADSTAR 2.0 기반 standalone md 탐색기/편집기 — Go + Wails

### GOAL
WP/DWP md 파일의 구조를 파악하고, 날짜·기능별·데이터 기준·키워드 등 다양한 관점으로 조회할 수 있는 크로스플랫폼(Windows/Linux) 데스크톱 앱을 만든다. 브라우저·서버 구동 없이 단일 실행 파일로 동작해야 한다.

G1. 구조 추출기 — md에서 결정론적 구조 정보를 뽑아 SQLite에 적재
G2. md+Mermaid 뷰어 — 텍스트 에디터처럼 편집, mermaid 다이어그램은 이미지처럼 표시
G3. 온디맨드 도메인 조회기 — WP/DWP 고유 슬롯(STATUS/TODO/ISSUE 등)을 조회 시점에 계산해 상태 기반 뷰 제공
G4. 탐색기 셸 — 메뉴바·툴바·GROUP 기반 좌측 트리·탭 관리로 구성된 앱 뼈대
G5. CLI 진입점 — 같은 실행 파일이 인자 없이는 GUI, 서브커맨드가 있으면 CLI로 동작

### CONNECTIONS
- CHILDREN:
  - [WP][2.0][2026.07.27]구조 추출기.md
  - [WP][2.0][2026.07.27]md Mermaid 뷰어.md
  - [WP][2.0][2026.07.27]온디맨드 도메인 조회기.md
  - [WP][2.0][2026.07.27]탐색기 셸.md
  - [WP][2.0][2026.07.27]CLI 진입점.md
- REFERENCE: []

### ATTACHMENTS
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/01.MASTER_GUIDE.md — 전체 컨셉
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/02.ELEMENT_FORMAT.md — 요소 공통 규칙
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/04.META_EXTRACTION.md — 파이프라인·DB 스키마 설계
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/05.CLI_SPEC.md — CLI 명령어 정의

### TODO
# TASK
- [ ] 하위 WP 5개(구조 추출기/뷰어/온디맨드 조회기/탐색기 셸/CLI 진입점) 순서대로 착수

### ISSUE
- AI 보강 단계(키워드·다각도 요약 생성)를 언제 착수할지 미정 — 구조 추출기 완료 후 별도 WP로 분리 예정, 지금은 범위 밖.
- Validator를 구조 추출기에 결합할지 독립 실행할지 미정 — `04.META_EXTRACTION.md §9`, 구조 추출기 WP 진행하면서 결정.
- 구조 추출기 트리거 방식(파일 변경 감지/주기 실행/git hook) 미정 — 구조 추출기 WP에서 결정.

### COMMENT
- 물리 저장 경로는 `SPEC 2.0/02.ELEMENT_FORMAT.md §8` 기준 `.loadstar/WP/`, `.loadstar/DWP/`, `.loadstar/GROUP/`.

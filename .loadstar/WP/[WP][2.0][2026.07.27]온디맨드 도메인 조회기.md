## [STATUS] S_IDL

### IDENTITY
- SUMMARY: WP/DWP 고유 슬롯(STATUS/TODO/ISSUE/ATTACHMENTS/TABLES)을 조회 시점에 md에서 직접 계산하는 조회기 — DB에 캐싱하지 않음

### GOAL
"구현 완료/진행중/이슈 있는" 같은 프로젝트 도메인 상태 뷰를 제공하되, 이 상태를 SQLite에 미리 저장해두지 않는다. 구조 추출기(nodes)에서 대상 file_path 목록을 뽑은 뒤, 이 조회기가 그 파일들을 그때그때 읽어 상태를 계산한다.

G4. AI가 세션 시작 시 SQLite를 거쳐 "지금 진행 중인 작업 파일이 무엇인가"를 파악할 수 있게 한다 — md 전체를 grep/순회하지 않고 이미 색인된 정보로 범위를 좁히는 것이 목표(`01.MASTER_GUIDE.md §6`).

### CONNECTIONS
- PARENT: [WP][2.0][2026.07.27]LOADSTAR 2.0 Standalone Viewer.md
- CHILDREN: []
- REFERENCE: []

### ATTACHMENTS
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/04.META_EXTRACTION.md — §7
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/appendix/WP.md — WP 고유 슬롯 정의
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/appendix/DWP.md — DWP 고유 슬롯 정의

### TODO
# TASK
- [ ] WP 파서 — STATUS, GOAL 존재 여부, TODO 총/완료 개수, RECURRING 개수, ISSUE 내용
- [ ] DWP 파서 — TABLES 구조, ATTACHMENTS
- [ ] "상태별 보기" 뷰 — nodes(format=WP) 목록을 이 조회기로 일괄 스캔해 STATUS별 그룹핑
- [ ] "이슈 있는 문서만 보기" 뷰
- [ ] 대량 스캔 성능 확인 — 파일 수백~수천 개 규모에서 체감 지연 없는지 점검
- [ ] **AI 세션 진입용 조회 기능** — "진행 중(S_PRG)인 WP 목록", "미완료 TODO가 있는 WP 목록"을 한 번에 반환하는 질의 정의 (G4)
- [ ] **AI가 이 조회기를 호출하는 인터페이스 정의** — CLI 서브커맨드로 노출할지, Wails 앱 내부 함수로만 둘지, 별도 프로토콜(MCP 등)로 노출할지 결정 필요

### ISSUE
- AI 세션 진입 시 이 조회기를 통해 미해결 ISSUE를 능동적으로 사람에게 확인받는 흐름은 아직 설계 전이다(`01.MASTER_GUIDE.md §4.1` 향후 과제). 이 WP의 후속 범위로 잡을지, 별도 WP로 뺄지 결정 필요.
- AI가 이 조회기를 호출하는 구체적 인터페이스 형태 미정(TODO 참조).

### COMMENT
- 이 조회기의 파서는 §7 스펙(appendix/WP.md, appendix/DWP.md)이 바뀌면 함께 갱신해야 함 — 구조 추출기(①)와 달리 FORMAT 고유 문법에 의존.

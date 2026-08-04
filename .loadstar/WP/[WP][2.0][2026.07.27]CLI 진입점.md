## [STATUS] S_PRG

### IDENTITY
- SUMMARY: `05.CLI_SPEC.md`에 정의된 서브커맨드를 구현하는 CLI 라우팅 계층 — GUI와 같은 실행 파일을 공유

### GOAL
실행 파일이 인자 없이 실행되면 GUI(탐색기 셸)를 띄우고, 서브커맨드가 주어지면 해당 CLI 동작을 수행하고 종료한다. CLI 명령은 구조 추출기·온디맨드 도메인 조회기·Validator를 그대로 호출하는 얇은 라우팅 계층이며, 별도 로직을 새로 만들지 않는다.

### CONNECTIONS
- PARENT: [WP][2.0][2026.07.27]LOADSTAR 2.0 Standalone Viewer.md
- CHILDREN: []
- REFERENCE:
  - [WP][2.0][2026.07.27]구조 추출기.md
  - [WP][2.0][2026.07.27]온디맨드 도메인 조회기.md

### ATTACHMENTS
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/05.CLI_SPEC.md — 명령어 정의 원본

### TODO
# TASK
- [x] 2026-08-04 인자 파싱/라우팅 — 인자 없음=GUI 실행, 서브커맨드 있음=해당 CLI 동작 실행 후 종료(`main.go`, `cli.go`)
- [x] 2026-08-04 `loadstar create <FORMAT> "이름"` — 파일명 생성, 동명 충돌 확인, 부록 템플릿 스캐폴딩(`cli.go: cmdCreate`)
- [ ] `loadstar todo [all|standby|active|done]` — 온디맨드 도메인 조회기 호출. 서브커맨드로는 인식하되 미구현 안내만 출력하도록 임시 등록해둠(`cli.go`) — 온디맨드 도메인 조회기 WP 완료 후 실제 연결
- [ ] `loadstar show` — STATUS별/이슈 현황 요약. 위와 동일하게 임시 등록만 됨 — 온디맨드 도메인 조회기 WP 대기
- [ ] `loadstar issues` — 프로젝트 전체 ISSUE 나열. 위와 동일 — 온디맨드 도메인 조회기 WP 대기
- [ ] `loadstar validate` — Validator 실행. 위와 동일 — Validator 모듈(구조 추출기 WP에서 결합 방식 결정) 대기
- [ ] `loadstar reindex` — 구조 추출기 수동 실행. 위와 동일 — 구조 추출기 WP 대기

### ISSUE
- Validator가 구조 추출기에 결합될지 독립 모듈일지에 따라 `validate`/`reindex`의 내부 호출 방식이 달라짐 — 구조 추출기 WP의 결정을 따른다.
- `todo`/`show`/`issues`/`validate`/`reindex` 5개는 의도적으로 미구현 상태로 남겨둠(WP GOAL "별도 로직을 새로 만들지 않는다" 원칙 유지) — 각각이 의존하는 WP(온디맨드 도메인 조회기, 구조 추출기)가 완료된 뒤 실제 로직을 연결해야 함.

### COMMENT
(없음)

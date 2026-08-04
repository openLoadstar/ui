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
- [x] 2026-08-04 `loadstar show` — STATUS별 분포 + ISSUE 있는 문서 요약. 테스트를 위해 예외적으로 먼저 구현(`cli.go: cmdShow`) — md를 직접 스캔하는 임시 로직이라 온디맨드 도메인 조회기 WP 완료 후 그쪽 호출로 교체해야 함(ISSUE 참조)
- [ ] `loadstar issues` — 프로젝트 전체 ISSUE 나열. 위와 동일 — 온디맨드 도메인 조회기 WP 대기
- [ ] `loadstar validate` — Validator 실행. 위와 동일 — Validator 모듈(구조 추출기 WP에서 결합 방식 결정) 대기
- [ ] `loadstar reindex` — 구조 추출기 수동 실행. 위와 동일 — 구조 추출기 WP 대기

### ISSUE
- Validator가 구조 추출기에 결합될지 독립 모듈일지에 따라 `validate`/`reindex`의 내부 호출 방식이 달라짐 — 구조 추출기 WP의 결정을 따른다.
- `todo`/`issues`/`validate`/`reindex` 4개는 의도적으로 미구현 상태로 남겨둠(WP GOAL "별도 로직을 새로 만들지 않는다" 원칙 유지) — 각각이 의존하는 WP(온디맨드 도메인 조회기, 구조 추출기)가 완료된 뒤 실제 로직을 연결해야 함.
- `show`는 테스트 목적으로 예외적으로 먼저 구현했음 — WP GOAL 원칙에서 벗어난 임시 로직(md 직접 스캔)이라는 점을 명시적으로 남김. 온디맨드 도메인 조회기 WP 완료 시 `cmdShow`의 스캔 로직을 걷어내고 그 조회기 호출로 교체할 것.

### COMMENT
- **cmd.exe에서 CLI 출력이 아예 안 보이던 문제 (해결됨, 2026-08-04)**: `loadstar show`를 `cmd.exe`에서 직접 실행하면 아무것도 출력되지 않는다는 보고로 조사·해결. 진단용 로그(`GetStdHandle`/`GetFileType` 덤프)로 실측한 결과, 원인은 코드페이지가 아니라 **`GetStdHandle(STD_OUTPUT_HANDLE)`이 NULL(0x0)을 반환**하는 것 — Wails가 GUI 서브시스템으로 빌드하기 때문에(더블클릭 시 콘솔 안 뜨게 하려는 목적) `cmd.exe`가 이 실행 파일에 표준출력 핸들을 안 물려주는 경우가 있었음. PowerShell/Git Bash에서는 자식 프로세스 표준입출력을 파이프로 명시 연결해서 실행하므로 이 문제가 재현되지 않아 초기 진단이 어려웠음.
  - 조치: CLI 진입 시 표준출력 핸들이 NULL일 때만 `AttachConsole(ATTACH_PARENT_PROCESS)`로 부모 콘솔에 명시적으로 재연결 + `SetConsoleOutputCP(65001)`로 UTF-8 코드페이지 설정(한글 Windows 기본 949 코드페이지 대응)(`console_windows.go: fixConsoleOutput`, CLI 모드 진입 시 `main.go`에서 호출).
  - 핸들이 이미 유효한 경우(콘솔이든 파이프든)는 절대 건드리지 않음 — 처음엔 이 판단 없이 무조건 `AttachConsole`을 걸었다가 파이프 환경(Git Bash)에서 출력이 안 보이는 핸들로 새버리는 회귀를 냈던 적이 있어, NULL일 때만 개입하도록 좁혔음.
  - 사용자가 실제 `cmd.exe`에서 재현·확인 완료.

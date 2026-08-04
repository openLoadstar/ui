## [STATUS] S_IDL

### IDENTITY
- SUMMARY: 기존 v1(`loadstar_cli`) 프로젝트의 `.loadstar/MAP`, `.loadstar/WAYPOINT` 데이터를 v2 스펙(`.loadstar/WP`, `.loadstar/DWP`, `.loadstar/GROUP`)으로 옮기는 변환 작업

### GOAL
v1(`loadstar_cli`)은 `M://root/cli` → `.loadstar/MAP/root.cli.md`, `W://root/cli/cmd_show` → `.loadstar/WAYPOINT/root.cli.cmd_show.md` 같은 주소 기반 점(.) 표기 파일명을 쓰고, CLI 로그(`.loadstar/.clionly/LOG`)로 이력을 관리했다. v2는 `[FORMAT][VER][DATE]이름.md` 명명, git만을 이력의 단일 출처로 삼고(`01.MASTER_GUIDE.md §5`), Map은 GROUP으로 대체되면서 멤버십 방향이 반대로 바뀌었다(GROUP만 멤버를 앎, `appendix/GROUP.md`). 이 WP는 실제 v1 프로젝트(`loadstar_cli`, `loadstar_mcp`)의 기존 데이터를 이 v2 규칙에 맞게 변환하는 작업을 다룬다.

### CONNECTIONS
- PARENT: [WP][2.0][2026.07.27]LOADSTAR 2.0 Standalone Viewer.md
- CHILDREN: []
- REFERENCE: []

### ATTACHMENTS
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/01.MASTER_GUIDE.md — Tolerable Consistency, 이력 관리 방침
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/02.ELEMENT_FORMAT.md — v2 명명 규칙
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/appendix/GROUP.md — Map → GROUP 대체, 멤버십 방향 반전
- file:///C:/bono/MCP/GIT/loadstar_cli/CLAUDE.md — v1 주소 체계·디렉토리 구조 참고

### TODO
# TASK
- [ ] v1 MAP/WAYPOINT 파일 실물 스키마 조사 (IDENTITY/CONNECTIONS/TODO/ISSUE 필드가 v2 WP.md 포맷과 얼마나 다른지 확인)
- [ ] 파일명 변환 규칙 정의: 점 표기 주소(`root.cli.cmd_show`) → `[WP][2.0][YYYY.MM.DD]이름.md`
- [ ] Map → GROUP 변환 규칙 정의: v1은 WAYPOINT가 소속 Map을 스스로 기술했을 가능성이 있음(주소 계층 `root/cli/cmd_show`) — v2는 반대 방향(GROUP만 멤버를 앎)이라 단순 필드 복사가 아니라 방향을 뒤집는 변환이 필요
- [ ] `.clionly/LOG` 이력을 git 커밋 이력으로 갈음할지, 아예 버릴지 결정 (v2는 git만 이력의 단일 출처)
- [ ] 변환 스크립트 또는 수작업 절차 결정 — 구조 추출기 완료 후에는 변환 후 바로 재색인해서 검증 가능
- [ ] 변환 대상 프로젝트 확정 (`loadstar_cli`, `loadstar_mcp` 중 실제로 v2로 옮길 데이터가 있는지 확인)

### ISSUE
- v1 WAYPOINT가 소속 Map을 스스로 기술했는지(v2와 반대 방향인지) 아직 실물 데이터로 확인 안 함 — 조사 필요 항목의 첫 번째.
- 구조 추출기가 없는 지금은 변환 결과를 자동 검증할 수 없음 — 구조 추출기 WP 완료 후 착수하는 게 나을 수 있음.

### COMMENT
(없음)

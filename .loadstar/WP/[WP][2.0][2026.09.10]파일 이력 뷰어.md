## [STATUS] S_STB

### IDENTITY
- SUMMARY: 뷰어 탭에서 열린 파일의 git 커밋 이력을 콤보박스로 고르고, 그 시점 내용을 읽기 전용으로 렌더링하는 기능

### GOAL
지금 뷰어는 항상 작업 트리의 현재 내용만 보여준다. 같은 탭 안에서 "이 문서가 예전에 어땠는지"를 확인할 수 있게 한다 — 별도 diff 도구/외부 git 클라이언트 없이, 버전 선택 → 그 시점 md 렌더링까지가 범위다. diff(변경분 대조) 표시는 이 WP 범위 밖.

### CONNECTIONS
- PARENT: [WP][2.0][2026.07.27]탐색기 셸.md
- CHILDREN: []
- REFERENCE:
  - [WP][2.0][2026.07.27]md viewer with mermaid.md

### TODO
# TASK
- [x] 2026-09-10 Go — `git.go`: `App.GitFileHistory(relPath)` (커밋 목록 + 작업 트리 dirty 여부 + 불가 사유), `App.GitFileAtCommit(repoRelPath, hash)` (그 시점 원문)
- [x] 2026-09-10 Go — `git` 미설치/비-git 프로젝트/미추적 파일을 오류가 아니라 `GitHistory.Reason`으로 내려 UI가 조용히 비활성화되게 처리
- [x] 2026-09-10 Go — Windows에서 `exec.Command("git", …)` 실행 시 콘솔 창이 깜빡이지 않도록 `CREATE_NO_WINDOW`(`git_windows.go`/`git_other.go` 빌드 태그 분리, `console_windows.go` 선례와 동일)
- [x] 2026-09-10 프론트 — `fs.ts` 브릿지 + 브라우저 미리보기용 목업(이력 없음으로 축약)
- [x] 2026-09-10 프론트 — `historySelect.ts`: 뷰어 툴바의 버전 콤보박스(첫 항목 "현재 (작업 중)", 이하 `YYYY-MM-DD 단축해시 제목`)
- [x] 2026-09-10 프론트 — `tabs.ts`: `Tab.viewingHash`/`historyContent` 추가, 과거 버전 선택 시 읽기 전용 배지 + 편집/저장 비활성화, `refreshAll`이 과거 버전 탭을 덮어쓰지 않게
- [x] 2026-09-10 프론트 — 이력 조회는 탭 렌더를 막지 않도록 지연 로드(로드 완료 후 콤보박스만 갱신)

### ISSUE
- `git log --follow`로 리네임을 추적하되, 커밋별 경로가 다르므로 `--name-only`로 그 시점 경로를 같이 받아 `GitCommit.Path`에 담는다 — `git show <hash>:<현재경로>`만 쓰면 리네임 이전 커밋에서 실패한다. `.loadstar` 요소는 이름변경(`RenameFile`)·삭제(`.del` 덧붙이기)가 전부 rename이라 이 경로가 자주 발생한다.
- 요소 파일명(`[WP][2.0][…]…`)의 대괄호는 git pathspec에서 글롭 문자로 해석된다 — pathspec에 `:(literal)` 매직 프리픽스 필수. 한글 파일명이 `\xxx`로 이스케이프되지 않도록 `-c core.quotepath=false`도 필요.
- 저장소 루트가 프로젝트 루트보다 위일 수 있다(`rev-parse --show-toplevel`). `GitFileAtCommit`의 경로는 저장소 루트 기준이므로, 해석 결과가 프로젝트 루트 밖이면 거부해야 `ReadFile`의 경로 격리(`resolveProjectPath`)가 우회되지 않는다.
- 외부 파일 탭(`Tab.external`, 프로젝트 밖 절대경로)은 이력 대상에서 제외한다 — 어느 저장소 소속인지 보장할 수 없다.
- 과거 버전 콘텐츠는 파일로 존재하지 않으므로 검색 뷰(`[WP][2.0][2026.09.10]검색.md`)의 전체 검색 대상이 아니다.

### COMMENT
- 커밋 목록은 `-n 200`으로 자른다 — 이력이 긴 파일에서 콤보박스가 무한정 길어지는 것 방지.

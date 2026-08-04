## [STATUS] S_PRG

### IDENTITY
- SUMMARY: 메뉴바·툴바·GROUP 기반 좌측 트리·탭 관리로 구성된 탐색기 형태의 앱 셸

### GOAL
탐색기 형태의 UI를 만든다 — 좌측은 GROUP 계층 기반 파일 목록 트리, 우측은 탭으로 관리되는 콘텐츠 영역(기본은 md+Mermaid 뷰어), 상단에 메뉴바와 툴바를 둔다. 이 WP는 앱의 뼈대(내비게이션·창 구조)만 다루고, 개별 탭 안에서 md를 실제로 렌더링/편집하는 로직은 다루지 않는다(→ md Mermaid 뷰어 WP).

### CONNECTIONS
- PARENT: [WP][2.0][2026.07.27]LOADSTAR 2.0 Standalone Viewer.md
- CHILDREN: []
- REFERENCE: [WP][2.0][2026.07.27]md Mermaid 뷰어.md

### ATTACHMENTS
- https://wails.io — Wails 설치·프로젝트 구조 문서
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/appendix/GROUP.md — 좌측 트리가 따라야 할 GROUP 구조

### TODO
# TASK
- [ ] Wails CLI 설치 (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`) 및 로컬 빌드 환경 확인(Go, 플랫폼별 webview 런타임)
- [ ] `wails init`으로 프로젝트 초기화, Go 모듈/webview 기본 셸 구성
- [x] 메뉴바 — 파일 > 탐색(외부 .md 파일 열기), 파일 > 프로젝트 열기
- [ ] 메뉴바 — 편집/보기 메뉴 (현재 플레이스홀더)
- [ ] 툴바 — 자주 쓰는 액션(새 WP/DWP/GROUP 생성, reindex 등)
- [x] 좌측 트리 — GROUP.ITEMS를 재귀 조회해 그룹 계층 렌더링 (`frontend/src/projectTree.ts` — 구조 추출기의 SQLite 대신, 매번 `.loadstar/GROUP` 전체를 읽어 즉석 구성하는 임시 대역. `04.META_EXTRACTION.md §6.2`의 `GROUP_ITEM` 엣지 조회는 구조 추출기 완료 후 이 경로를 대체)
- [x] 좌측 트리 — 어떤 GROUP에도 속하지 않은 WP/DWP/OTHER는 별도 섹션 없이 트리 루트에 그대로 표시 (`appendix/GROUP.md`에 명시된 트레이드오프 대응)
- [ ] 탭 관리 — 파일 열기/닫기/전환, 탭 하나당 뷰어 인스턴스 하나
- [x] 시작 화면 — 프로젝트(홈 디렉토리) 선택 화면(최근 프로젝트 목록 + 폴더 찾아보기), `App.OpenProject`
- [x] 좌측 트리 상단 — 업데이트 버튼 + 마지막 업데이트 시각. 클릭 시 트리 재구성(`buildProjectTree`) + 열린 탭 재조회(`TabManager.refreshAll`, dirty 탭은 덮어쓰지 않고 건너뜀). 그룹 편집기에서 변경이 있을 때도 같은 경로로 자동 갱신됨
- [x] 탭 오버플로우 — 탭이 넘칠 때 네이티브 가로 스크롤바 대신 좌우 ‹›버튼(넘칠 때만 노출, 끝에서 비활성화). 활성 탭이 화면 밖이면 자동으로 스크롤해 보여줌
- [x] 2026-08-04 좌측 트리 WP 항목에 STATUS 색상 점 표시 + 툴바 우측 상태 필터 체크박스(대기/진행중/종료/검토/제외 5개, 초기 전체 선택). S_ERR은 별도 체크박스 없이 검토(S_REV)와 같은 색으로 합쳐서 취급. 체크 해제 시 해당 상태의 WP를 트리에서 숨김(GROUP/DWP/OTHER 노드와 STATUS 없는 WP는 필터 영향 없이 항상 표시) — `frontend/src/wpStatus.ts`(라벨·색상·파싱), `projectTree.ts`(WP 경로별 STATUS 조회 후 부착), `tree.ts`(점 렌더링 + `filterTreeByStatus`)

### ISSUE
(없음)

### COMMENT (탭 오버플로우 관련 추가)
- `.tab-scroll`에 CSS `scroll-behavior: smooth`를 걸어뒀더니 `scrollLeft` 대입/`scrollBy`/`wheel` 이벤트로 스크롤 위치를 바꿔도 전혀 반영되지 않는 문제를 겪음(브라우저 프리뷰로 재현·격리 확인 — 최소 재현 테스트에선 문제없다가, 실제 앱 DOM에 `scroll-behavior:smooth`를 얹은 클론에서만 재현됨). 원인 특정은 못 했지만(WebView 환경별 스크롤 스로틀링 추정), CSS 레벨 smooth를 빼고 필요할 때만 JS `scrollBy()` 호출에서 개별적으로 다루는 쪽으로 우회함 — 지금은 버튼 클릭 시 즉시 이동(애니메이션 없음)으로 처리, 버튼 활성/비활성 상태도 애니메이션 타이밍에 기대지 않고 스크롤 직후 바로 갱신하도록 함.

### COMMENT
- 사용자 데이터(최근 프로젝트/최근 탐색 파일 히스토리, 디버그 로그)는 exe 옆이 아니라 `%AppData%\loadstar\`(`os.UserConfigDir()`)에 둠 — exe는 Program Files 등 쓰기 권한이 없는 곳에 있을 수 있고, 이 데이터는 특정 프로젝트나 특정 exe 사본이 아니라 사용자에게 속하는 정보라 exe 재빌드/이동, 프로젝트 전환과 무관하게 유지돼야 함.
  - `%AppData%\loadstar\recent_projects.json` — 프로젝트 열기 히스토리 (`App.GetRecentProjects`/`OpenProject`)
  - `%AppData%\loadstar\recent_files.json` — 파일 > 탐색 히스토리 (`App.GetRecentFiles`/`AddRecentFile`)
  - `%AppData%\loadstar\loadstar-debug.log` — 디버그 로그 (기존엔 프로젝트 루트에 있었으나, 앱 시작 시점엔 아직 프로젝트가 안 열려 있어 이쪽으로 이동)
- `App.projectRoot`는 이제 시작 시 자동 추정하지 않음 — `OpenProject`가 `.loadstar` 존재를 검증한 뒤에만 설정. `resolveProjectRoot()`는 폴더 다이얼로그의 기본 시작 위치 힌트로만 남음.

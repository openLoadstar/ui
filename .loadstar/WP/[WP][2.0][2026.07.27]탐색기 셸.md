## [STATUS] S_IDL

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
- [ ] 메뉴바 — 기본 메뉴(파일 열기/새로 만들기/종료 등)
- [ ] 툴바 — 자주 쓰는 액션(새 WP/DWP/GROUP 생성, reindex 등)
- [ ] 좌측 트리 — GROUP.ITEMS(edges의 `GROUP_ITEM`, `04.META_EXTRACTION.md §6.2`)를 재귀 조회해 그룹 계층 렌더링
- [ ] 좌측 트리 — 어떤 GROUP에도 속하지 않은 WP/DWP는 별도 섹션 없이 트리 루트에 그대로 표시 (`appendix/GROUP.md`에 명시된 트레이드오프 대응)
- [ ] 탭 관리 — 파일 열기/닫기/전환, 탭 하나당 뷰어 인스턴스 하나

### ISSUE
(없음)

### COMMENT
(없음)

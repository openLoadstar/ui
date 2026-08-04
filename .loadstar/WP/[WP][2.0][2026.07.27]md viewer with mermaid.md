## [STATUS] S_IDL

### IDENTITY
- SUMMARY: Wails 웹뷰 안에서 md를 렌더링(텍스트 에디터 형태 편집 포함)하고 Mermaid 다이어그램을 표시하는 뷰어

### GOAL
mermaid가 포함된 md 파일을 이미지 형태로 잘 표시하는 것이 핵심 목표다. 다이어그램 렌더링 로직을 직접 구현하지 않고 mermaid.js를 그대로 활용한다. 수정은 일반 텍스트 에디터처럼 동작하고, 저장 시 해당 md가 관련 FORMAT 부록(appendix) 문법에 맞는지 정도만 가볍게 검사한다.

### CONNECTIONS
- PARENT: [WP][2.0][2026.07.27]LOADSTAR 2.0 Standalone Viewer.md
- CHILDREN: []
- REFERENCE: []

### ATTACHMENTS
- https://wails.io — Wails 프레임워크
- https://github.com/wailsapp/awesome-wails — 참고 앱 예제 모음

### TODO
# TASK
- [ ] md → HTML 렌더링 (markdown-it 등) 프론트엔드 통합
- [ ] ```mermaid 코드블록을 `<pre class="mermaid">`로 감싸는 렌더러 규칙 추가
- [ ] mermaid.js 로드 + `mermaid.run()` 연동
- [ ] 텍스트 에디터 모드(원본 md 직접 편집) 구현
- [ ] 저장 시 경량 문법 검사 — 대상 FORMAT의 appendix 스펙(필수 섹션 존재 여부 등) 기준
- [ ] 파일 트리/목록에서 뷰어로 md 여는 흐름 연결 (구조 추출기의 nodes.file_path 활용)

### ISSUE
(없음)

### COMMENT
- 네이티브 GUI 툴킷이 아니라 webview 기반이라 mermaid.js를 별도 변환 없이 그대로 쓸 수 있음 — 다이어그램 렌더링을 직접 구현할 필요 없음.

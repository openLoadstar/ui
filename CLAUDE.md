# LOADSTAR UI — Claude Agent 운영 규칙

이 저장소는 LOADSTAR SPEC 2.0을 따르는 **탐색기 겸 편집기**다. 프로젝트 자신의
메타도 `.loadstar/` 아래 SPEC 2.0 형식으로 들고 있다 — 도구가 스스로를 관리한다.

## 세션 시작 절차

1. 이 파일을 읽는다.
2. `.loadstar/WP/` 에서 `## [STATUS] S_PRG` 인 WayPoint를 보면 지금 무엇이
   진행 중인지 알 수 있다. SPEC 원문은 `C:\bono\MCP\GIT\loadstar_SPEC\SPEC 2.0\`.

---

## 프로젝트 개요

- **스택**: Wails v2 + Go (데스크톱 앱) / TypeScript + Vite (프론트엔드, UI 프레임워크 없음)
- **주요 라이브러리**: markdown-it, Mermaid 11, modernc.org/sqlite(cgo 없음 — 단일 exe 유지)
- **저장소**: `C:\bono\MCP\GIT\loadstar_ui\`
- **빌드**: `wails build` → `build/bin/loadstar.exe`
- **개발 실행**: `wails dev`
- **프론트엔드만**: `cd frontend && npx tsc --noEmit -p tsconfig.json && npx vite build`
- **SPEC 문서**: `C:\bono\MCP\GIT\loadstar_SPEC\`

빌드 산출물은 GUI 앱이면서 CLI이기도 하다 — `loadstar create|show|reindex|validate|todo`
(`cli.go`). 인자 없이 실행하면 창이 뜬다.

---

## WayPoint 작업 규칙 (필수)

### 작업 전
1. 대상 WayPoint를 확인한다 (`.loadstar/WP/` 하위)
2. TODO에 작업 항목이 없으면 `- [ ] 작업 내용`을 추가한다
3. STATUS가 `S_IDL`이면 `S_PRG`로 변경한다

### 작업 후
1. 완료된 TODO 항목을 `- [x] YYYY-MM-DD 작업 내용`으로 체크한다
2. WP의 모든 TODO TASK 항목이 완료되면 STATUS를 `S_STB`로 변경한다
3. SUMMARY가 현재 기능과 다르면 갱신한다
4. 되풀이될 함정을 겪었으면 ISSUE에, 사용자와 정한 방향은 COMMENT에 남긴다
   — 둘 다 서술을 늘리지 말고 실제 심볼 이름을 적는다

### 원칙
- **항목 없이 코드 수정 금지** — 먼저 WayPoint에 "무엇을 할 것인가"를 기록
- 빠른 버그 수정의 경우 코드 수정 후 사후 등록도 허용
- Hook(`.claude/hooks/loadstar-drift-check.sh`)이 소스 편집 시 리마인드한다
  (`.md`·설정 파일은 대상에서 빠진다)

### STATUS 값
`S_IDL` 대기 · `S_PRG` 진행 중 · `S_STB` 완료·안정 · `S_ERR` 오류 ·
`S_REV` 검토 필요 · `S_OOS` 범위 제외. WayPoint(WP/DWP)에만 있다.

---

## 요소 파일 규칙

파일명이 곧 정체성이다 — `[FORMAT][VER][DATE]이름.md` (`02.ELEMENT_FORMAT.md`).
FORMAT은 `WP` / `DWP` / `GROUP` / `FLOW` / `OTHER`이고, 각자 같은 이름의 디렉토리에 산다.
md가 단일 출처이며 SQLite 색인은 언제든 다시 만들 수 있는 파생 캐시다.

1.0의 `M://` `W://` 주소 체계와 `MAP` 요소는 2.0에서 걷어냈다 — 참조는 파일명으로 한다.

---

## 디렉토리 구조

```
loadstar_ui/
├── *.go                   Wails 앱 + CLI (app.go, cli.go, extractor.go,
│                          flow.go, validate.go, search.go, git.go ...)
├── frontend/src/          TypeScript (프레임워크 없음)
├── docs/images/           README용 화면 캡처
├── .loadstar/
│   ├── WP/  DWP/  GROUP/  FLOW/  OTHER/
│   └── .cache/            index.db — 파생물, 커밋하지 않는다
└── .claude/
    ├── settings.json      Hook 설정
    ├── launch.json        미리보기용 dev 서버 정의
    └── hooks/             드리프트 리마인더
```

---

## 커밋

- **요청받았을 때만** commit / push 한다.
- 커밋 메시지는 영어. 무엇을 왜 바꿨는지를 쓰고, 변경 목록을 나열하지 않는다.
- 스테이징 전에 `git status`로 의도한 파일만 들어가는지 본다 — 사용자가 직접
  편집해 둔 파일이 섞여 있으면 먼저 묻는다.

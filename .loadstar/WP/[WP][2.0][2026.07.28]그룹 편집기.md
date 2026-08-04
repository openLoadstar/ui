## [STATUS] S_PRG

### IDENTITY
- SUMMARY: GROUP 파일의 CONNECTIONS.ITEMS(소속 WP/DWP/하위 GROUP)를 텍스트 편집이 아니라 목록 UI로 관리하는 편집기

### GOAL
GROUP은 자신의 ITEMS에 WP/DWP/하위 GROUP 파일명을 나열하는 방식으로 멤버십을 관리한다(`appendix/GROUP.md`) — WP/DWP는 자신이 어느 GROUP에 속하는지 전혀 모르는 단방향 구조라, 오직 GROUP 파일을 고쳐야만 편입·해제가 가능하다. 지금은 다른 WP/DWP와 마찬가지로 raw md 텍스트 편집만 가능한데, 파일명을 손으로 옮겨 적다 보면 오타로 조용히 트리에서 빠지는 실수가 나기 쉽다(`appendix/GROUP.md` §멤버십 방향에 이미 알려진 트레이드오프로 명시됨). 이 WP는 그 위험을 줄이는 전용 UI를 만든다 — 프로젝트 내 WP/DWP/GROUP을 검색해서 추가/제거하고, 저장 시 CONNECTIONS.ITEMS로 직렬화한다.

### CONNECTIONS
- PARENT: [WP][2.0][2026.07.27]LOADSTAR 2.0 Standalone Viewer.md
- CHILDREN: []
- REFERENCE:
  - [WP][2.0][2026.07.27]탐색기 셸.md
  - [WP][2.0][2026.07.27]md Mermaid 뷰어.md

### ATTACHMENTS
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/appendix/GROUP.md — ITEMS 슬롯·멤버십 방향 원칙
- https://github.com/openLoadstar/spec/blob/main/SPEC%202.0/appendix/OTHER.md — 이 WP 진행 중 신설된 FORMAT

### TODO
# TASK
- [x] 대화상자(모달)로 구현 — 좌측 GROUP 계층 트리 + 우측 선택된 GROUP의 멤버(WP/DWP/OTHER) 목록. 진입점: 편집 메뉴 > 그룹편집, 툴바 + GROUP (`frontend/src/groupEditor.ts`)
- [x] 좌측 트리 상단 `+ GROUP` — 선택된 GROUP이 있으면 그 하위로, 없으면 최상위로 생성. 동명 충돌 시 알림(`02.ELEMENT_FORMAT.md §5`)
- [x] GROUP 선택 시 우측에 ITEMS(WP/DWP/OTHER만 — 하위 GROUP은 좌측 트리로만 표현) 목록 표시
- [x] 우측 "+ 추가" — 현재 GROUP의 ITEMS에 없는 WP/DWP/OTHER 전체를 멀티 선택 후보로 표시(다른 GROUP에 이미 속해 있어도 후보에 포함 — 중복 소속 허용)
- [x] 항목별 제거(× 버튼) — 파일 삭제 아님, 이 GROUP의 ITEMS에서만 빼는 unlink
- [x] 저장 시 CONNECTIONS.ITEMS만 교체 직렬화, 나머지(IDENTITY/COMMENT)는 보존 (`frontend/src/groupFile.ts`)
- [ ] 어느 GROUP에도 없는 "미분류" WP/DWP를 편집기에서 후보로 보여줄지 결정 — 지금은 안 함 (구조 추출기 완료 후 재검토)
- [x] 좌측 트리 최상단에 "루트" 항목 추가 — 클릭하면 선택 해제 상태가 되어 `+ GROUP`으로 최상위 GROUP 생성 가능(트리 클릭만으로는 선택 해제할 방법이 없던 문제 해결)
- [x] GROUP 삭제 — 트리 행에 🗑 아이콘(호버 시 노출). 파일 실제 삭제 + 삭제된 GROUP을 참조하던 다른 GROUP들의 ITEMS에서도 정리. 하위 GROUP이 있으면 삭제 차단(먼저 하위부터 삭제하도록 안내), `confirm()`으로 확인
- [ ] GROUP 이름변경 — 이번 범위에서 제외, 별도 착수 필요
- [x] 대화상자 크기 조정(우하단 리사이즈 손잡이, 최소 560×360) + 위치 이동(헤더 드래그) — `frontend/src/dialogChrome.ts`, 다른 모달에도 재사용 가능

### ISSUE
- 미분류 WP 탐지는 전체 GROUP의 ITEMS를 다 훑어야 해서, 구조 추출기/온디맨드 조회기가 아직 없는 지금은 정확히 구현하기 어려움 — 두 WP 완료 후 재검토.
- GROUP 이름변경 미구현.
- GROUP 삭제 시 소속돼 있던 WP/DWP/OTHER 파일 자체는 건드리지 않음(의도적 — "미분류" 상태로 남는 것과 동일한 트레이드오프).

### COMMENT
- **OTHER FORMAT 신설**: 이 WP 진행 중 "어디에도 속하지 않는 md 파일"을 GROUP으로 조직화할 수 있어야 한다는 요구로 `appendix/OTHER.md`를 새로 만들고 `02.ELEMENT_FORMAT.md`(§1/§4/§6/§7/§8)에 반영함 — loadstar_ui만의 처리가 아니라 SPEC 정식 변경. OTHER는 `[FORMAT][VER][DATE]이름.md` 명명 규칙의 유일한 예외(자유 파일명), `.loadstar/OTHER/`에 있다는 물리적 위치만으로 식별. 참조 시엔 "구조화된 이름 패턴에 안 맞으면 OTHER"로 역추론.
- **GROUP 목록 조회는 구조 추출기의 임시 대역**: `App.ListFormatFiles(format)`(Go, 디렉토리 나열만) + `parseGroupItems`(TS, `groupFile.ts`)로 대화상자를 열 때마다 즉석에서 GROUP 계층을 재구성함. SQLite 인덱스 없이 매번 파일을 다시 읽고 파싱 — 구조 추출기 완료 시 이 경로를 그쪽으로 교체하는 게 자연스러움.
- **ITEMS 직렬화 형식**: WP의 CHILDREN과 동일한 관행을 따름 — 비어있으면 `- ITEMS: []`, 있으면 `- ITEMS:\n  - 항목1\n  - 항목2`. `groupFile.ts`의 파서는 정식 파서가 아니라 이 형태만 인식하고, 저장할 때 항상 이 정규형으로 다시 씀(손편집으로 형태가 어긋나면 빈 목록으로 취급).

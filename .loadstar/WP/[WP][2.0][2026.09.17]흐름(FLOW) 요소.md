## [STATUS] S_PRG

### IDENTITY
- SUMMARY: 업무·처리 흐름을 mermaid로 기술하고 각 노드를 WP/DWP/FLOW에 연결하는 새 FORMAT `FLOW`와 그 뷰어

### GOAL
전체 흐름을 한 장의 그림으로 보고, 필요한 단계만 하위 FLOW로 펼쳐 들어갈 수 있게 한다 — 단계 하나가 원자적 작업이거나 다른 흐름들의 합성이라는 점에서 함수형 언어의 합성 구조와 같은 모양이다.

`DIAGRAM`은 순수 mermaid로 두고(다른 뷰어에서도 그대로 그려진다), 노드와 요소의 연결은 코드블록 **밖**의 `REFERENCES`에 둔다 — 그래야 구조 추출기·검증기가 관계를 볼 수 있다.

이 WP의 이번 범위는 **0단계**: 스펙 부록 + `.loadstar/FLOW/` 인식까지. 이것만으로 기존 mermaid 렌더러가 흐름도를 그대로 그려주므로, 문법이 몸에 맞는지 실사용으로 먼저 확인한 뒤 1단계 이후를 착수한다.

### CONNECTIONS
- PARENT: [WP][2.0][2026.07.27]탐색기 셸.md
- CHILDREN: []
- REFERENCE:
  - [WP][2.0][2026.07.27]md viewer with mermaid.md
  - [WP][2.0][2026.07.27]구조 추출기.md

### TODO
# TASK
- [x] 2026-09-17 SPEC — `SPEC 2.0/appendix/FLOW.md` 신설(고유 슬롯 `DIAGRAM`/`REFERENCES`, 노드 팔레트 6종, 노드 id 규약)
- [x] 2026-09-17 SPEC — `02.ELEMENT_FORMAT.md` §7 요소 카탈로그·§8 물리 저장 경로에 FLOW 추가, SPEC 2.0 README(en/ko) 부록 표에 행 추가
- [x] 2026-09-17 Go — `validFormatDirs`(app.go), `elementFormats`+`scaffoldContent`(cli.go), `validFormats`(extractor.go), `ListAllFilesWithModTime`·`SearchInFiles` FORMAT 배열에 FLOW 추가
- [x] 2026-09-17 Go — 추출기 CONNECTIONS 파싱 대상(`case "WP", "DWP"`)에 FLOW 포함 — PARENT/REFERENCE만. 노드 단위 `REFERENCES` 적재는 3단계
- [x] 2026-09-17 프론트 — `ElementFormat`에 "FLOW" 추가 + 트리 아이콘(tree.ts), `buildProjectTree`·그룹 편집기 멤버 목록에 FLOW 포함
- [x] 2026-09-17 프론트 — 툴바 "+ FLOW" 버튼(`createAndOpenElement`), `validate.ts`에 FLOW 검사(공통 봉투 + `### DIAGRAM` 존재)
- [x] 2026-09-17 검증 — FLOW 파일을 실제로 하나 만들어 트리 표시·생성·검색·재색인·렌더까지 확인
- [x] 2026-09-17 (1단계) `REFERENCES` 파싱 → 렌더된 SVG 노드에 클릭 바인딩 → 대상 요소 탭 열기(`flowFile.ts` 파서, `flowView.ts` 위임 클릭, `tabs.ts: bindFlowNavigation`)
- [x] 2026-09-17 (E1) 그림 편집 모드 — FLOW 탭에 3모드(보기/그림 편집/텍스트 편집), 노드 선택 + 속성 패널에서 요소 연결·해제. `REFERENCES` 줄 하나만 수술(`setNodeRef`)해 나머지 원문은 그대로 두고, 연결 변경 시 mermaid를 다시 그리지 않는다(선택·스크롤 유지)
- [ ] (E2, 후속) 노드 추가(선택 노드 앞/뒤)·삭제·라벨 수정 — `DIAGRAM` 코드블록 줄 수술. 삽입 시 `a→b`를 `a→n, n→b`로 재배선, 삭제 시 통과 연결
- [ ] (E3, 후속) 간선 직접 편집, "이 노드를 새 FLOW로 빼내기"
- [ ] (후속) 노드가 많아졌을 때의 화면 대책 — 실사용 후 판단. 1차 해법은 `subflow`로 쪼개기, 부족하면 방향 전환(LR/TD)·강조·접기
- [ ] (2단계, 후속) subflow(`[[ ]]`) 펼침 — ⊕ 표시, 클릭 시 하위 FLOW로 이동
- [ ] (3단계, 후속) 검증·색인 — 깨진 참조, `REFERENCES`에만 있고 `DIAGRAM`에 없는 id, FLOW 순환. 추출기 `edges`에 `FLOW_STEP` 적재 → "이 WP가 어느 흐름에 쓰이나" 역조회
- [ ] (4단계, 후속) 팔레트 확장(map/filter/external) 여부를 실사용 후 결정

### ISSUE
- mermaid가 렌더한 SVG의 노드 element id는 원본 노드 id 그대로가 아니다(`flowchart-<id>-<n>` 형태로 관측됨). 1단계 클릭 바인딩은 이 패턴에 의존하므로 실측 후 구현하고, 패턴이 바뀌어도 그림 자체는 깨지지 않도록 바인딩 실패를 무해하게 처리한다.
- 노드 id는 영숫자로 제한한다 — `REFERENCES`의 키이자 SVG 매칭 키인데, 한글 id가 SVG id로 어떻게 변환되는지 보장이 약하다. 라벨은 자유.
- 구조 추출기는 `DIAGRAM` 코드블록 **안**을 읽지 않는다 — 간선 위상(a -> b)은 색인 대상이 아니다. 색인되는 것은 `CONNECTIONS`와 (3단계 이후) `REFERENCES`뿐이다.
- FLOW가 서로를 참조하면 무한 전개가 가능하다 — 2단계 펼침에 깊이 상한, 3단계 검증기에 순환 보고가 필요하다.
- 그림 편집에 **되돌리기가 없다** — 텍스트 편집의 브라우저 기본 undo에 해당하는 것이 구조 편집엔 없다. 저장 전이면 텍스트 편집 모드에서 원문을 확인할 수 있는 것이 현재의 안전망이고, E2(그림 구조 편집)에 들어가기 전에 최소 1단계 되돌리기가 필요하다.
- E2는 `DIAGRAM` 코드블록을 건드리므로, 지원 문법 밖의 구조(한 줄에 `a --> b --> c` 체인, `;` 다중 문장, `subgraph`)를 만나면 구조 편집을 잠그고 텍스트 편집으로 안내해야 한다. E1(REFERENCES만 수정)은 그림을 건드리지 않아 이 제약이 없다.
- 팔레트를 6종(step/branch/merge/subflow/store/terminal)으로 시작한다. map/filter/external은 실사용 전 확정하지 않는다 — 쓰이지 않는 요소를 스펙에 남기는 것이 2.0이 1.0에서 걷어낸 유형이다.

### COMMENT
**`DIAGRAM`을 LOADSTAR 문법이 아니라 mermaid 원문으로 둔 이유** (2026-09-17, 사용자 결정):

- 처음엔 `STEPS`/`FLOW` 전용 문법으로 쓰고 UI가 mermaid를 생성하는 안을 제시했으나, mermaid를 원본으로 쓰는 쪽으로 정해졌다. 도형이 곧 노드 종류를 나타내므로 팔레트를 표현하는 데 mermaid 문법이 그대로 쓸모 있고, GitHub 등 다른 md 뷰어에서도 그림이 그대로 나온다.
- 이 선택의 유일한 손실(흐름이 코드블록 안에 갇혀 추출기가 못 봄)은 `REFERENCES`를 코드블록 밖 정식 섹션으로 분리해 상쇄했다. 색인·검증에 필요한 것은 "어느 노드가 어느 요소인가"이지 간선 위상이 아니다.
- 노드 종류를 파일에 따로 선언하지 않는다 — mermaid 도형이 곧 종류라는 규약(부록의 팔레트 표)으로 충분하고, 선언을 두면 도형과 선언이 어긋날 수 있다.

**파서를 프론트에 둔 이유** (2026-09-17):
- 앞서 "파서는 Go 한 곳"으로 정리했지만, 그림 편집은 **저장 전 버퍼**를 그 자리에서 파싱해야 한다 — Go 바인딩은 디스크의 파일을 읽는 쪽이 자연스럽고, 매 상호작용마다 내용을 넘겨 왕복하면 브라우저 미리보기(목업 모드)에서 검증도 못 하게 된다.
- 대신 중복은 최소로 남는다: 구조 추출기가 나중에 필요로 하는 것은 `REFERENCES`뿐이고(간선 위상은 색인 대상이 아님), 그건 Go 쪽 15줄 남짓이라 `flowFile.ts` 전체의 복제가 아니다.

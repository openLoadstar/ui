<WAYPOINT>
## [ADDRESS] W://root/frontend/goal_report
## [STATUS] S_STB

### IDENTITY
- SUMMARY: Goals 보고서 화면 — Map부터 WayPoint까지 트리 형태로 나열하며 SUMMARY/GOAL/TODO를 함께 표시
- METADATA: [Priority: P2, Created: 2026-05-11]
- SYNCED_AT: 2026-05-11

### GOAL
프로젝트의 의도 계층(Map.GOAL → WP.GOAL → WP.TODO)을 한 화면에서 보고서 형식으로 조망하여, 기획·개발·검토 시 의도가 제대로 분해·구현되고 있는지를 쉽게 파악할 수 있게 한다.

### CONNECTIONS
- PARENT: M://root/frontend
- CHILDREN: []
- REFERENCE: [W://root/frontend/app_shell, W://root/backend/element_service]

### CODE_MAP
- scope:
  - frontend/src/features/goal-report/
  - frontend/src/features/app-shell/
  - backend/src/main/java/com/loadstar/explorer/service/
  - backend/src/main/java/com/loadstar/explorer/controller/
  - backend/src/main/java/com/loadstar/explorer/model/

### TODO
# TASK — Backend: GOAL 슬롯 인식
- [x] 2026-05-11 ElementParser.java — `### GOAL` 섹션 파싱(WP/Map 양쪽) + TODO TASK/RECURRING 항목 파싱 추가
- [x] 2026-05-11 MapData/WayPointData 모델에 goal 필드 추가, WayPointData에 todos 필드 추가
- [x] 2026-05-11 TodoItem 모델 신설 (done/recurring/text)
- [x] 2026-05-11 ElementService.TreeNodeDto에 goal/todos 추가, buildTreeNode가 채움. tree endpoint(`/api/elements/tree`)에 dwp는 SUMMARY만 포함 (트리 노출)

# TASK — Frontend: Goals 보고서 화면
- [x] 2026-05-11 features/goal-report/GoalReport.tsx 신설 — Map/WP/DWP 트리 렌더링
- [x] 2026-05-11 Toolbar에 "Goals" 진입점 (Target 아이콘) 추가
- [x] 2026-05-11 App.tsx Tab union, EditorTabs case + import 등록
- [x] 2026-05-11 GOAL 미보유 노드는 옅은 회색 "(미지정)" 표시, TODO TASK/RECURRING 구분 렌더
- [x] 2026-05-11 인쇄 친화적 단순 타이포그래피 + window.print() 버튼
- [x] 2026-05-11 vite proxy 추가(`/api → :8080`), client.ts baseURL을 `/api`로 통일 (dev에서 CORS 우회)

# TASK — 시범 데이터
- [x] 2026-05-11 M://root, M://root/frontend, W://root/frontend/{app_shell,map_view,dashboard}에 GOAL 시범 추가

# TASK — 검증
- [x] 2026-05-11 mvn compile 통과 (backend)
- [x] 2026-05-11 vite build 통과 (frontend)
- [x] 2026-05-11 dev server 기동 후 Goals 메뉴 진입, 트리/SUMMARY/GOAL(시범+미지정)/TODO 모두 렌더 확인
- [x] 2026-05-11 loadstar validate 통과 (36 waypoints, 5 maps)

# TASK — 사용성 보강 (2차)
- [x] 2026-05-11 WP별 TODO/RECURRING 영역을 +/- 토글로 펼침/닫힘. 기본 닫힘. 헤더에 진척률(완료/전체) 표시
- [x] 2026-05-11 `@media print`로 Toolbar/Tree/StatusBar 등 앱 셸 숨김. 보고서만 출력되도록 visibility 제어 + 닫힌 TODO도 print 시 자동 펼침(.goal-report-todo-body)
- [x] 2026-05-11 Markdown 다운로드 버튼 추가 — 트리를 마크다운 헤더/체크리스트로 직렬화 후 `goals-report-YYYY-MM-DD.md`로 다운로드
- [x] 2026-05-11 dev preview에서 토글 / print 스타일 등록 / md 출력 내용 모두 검증 완료

# TASK — 버그 수정 (3차)
- [x] 2026-05-11 TODO 토글 기본 닫힘 미작동 수정 — `{open && <div>}` 조건부 렌더를 `display: none/block` 인라인 스타일로 변경(DOM 항상 존재 → print CSS `display:block!important` 적용 가능)
- [x] 2026-05-11 PDF 인쇄 시 앱 전체 캡처 문제 수정 — `<style>` 인라인 삽입 대신 `useEffect`로 `document.head`에 주입, 인쇄 버튼은 새 창 열기(`window.open`) 방식으로 Goals 내용만 PDF 출력
- [x] 2026-05-11 `npx vite build` 통과 → dist 갱신 (port 8080 서빙 대응)

# TASK — MAP 필터 (4차)
- [x] 2026-05-18 MapSelectorDialog 공유 컴포넌트 사용 — Goals 진입 시 MAP 선택 팝업
- [x] 2026-05-18 선택된 MAP 기준으로 트리 노드 필터링 (fetchTree 결과에서 클라이언트 필터)
- [x] 2026-05-18 MAP 변경 버튼 상단 노출, 변경 시 필터 초기화 후 재표시

# RECURRING
- (R) 변경 후 mvn test 또는 spring-boot:run 기동 확인
- (R) 변경 후 npx vite build로 컴파일 검증
- (R) ESLint 경고 0개 유지

### ISSUE
- OPEN_QUESTIONS: []
- 본 WP는 Goals 보고서 화면 + 최소 backend GOAL 파싱까지. GOAL 편집(WayPointEditor에 GOAL 입력) 같은 CRUD는 후속 WP로 분리.

### COMMENT
- 사용자 결정 (2026-05-11):
  - 메뉴 이름: "Goals"
  - TODO 항목도 함께 표시
  - dwp는 SUMMARY 개요만 (예: "사용자 정보")
  - 시범 데이터 추가하여 화면이 비어 보이지 않도록
</WAYPOINT>

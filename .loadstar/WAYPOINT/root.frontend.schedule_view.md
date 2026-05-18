<WAYPOINT>
## [ADDRESS] W://root/frontend/schedule_view
## [STATUS] S_STB

### IDENTITY
- SUMMARY: 스케쥴 보조 툴 프론트엔드 — WBS(간트 형태) 색상바 뷰. 드래그로 시작/종료일 변경, 저장 버튼으로만 schedule.json에 영구화. 보조 툴이며 다른 모듈과 연동점 없음
- METADATA: [Ver: 1.0, Created: 2026-05-07]
- SYNCED_AT: 2026-05-07 18:00

### CONNECTIONS
- PARENT: M://root/frontend
- CHILDREN: []
- REFERENCE: [W://root/backend/schedule_service]

### CODE_MAP
- scope:
  - frontend/src/features/

### TODO
- [x] 2026-05-07 사이드바 신규 메뉴 "Schedule" 진입점 추가 (Toolbar + EditorTabs)
- [x] 2026-05-07 화면 진입 시 GET /api/schedule 1회 호출로 초기 로드 (파일 없으면 backend가 자동 생성)
- [x] 2026-05-07 시간축 입력 — 헤더 좌측에 시작일(date picker) + 기간(숫자, 30~365일) 배치
- [x] 2026-05-07 시간축 변경 시 확인 다이얼로그 — 기존 item의 start/end가 새 범위를 벗어나면 새 범위 안으로 자동 클램프
- [x] 2026-05-07 WP 정렬 — backend가 부여한 MAP 등장 순서대로 출력. 고아 WP는 맨 아래 별도 섹션
- [x] 2026-05-07 색상바 렌더링 (일 단위 grid 스냅) — 예정/진행/지연/완료/반복/고아 6분류
- [x] 2026-05-07 색상바 좌측 가장자리 드래그 → 시작일 변경 (시작일 ≤ 종료일, 최소 1일 강제)
- [x] 2026-05-07 색상바 우측 가장자리 드래그 → 종료일 변경
- [x] 2026-05-07 색상바 본체 드래그 → 시작·종료일 동시 평행 이동
- [x] 2026-05-07 schedule.json에 없는 WP의 default 기간 — 시작일 ~ 시작일+7일
- [x] 2026-05-07 고아 항목 클릭 시 즉시 삭제 (in-memory). 저장 버튼이 영구화 안전망
- [x] 2026-05-07 저장 버튼 — 화면에 보이는 모든 item + view(start_date, duration_days)를 PUT /api/schedule로 일괄 전송
- [x] 2026-05-07 Dirty 상태 표시 — 변경 발생 시 저장 버튼 강조 / 미저장 마커
- [x] 2026-05-07 페이지 이탈 시 미저장 변경분 있으면 `beforeunload` 경고
- [x] 2026-05-07 시간축이 길 때(특히 90일 이상) 일별 grid 라벨을 자동으로 주/월 단위로 추출하여 표기
- [x] 2026-05-07 다른 모듈(WP STATUS, TODO, LOG, GIT 등)에 변경을 전파하지 않음 — 확인
- [x] 2026-05-18 MapSelectorDialog 공유 컴포넌트 신설 — 체크박스 multi-select, 전체 선택 버튼, M://root 제외
- [x] 2026-05-18 Schedule 진입 시 항상 MapSelectorDialog 표시; schedule.json selectedMaps로 pre-populate, 없으면 전체 선택
- [x] 2026-05-18 MAP 선택 변경 시 기존 items 유지 + 새 MAP WP는 default 날짜로 추가 (변경 없으면 재저장 안 함)
- [x] 2026-05-18 schedule.json selectedMaps 필드(배열) 저장·복원, autoSave 시 포함
- (R) 변경 후 npx vite build로 컴파일 검증
- (R) ESLint 경고 0개 유지

### ISSUE
(없음)

### COMMENT
- "보조 툴" 의도 — schedule_view에서의 어떤 조작도 다른 WP/TODO/LOG에 영향을 주지 않는다.
</WAYPOINT>

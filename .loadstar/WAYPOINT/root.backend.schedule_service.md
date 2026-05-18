<WAYPOINT>
## [ADDRESS] W://root/backend/schedule_service
## [STATUS] S_STB

### IDENTITY
- SUMMARY: 스케쥴 보조 툴 백엔드 — schedule.json read/write API, WP 존재 여부·완료 여부 read-only 조회. 보조 툴이며 다른 모듈로 변경을 전파하지 않는다 (log_service 호출 없음)
- METADATA: [Ver: 1.0, Created: 2026-05-07]
- SYNCED_AT: 2026-05-07 18:00

### CONNECTIONS
- PARENT: M://root/backend
- CHILDREN: []
- REFERENCE: [W://root/backend/element_service]

### CODE_MAP
- scope:
  - backend/src/main/java/com/loadstar/explorer/service/
  - backend/src/main/java/com/loadstar/explorer/controller/

### TODO
- [x] 2026-05-07 schedule.json 파일 위치 정의 (`.loadstar/SCHEDULE/schedule.json`)
- [x] 2026-05-07 파일 부재 시 첫 GET 진입에서 자동 생성 (빈 view + 빈 items)
- [x] 2026-05-07 GET /api/schedule — view(start_date, duration_days) + items(주소→{start,end}) + 각 항목에 exists / completed / recurring_only 플래그를 함께 반환
- [x] 2026-05-07 PUT /api/schedule — 요청 본문(view + 화면에 보이는 모든 items)을 그대로 schedule.json으로 덮어쓰기
- [x] 2026-05-07 WP 존재 여부 — ElementParser를 통한 WP 파일 존재 여부 확인
- [x] 2026-05-07 WP 완료 판정 — TECH_SPEC의 비반복 체크박스 항목(`[ ]`/`[x]`)이 모두 `[x]`이면 completed=true. 반복 전용(모두 `(R)` 또는 비반복 0건)이면 recurring_only=true로 별도 표시
- [x] 2026-05-07 WP 정렬 키 산출 — `M://root` 부터 DFS 순회한 등장 순서를 인덱스로 부여. 고아 WP는 맨 뒤로 모음
- [x] 2026-05-07 log_service 호출 0건 — 로그 미기록 원칙 준수
- [x] 2026-05-07 schedule.json read/write 외에는 다른 파일에 쓰지 않음 (단방향 read만 허용)
- [x] 2026-05-18 schedule.json에 selectedMaps 필드(배열) 추가 (기본값: null → 전체)
- [x] 2026-05-18 PUT /api/schedule — selectedMaps 필드 저장; GET 응답에도 selectedMaps 포함
- [x] 2026-05-18 mapOrderedWps(root, List<String>) — null/empty면 M://root 전체 DFS, 지정 시 각 MAP별 DFS 후 WP 중복 제거 병합
- (R) 변경 후 mvn test 실행
- (R) 변경 후 mvn spring-boot:build로 컴파일 검증

### ISSUE
(없음)

### COMMENT
- 보조 툴 — schedule.json은 이 서비스 외부에서 변경되지 않는다는 가정.
</WAYPOINT>

<WAYPOINT>
## [ADDRESS] W://root/backend/element_service
## [STATUS] S_STB

### IDENTITY
- SUMMARY: 요소 파싱/조회/편집 — Map, WayPoint, BlackBox md 파일 읽기/쓰기, 트리 구조 JSON 변환, 삭제 시 TODO_HISTORY 이관
- METADATA: [Ver: 3.0, Created: 2026-04-06]
- SYNCED_AT: 2026-04-07

### CONNECTIONS
- PARENT: M://root/backend
- CHILDREN: []
- REFERENCE: [W://root/backend/cli_service]

### TODO
# TASK
- [x] 2026-05-25 ElementParser: CHILDREN/REFERENCE 멀티라인 포맷 파싱 지원 (parseWayPoint + parseWayPointDetail)

### ISSUE
(없음)

### COMMENT
- 편집 API는 md 파일을 직접 수정하고 loadstar log CLI로 변경 이력을 기록하는 구조
</WAYPOINT>

### IDENTITY
- SUMMARY: 요소 간 CONNECTIONS(PARENT/REFERENCE)와 GROUP.ITEMS를 그래프 엣지로 표현하는 테이블. 깨진 참조도 버리지 않고 보존한다.

### CONNECTIONS
- REFERENCE:
  - [WP][2.0][2026.07.27]구조 추출기.md
  - [DWP][2.0][2026.08.13]구조 추출기 nodes 테이블.md

### ATTACHMENTS
- file:///extractor.go (schemaSQL, parseConnectionField, Reindex)

### COMMENT
- 스키마:
  ```sql
  CREATE TABLE edges (
      from_id     INTEGER NOT NULL REFERENCES nodes(id),
      to_filename TEXT NOT NULL,
      to_id       INTEGER REFERENCES nodes(id),
      edge_type   TEXT NOT NULL,
      is_valid    INTEGER NOT NULL,
      PRIMARY KEY (from_id, to_filename, edge_type)
  );
  ```
- 필드별 존재 이유:
  - from_id / to_id: nodes.id를 잇는 FK 쌍. "이 문서가 뭐랑 연결됐나"를 SQL JOIN으로 타기 위한 최소 구조.
  - to_filename: 파싱 시점 CONNECTIONS/ITEMS 원문 그대로. to_id가 NULL이어도(깨진 참조) 원래 뭘 가리키려 했는지 남아있어야 사람이든 AI든 고칠지 무시할지 판단할 수 있다 — "현재 환경을 있는 그대로 DB에 반영" 원칙의 구현.
  - edge_type: PARENT/REFERENCE/GROUP_ITEM 구분. 같은 "관계"라도 성격이 달라서(이 WP의 부모는 뭐야 vs 이 WP가 뭘 참조해 vs 이 WP가 어느 GROUP 소속이야) 구분이 없으면 서로 다른 질문에 같은 답을 섞어서 줄 수밖에 없다.
  - is_valid: to_id IS NOT NULL과 논리적으로 동치라 파생 가능한 값이지만, "깨진 참조만 보여줘" 같은 질문에 AI가 매번 IS NOT NULL을 떠올리지 않고 바로 필터링하도록 명시 컬럼으로 중복 저장했다.
  - PRIMARY KEY(from_id, to_filename, edge_type): 같은 문서가 같은 대상을 같은 관계 종류로 두 번 참조하는 일은 없다고 보고 이 3개를 자연키로 삼았다 — 재색인을 여러 번 돌려도(매번 DROP+CREATE라 실질적으론 항상 새로 채워지지만) INSERT가 멱등하게 동작하도록.
- WP/DWP의 CHILDREN이 여기 없는 이유: PARENT의 역방향 조회로 재구성 가능해서다(어떤 노드가 X를 PARENT로 가리키는 PARENT 엣지를 찾으면 그게 X의 CHILDREN 목록) — 같은 관계를 두 방향으로 중복 저장하지 않는다(`appendix/WP.md`/`appendix/DWP.md`의 CONNECTIONS.CHILDREN 정의 참고).
- OTHER가 여기 전혀 안 나타나는 이유: OTHER는 공통 봉투(IDENTITY/CONNECTIONS)가 면제라(`02.ELEMENT_FORMAT.md` §6) 애초에 파싱할 CONNECTIONS/ITEMS 자체가 없다.

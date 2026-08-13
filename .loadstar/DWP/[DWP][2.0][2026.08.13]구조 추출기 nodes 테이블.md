### IDENTITY
- SUMMARY: LOADSTAR 프로젝트의 WP/DWP/GROUP/OTHER 요소 전체를 한 행씩 담는 구조 추출기 핵심 테이블. 파일명·공통 봉투에서 결정론적으로 뽑은 신원/구조 정보만 담는다(내용의 의미 해석은 온디맨드 도메인 조회기 몫).

### CONNECTIONS
- REFERENCE:
  - [WP][2.0][2026.07.27]구조 추출기.md

### ATTACHMENTS
- file:///extractor.go (schemaSQL, scanElementFiles, Reindex)

### COMMENT
- 스키마:
  ```sql
  CREATE TABLE nodes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      format          TEXT NOT NULL,
      ver             TEXT,
      name            TEXT NOT NULL,
      created_date    TEXT,
      modified_at     TEXT,
      file_path       TEXT NOT NULL UNIQUE,
      title           TEXT,
      toc             TEXT,
      checklist_total INTEGER,
      checklist_done  INTEGER
  );
  ```
- 필드별 존재 이유:
  - id: edges가 참조할 대리키. file_path 문자열을 매번 FK로 쓰는 것보다 정수 조인이 SQL상 가볍다. 재색인마다 테이블을 통째로 새로 만들어서(DROP+CREATE) 재색인 간 id 안정성은 없음 — 세션 내 조회 전용으로만 의미가 있다.
  - format: WP/DWP/GROUP/OTHER 구분. "WP 몇 개야" 같은 FORMAT별 집계 질문에 답하는 최소 조건.
  - ver: 파일명 VER 필드 그대로. 지금은 사실상 "2.0" 고정이라 정보량이 낮지만, v1→v2처럼 스펙 버전이 공존하는 시기를 대비해 필드로 분리해뒀다.
  - name: 파일명에서 FORMAT/VER/DATE 접두어를 뗀 자유텍스트 이름. title과 따로 두는 이유는 title 항목 참조.
  - created_date: WP/DWP/GROUP은 파일명에 박제된 생성일, OTHER는 파일시스템 생성시각(파일명에 그런 필드가 없어서). "언제 생겼나"는 정렬·이력 추적의 기초 질문이라 별도 필드로 분리.
  - modified_at: 파일시스템 mtime. history 테이블(git log 기반, 아직 없음)이 생기기 전까지 "최근에 뭐가 바뀌었나"의 1차 근사치. 알려진 한계: git clone/checkout 시 리셋된다 — history 테이블이 생기면 그쪽이 진짜 출처가 되고 이 필드는 보조로 남을 것.
  - file_path: 실제 파일 위치. DB는 결국 "포인터" 역할이라 AI가 상세 내용을 읽으려면 이 경로로 실제 md를 열어야 한다 — 없으면 이 테이블의 존재 의미가 없다.
  - title: IDENTITY.SUMMARY 우선, 없으면 첫 헤딩/첫 줄. name(식별자성 짧은 이름)과 title(설명적 요약)을 분리한 이유 — 예: name="구조 추출기"는 짧지만, title="md 파일에서 결정론적으로 문서 정체성·구조를 추출해 SQLite에 적재하는 파이프라인"은 목록만 보고도 "뭐 하는 문서인지" 바로 알려준다.
  - toc: 문서를 열지 않고 섹션 구성을 파악. "이 문서에 이런 섹션이 있나" 같은 질문에 원문을 안 읽고 답하기 위함.
  - checklist_total / checklist_done: TODO 체크박스 개수 세기 — 순수 마크다운 문법 파싱이라 구조 추출기 몫으로 봤다(체크박스가 "무슨 의미인지" 해석은 온디맨드 도메인 조회기 몫, "몇 개고 몇 개 됐나" 세는 건 구조적 사실이라 여기).
- .md가 아닌 OTHER(csv/html 등): title=파일명, toc/checklist_total/checklist_done=NULL — 파싱할 마크다운 자체가 없다.
- OTHER는 공통 봉투(IDENTITY/CONNECTIONS)가 면제라(`02.ELEMENT_FORMAT.md` §6) title 계산에도 SUMMARY를 안 쓴다 — 곧바로 첫 헤딩/첫 줄(.md) 또는 파일명(비-.md)으로 간다.

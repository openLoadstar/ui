<WAYPOINT>
## [ADDRESS] W://root/backend/git_service
## [STATUS] S_STB

### IDENTITY
- SUMMARY: Git 연동 — 파일별 커밋 이력 조회, 과거 커밋 시점 파일 내용 조회 (WayPoint)
- METADATA: [Ver: 2.1, Created: 2026-04-06]
- SYNCED_AT: 2026-05-20

### CONNECTIONS
- PARENT: M://root/backend
- CHILDREN: []
- REFERENCE: []

### TODO
- [x] 2026-05-20 git show 서브디렉토리 호환 수정 — getGitRepoRoot + getSubdirPrefix 헬퍼 추가, getFileAtCommit / getCommitDetail 적용

### ISSUE
- [CLOSED] projectRoot가 git repo 서브디렉토리일 때 `git show {hash}:{path}` 가 repo root 기준 경로를 요구하여 exit 128 → HTTP 500. `git rev-parse --show-toplevel` 로 repo root 감지 후 prefix 계산으로 해결. `git log` 는 cwd 상대경로로 정상 동작하여 수정 불필요.

### COMMENT
- GitService: git log/git show 실행, GitController: /api/git/history, /api/git/show
</WAYPOINT>

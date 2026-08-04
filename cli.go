package main

// CLI 서브커맨드 라우팅. `05.CLI_SPEC.md` §2 명령어 정의를 따른다.
//
// `create`만 실제로 구현한다 — 나머지(todo/show/issues/validate/reindex)는
// 구조 추출기·온디맨드 도메인 조회기·Validator를 그대로 호출하는 얇은 라우팅
// 계층이어야 하는데(WP GOAL), 그 모듈들이 아직 없다. 그래서 서브커맨드로
// 인식은 하되 미구현 안내만 출력한다 — 대신 로직을 새로 만들지는 않는다.

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var notYetImplementedReason = map[string]string{
	"todo":     "온디맨드 도메인 조회기 WP 대기 중",
	"show":     "온디맨드 도메인 조회기 WP 대기 중",
	"issues":   "온디맨드 도메인 조회기 WP 대기 중",
	"validate": "Validator 모듈 대기 중 (구조 추출기 WP에서 결합 방식 결정 예정)",
	"reindex":  "구조 추출기 WP 대기 중",
}

// runCLI dispatches a subcommand and returns a process exit code.
// Only called when the binary is invoked with at least one argument.
func runCLI(args []string) int {
	switch args[0] {
	case "create":
		return cmdCreate(args[1:])
	case "todo", "show", "issues", "validate", "reindex":
		fmt.Printf("loadstar %s: 아직 미구현 — %s\n", args[0], notYetImplementedReason[args[0]])
		return 1
	case "help", "-h", "--help":
		printUsage()
		return 0
	default:
		fmt.Fprintf(os.Stderr, "알 수 없는 명령: %s\n\n", args[0])
		printUsage()
		return 1
	}
}

func printUsage() {
	fmt.Println(`loadstar — LOADSTAR 프로젝트 탐색기/편집기

사용법:
  loadstar                          GUI 실행
  loadstar create <FORMAT> "이름"     WP/DWP/GROUP 파일 생성 (FORMAT: wp|dwp|group)
  loadstar todo [all|standby|active|done]   (미구현)
  loadstar show                             (미구현)
  loadstar issues                           (미구현)
  loadstar validate                         (미구현)
  loadstar reindex                          (미구현)`)
}

var elementFormats = map[string]string{"wp": "WP", "dwp": "DWP", "group": "GROUP"}

// cmdCreate implements `loadstar create <FORMAT> "이름"` (`05.CLI_SPEC.md` §2).
// FORMAT/VER/DATE는 구조화 필드, 이름은 자유 텍스트(`02.ELEMENT_FORMAT.md` §2) —
// 따옴표를 빠뜨려 여러 인자로 쪼개졌어도 남은 인자를 공백으로 합쳐 이름으로 쓴다.
func cmdCreate(args []string) int {
	if len(args) < 2 {
		fmt.Fprintln(os.Stderr, `사용법: loadstar create <FORMAT> "이름"  (FORMAT: wp|dwp|group)`)
		return 1
	}
	format, ok := elementFormats[strings.ToLower(args[0])]
	if !ok {
		fmt.Fprintf(os.Stderr, "알 수 없는 FORMAT: %s (wp|dwp|group 중 하나)\n", args[0])
		return 1
	}
	name := strings.TrimSpace(strings.Join(args[1:], " "))
	if name == "" {
		fmt.Fprintln(os.Stderr, "이름이 비어 있습니다.")
		return 1
	}

	root, err := findProjectRoot()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}

	dir := filepath.Join(root, ".loadstar", format)
	filename := fmt.Sprintf("[%s][2.0][%s]%s.md", format, time.Now().Format("2006.01.02"), name)
	full := filepath.Join(dir, filename)

	// 동명 충돌 확인(`02.ELEMENT_FORMAT.md` §5) — frontend groupEditor.ts의
	// "+ GROUP" 생성과 동일하게 완성된 파일명 기준으로 검사한다.
	if _, err := os.Stat(full); err == nil {
		fmt.Fprintf(os.Stderr, "이미 같은 이름의 %s가 있습니다: %s\n", format, filename)
		return 1
	}

	if err := os.MkdirAll(dir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "디렉토리 생성 실패: %v\n", err)
		return 1
	}
	if err := os.WriteFile(full, []byte(scaffoldContent(format)), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "파일 생성 실패: %v\n", err)
		return 1
	}

	fmt.Printf("생성됨: .loadstar/%s/%s\n", format, filename)
	return 0
}

// scaffoldContent returns the minimal valid body for a freshly created
// element, per each FORMAT's appendix template (`appendix/WP.md`,
// `appendix/DWP.md`, `appendix/GROUP.md`).
func scaffoldContent(format string) string {
	switch format {
	case "WP":
		return `## [STATUS] S_IDL

### IDENTITY
- SUMMARY:

### CONNECTIONS
- CHILDREN: []
- REFERENCE: []

### TODO
# TASK
- [ ]
`
	case "DWP":
		return `### IDENTITY
- SUMMARY:

### CONNECTIONS
- REFERENCE: []
`
	case "GROUP":
		return `### IDENTITY
- SUMMARY:

### CONNECTIONS
- ITEMS: []
`
	}
	return ""
}

// findProjectRoot walks up from the current working directory looking for
// .loadstar/. Unlike v1(OLD_LOADSTAR/loadstar_cli), it does NOT auto-create
// one — GUI 쪽 OpenProject도 기존 .loadstar 존재를 전제로 하는 것과 동일한
// 원칙(app.go의 isProjectRoot)을 CLI에도 맞춘다.
func findProjectRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("현재 디렉토리를 확인할 수 없습니다: %w", err)
	}
	for {
		if info, err := os.Stat(filepath.Join(dir, ".loadstar")); err == nil && info.IsDir() {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("LOADSTAR 프로젝트를 찾을 수 없습니다 (.loadstar/ 없음) — 프로젝트 폴더 안(또는 하위)에서 실행하세요")
		}
		dir = parent
	}
}

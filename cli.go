package main

// CLI 서브커맨드 라우팅. `05.CLI_SPEC.md` §2 명령어 정의를 따른다.
//
// `create`/`show`만 실제로 구현한다 — 나머지(todo/issues/validate/reindex)는
// 구조 추출기·온디맨드 도메인 조회기·Validator를 그대로 호출하는 얇은 라우팅
// 계층이어야 하는데(WP GOAL), 그 모듈들이 아직 없다. 그래서 서브커맨드로
// 인식은 하되 미구현 안내만 출력한다 — 대신 로직을 새로 만들지는 않는다.
//
// `show`는 예외적으로 지금 바로 필요해서(테스트/세션 진입용) 온디맨드 도메인
// 조회기가 결국 해야 할 일(WP STATUS/ISSUE를 그때그때 md에서 계산)을 가볍게
// 직접 구현했다 — 그 WP가 완료되면 이 스캔 로직은 걷어내고 그쪽을 호출하도록
// 바꿔야 한다(cmdShow 주석 참조).

import (
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

var notYetImplementedReason = map[string]string{
	"todo":     "온디맨드 도메인 조회기 WP 대기 중",
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
	case "show":
		return cmdShow(args[1:])
	case "todo", "issues", "validate", "reindex":
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
  loadstar show                             STATUS별 분포 + ISSUE 있는 문서 요약
  loadstar todo [all|standby|active|done]   (미구현)
  loadstar issues                           (미구현)
  loadstar validate                         (미구현)
  loadstar reindex                          (미구현)`)
}

// statusCodeOrder는 `appendix/WP.md`의 STATUS 코드 표기 순서 그대로.
var statusCodeOrder = []string{"S_IDL", "S_PRG", "S_STB", "S_ERR", "S_REV", "S_OOS"}

var statusCodeLabels = map[string]string{
	"S_IDL": "대기(S_IDL)",
	"S_PRG": "진행중(S_PRG)",
	"S_STB": "완료(S_STB)",
	"S_ERR": "오류(S_ERR)",
	"S_REV": "검토(S_REV)",
	"S_OOS": "제외(S_OOS)",
}

// cmdShow implements `loadstar show` (`05.CLI_SPEC.md` §2) — WP STATUS
// 분포와 ISSUE 있는 문서 목록을 요약한다. 온디맨드 도메인 조회기 WP가 하려는
// 일(md를 그때그때 다시 읽어 계산, DB 캐싱 안 함)을 그 WP 없이 최소 범위로
// 먼저 구현한 것 — 그 WP가 완료되면 이 스캔 로직을 걷어내고 그걸 호출하도록
// 바꿔야 한다(frontend의 ListFormatFiles/projectTree.ts와 같은 "임시 대역" 성격).
func cmdShow(args []string) int {
	root, err := findProjectRoot()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}

	wpFiles, err := listMarkdownFiles(filepath.Join(root, ".loadstar", "WP"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "WP 목록 조회 실패: %v\n", err)
		return 1
	}
	dwpFiles, err := listMarkdownFiles(filepath.Join(root, ".loadstar", "DWP"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "DWP 목록 조회 실패: %v\n", err)
		return 1
	}

	statusCounts := map[string]int{}
	unknownStatus := 0
	var issueFiles []string

	for _, path := range wpFiles {
		raw, err := os.ReadFile(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "읽기 실패, 건너뜀: %s (%v)\n", filepath.Base(path), err)
			continue
		}
		content := string(raw)
		if status := parseStatusCode(content); status != "" {
			statusCounts[status]++
		} else {
			unknownStatus++
		}
		if hasIssue(content) {
			issueFiles = append(issueFiles, filepath.Base(path))
		}
	}
	for _, path := range dwpFiles {
		raw, err := os.ReadFile(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "읽기 실패, 건너뜀: %s (%v)\n", filepath.Base(path), err)
			continue
		}
		if hasIssue(string(raw)) {
			issueFiles = append(issueFiles, filepath.Base(path))
		}
	}

	fmt.Printf("LOADSTAR 프로젝트 현황 — %s\n\n", root)
	fmt.Printf("WP %d개\n", len(wpFiles))
	for _, code := range statusCodeOrder {
		fmt.Printf("  %-14s %d\n", statusCodeLabels[code], statusCounts[code])
	}
	if unknownStatus > 0 {
		fmt.Printf("  STATUS 파싱 실패 %d\n", unknownStatus)
	}

	fmt.Printf("\nISSUE 있는 문서 %d개", len(issueFiles))
	if len(issueFiles) == 0 {
		fmt.Println()
		return 0
	}
	fmt.Println(":")
	sort.Strings(issueFiles)
	for _, name := range issueFiles {
		fmt.Printf("  - %s\n", name)
	}
	return 0
}

func listMarkdownFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	files := []string{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		files = append(files, filepath.Join(dir, e.Name()))
	}
	return files, nil
}

// parseStatusCode reads the `## [STATUS] 코드` header line. Returns "" if
// missing/unparseable.
func parseStatusCode(raw string) string {
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "##") || strings.HasPrefix(trimmed, "###") {
			continue
		}
		trimmed = strings.TrimSpace(strings.TrimPrefix(trimmed, "##"))
		if !strings.HasPrefix(trimmed, "[STATUS]") {
			continue
		}
		return strings.TrimSpace(strings.TrimPrefix(trimmed, "[STATUS]"))
	}
	return ""
}

// hasIssue reports whether the `### ISSUE` section has real content —
// missing section, empty body, or the "(없음)" placeholder all count as no issue.
func hasIssue(raw string) bool {
	body := extractSection(raw, "### ISSUE")
	return body != "" && body != "(없음)" && body != "없음"
}

// extractSection returns the trimmed body between a `### 헤더` line and the
// next line starting with `#` (or EOF). "" if the header isn't found.
func extractSection(raw, header string) string {
	lines := strings.Split(raw, "\n")
	start := -1
	for i, line := range lines {
		if strings.TrimSpace(line) == header {
			start = i + 1
			break
		}
	}
	if start == -1 {
		return ""
	}
	var body []string
	for _, line := range lines[start:] {
		if strings.HasPrefix(strings.TrimSpace(line), "#") {
			break
		}
		body = append(body, line)
	}
	return strings.TrimSpace(strings.Join(body, "\n"))
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

	root, err := findProjectRoot()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}

	relPath, err := createElement(root, format, name)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}

	fmt.Printf("생성됨: %s\n", relPath)
	return 0
}

// createElement scaffolds a new WP/DWP/GROUP file under root/.loadstar/<format>/
// and returns its project-relative path (forward slashes, matching
// ReadFile/WriteFile's convention). format must already be normalized
// (elementFormats value — "WP"/"DWP"/"GROUP"). Shared by cmdCreate and
// App.CreateElement(app.go) so CLI and GUI creation never drift apart.
func createElement(root, format, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("이름이 비어 있습니다")
	}

	dir := filepath.Join(root, ".loadstar", format)
	filename := fmt.Sprintf("[%s][2.0][%s]%s.md", format, time.Now().Format("2006.01.02"), name)
	full := filepath.Join(dir, filename)

	// 동명 충돌 확인(`02.ELEMENT_FORMAT.md` §5) — frontend groupEditor.ts의
	// "+ GROUP" 생성과 동일하게 완성된 파일명 기준으로 검사한다.
	if _, err := os.Stat(full); err == nil {
		return "", fmt.Errorf("이미 같은 이름의 %s가 있습니다: %s", format, filename)
	}

	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("디렉토리 생성 실패: %w", err)
	}
	if err := os.WriteFile(full, []byte(scaffoldContent(format)), 0644); err != nil {
		return "", fmt.Errorf("파일 생성 실패: %w", err)
	}

	return path.Join(".loadstar", format, filename), nil
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

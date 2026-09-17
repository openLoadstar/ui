package main

// `loadstar validate` — 참조 무결성 검사(`05.CLI_SPEC.md` §2).
//
// SPEC은 완전한 일관성을 목표로 하지 않는다(`01.MASTER_GUIDE.md` §3 Tolerable
// Consistency). 이 명령은 어긋난 자리를 **발견 가능하게** 만드는 쪽이지, 어긋남을
// 막거나 고쳐주는 쪽이 아니다. 그래서 전부 보고만 하고 파일은 건드리지 않는다.
//
// 색인(index.db)이 아니라 md 원본을 직접 읽는다 — 재색인을 안 돌린 상태에서도
// 지금 디스크에 있는 그대로를 검사해야 결과를 믿을 수 있다.

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Finding 하나가 보고 한 줄이다.
type Finding struct {
	File    string
	Message string
}

// validateProject checks reference integrity across the whole project.
func validateProject(root string) ([]Finding, error) {
	records, err := scanElementFiles(root)
	if err != nil {
		return nil, err
	}

	exists := make(map[string]bool, len(records))
	for _, rec := range records {
		exists[rec.filename] = true
	}

	findings := []Finding{}
	add := func(file, format string, args ...any) {
		findings = append(findings, Finding{File: file, Message: fmt.Sprintf(format, args...)})
	}

	// 1) 표시 이름이 겹치는 요소 — 파일명은 달라도(DATE가 다르면) 사람에게는 같은 이름이라
	//    참조에서 어느 쪽인지 헷갈린다(`02.ELEMENT_FORMAT.md` §5).
	byName := map[string][]string{}
	for _, rec := range records {
		if rec.format == "OTHER" {
			continue // OTHER는 명명 규칙 자체가 면제다(§1)
		}
		parsed := parseStructuredFilename(rec.filename)
		if !parsed.matched {
			continue
		}
		byName[rec.format+"/"+parsed.name] = append(byName[rec.format+"/"+parsed.name], rec.filename)
	}
	for key, files := range byName {
		if len(files) < 2 {
			continue
		}
		sort.Strings(files)
		add(files[0], "표시 이름이 겹칩니다(%s): %s", key, strings.Join(files, ", "))
	}

	// 2) CONNECTIONS가 가리키는 파일이 실제로 있는지.
	for _, rec := range records {
		if rec.format == "OTHER" || !rec.isMarkdown {
			continue // OTHER는 공통 봉투가 면제다(§6)
		}
		body := findConnectionsBody(splitLines(rec.content))
		if body == nil {
			add(rec.filename, "`### CONNECTIONS` 섹션이 없습니다.")
			continue
		}
		fields := []string{"PARENT", "REFERENCE"}
		if rec.format == "GROUP" {
			fields = []string{"ITEMS"}
		}
		for _, field := range fields {
			for _, target := range parseConnectionField(body, field) {
				if !exists[target] {
					add(rec.filename, "%s가 없는 파일을 가리킵니다: %s", field, target)
				}
			}
		}
	}

	// 3) FLOW의 `REFERENCES` — 대상 파일과 그림 속 노드가 실제로 있는지.
	for _, rec := range records {
		if rec.format != "FLOW" || !rec.isMarkdown {
			continue
		}
		nodes := flowDiagramNodeIDs(rec.content)
		seen := map[string]bool{}
		for _, ref := range parseFlowReferences(rec.content) {
			if seen[ref.Step] {
				add(rec.filename, "REFERENCES에 같은 노드가 두 번 있습니다: %s", ref.Step)
			}
			seen[ref.Step] = true
			if !exists[ref.Target] {
				add(rec.filename, "%s가 없는 파일을 가리킵니다: %s", ref.Step, ref.Target)
			}
			if len(nodes) > 0 && !nodes[ref.Step] {
				add(rec.filename, "REFERENCES의 `%s`가 그림에 없습니다.", ref.Step)
			}
		}
	}

	// 4) FLOW끼리의 순환 — 금지하지는 않지만(되돌아가는 흐름은 실재한다) 알려는 준다.
	for _, cycle := range flowCycles(records) {
		add(cycle[0], "FLOW 참조가 순환합니다: %s", strings.Join(cycle, " → "))
	}

	sort.SliceStable(findings, func(i, j int) bool { return findings[i].File < findings[j].File })
	return findings, nil
}

// flowCycles finds cycles in the FLOW -> FLOW reference graph.
func flowCycles(records []fileRecord) [][]string {
	next := map[string][]string{}
	for _, rec := range records {
		if rec.format != "FLOW" || !rec.isMarkdown {
			continue
		}
		for _, ref := range parseFlowReferences(rec.content) {
			// FORMAT 접두어로 대상 종류를 판단한다(`02.ELEMENT_FORMAT.md` §4).
			if strings.HasPrefix(ref.Target, "[FLOW]") {
				next[rec.filename] = append(next[rec.filename], ref.Target)
			}
		}
	}

	cycles := [][]string{}
	state := map[string]int{} // 0 미방문, 1 방문 중, 2 끝남
	var path []string
	var walk func(node string)
	walk = func(node string) {
		state[node] = 1
		path = append(path, node)
		for _, to := range next[node] {
			switch state[to] {
			case 0:
				walk(to)
			case 1:
				// 되돌아온 지점부터가 고리다.
				for i, n := range path {
					if n == to {
						cycles = append(cycles, append(append([]string{}, path[i:]...), to))
						break
					}
				}
			}
		}
		path = path[:len(path)-1]
		state[node] = 2
	}
	starts := make([]string, 0, len(next))
	for from := range next {
		starts = append(starts, from)
	}
	sort.Strings(starts)
	for _, from := range starts {
		if state[from] == 0 {
			walk(from)
		}
	}
	return cycles
}

// cmdValidate implements `loadstar validate`.
func cmdValidate(args []string) int {
	root, err := projectRootFromArgs(args)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}

	findings, err := validateProject(root)
	if err != nil {
		fmt.Fprintf(os.Stderr, "검증 실패: %v\n", err)
		return 1
	}
	if len(findings) == 0 {
		fmt.Printf("검증 완료 — 문제 없음 (%s)\n", filepath.Clean(root))
		return 0
	}

	fmt.Printf("검증 완료 — %d건 (%s)\n", len(findings), filepath.Clean(root))
	current := ""
	for _, f := range findings {
		if f.File != current {
			current = f.File
			fmt.Printf("\n%s\n", current)
		}
		fmt.Printf("  - %s\n", f.Message)
	}
	// 어긋남을 찾는 것 자체는 정상 동작이라 실패로 취급하지 않는다 —
	// CI에서 막고 싶으면 출력 줄 수를 보면 된다.
	return 0
}

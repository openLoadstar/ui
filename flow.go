package main

// FLOW 요소(`SPEC 2.0/appendix/FLOW.md`)에서 Go가 필요로 하는 만큼만 읽어낸다.
//
// 편집기(프론트엔드 `flowFile.ts`)는 그림을 줄 단위로 고치느라 훨씬 자세한
// 파서를 들고 있지만, Go 쪽이 필요한 것은 두 가지뿐이다:
//   - `### REFERENCES`의 `노드id: 요소 파일명` — 색인(edges)과 검증에 쓴다
//   - `### DIAGRAM`에 실제로 있는 노드 id — 참조가 가리키는 노드가 있는지 보려고
//
// 간선 위상(a -> b)은 여기서도 색인 대상이 아니다(`04.META_EXTRACTION.md` §1).

import (
	"regexp"
	"strings"
)

// FlowRef는 `REFERENCES` 한 줄 — 어느 노드가 어느 요소를 가리키는가.
type FlowRef struct {
	Step   string
	Target string
}

var (
	flowRefLine     = regexp.MustCompile(`^\s*-\s*([A-Za-z_]\w*)\s*:\s*(.+?)\s*$`)
	flowHeading     = regexp.MustCompile(`^###\s+(\w+)`)
	mermaidOpen     = regexp.MustCompile("^\\s*```\\s*mermaid\\s*$")
	fenceClose      = regexp.MustCompile("^\\s*```\\s*$")
	flowIdentifier  = regexp.MustCompile(`^[A-Za-z_]\w*$`)
	flowBracketPair = regexp.MustCompile(`\[[^\[\]]*\]|\{[^{}]*\}|\([^()]*\)`)
)

// flowKeywords는 노드 id로 세면 안 되는 mermaid 문법 낱말.
var flowKeywords = map[string]bool{
	"flowchart": true, "graph": true, "subgraph": true, "end": true, "direction": true,
	"LR": true, "RL": true, "TD": true, "TB": true, "BT": true,
	"style": true, "classDef": true, "class": true, "click": true, "linkStyle": true,
}

// sectionLines는 `### <name>` 섹션의 본문 줄을 돌려준다.
func sectionLines(lines []string, name string) []string {
	start := -1
	for i, l := range lines {
		if m := flowHeading.FindStringSubmatch(l); m != nil && m[1] == name {
			start = i + 1
			break
		}
	}
	if start == -1 {
		return nil
	}
	for i := start; i < len(lines); i++ {
		if strings.HasPrefix(lines[i], "### ") {
			return lines[start:i]
		}
	}
	return lines[start:]
}

// parseFlowReferences reads the `REFERENCES` section as step -> element pairs.
func parseFlowReferences(content string) []FlowRef {
	refs := []FlowRef{}
	for _, line := range sectionLines(splitLines(content), "REFERENCES") {
		if m := flowRefLine.FindStringSubmatch(line); m != nil {
			refs = append(refs, FlowRef{Step: m[1], Target: m[2]})
		}
	}
	return refs
}

// flowDiagramNodeIDs collects the node ids the diagram actually contains.
//
// 라벨 안의 글자는 세면 안 되므로 괄호쌍을 안쪽부터 걷어낸 뒤 남은 토큰만 본다.
// 놓치는 경우가 있어도 괜찮다 — 이 결과는 "참조가 가리키는 노드가 그림에 있나"를
// 알려주는 검증용이지, 그림을 고치는 데 쓰지 않는다.
func flowDiagramNodeIDs(content string) map[string]bool {
	ids := map[string]bool{}
	lines := sectionLines(splitLines(content), "DIAGRAM")

	inside := false
	for _, line := range lines {
		if !inside {
			if mermaidOpen.MatchString(line) {
				inside = true
			}
			continue
		}
		if fenceClose.MatchString(line) {
			break
		}
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "%%") {
			continue
		}

		// 괄호쌍(라벨)을 안쪽부터 반복해서 지운다 — `id[[라벨]]`처럼 겹친 것도 풀린다.
		stripped := line
		for {
			next := flowBracketPair.ReplaceAllString(stripped, " ")
			if next == stripped {
				break
			}
			stripped = next
		}
		// 화살표와 조건 라벨 구분자를 공백으로 바꾼 뒤 남은 낱말을 본다.
		stripped = strings.NewReplacer("-", " ", ">", " ", "<", " ", "=", " ", ".", " ", "|", " ").Replace(stripped)
		for _, token := range strings.Fields(stripped) {
			if flowKeywords[token] || !flowIdentifier.MatchString(token) {
				continue
			}
			ids[token] = true
		}
	}
	return ids
}

func splitLines(content string) []string {
	return strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n")
}

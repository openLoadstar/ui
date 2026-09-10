package main

// 전체 파일 검색 — `[WP][2.0][2026.09.10]검색.md` G2 구현.
// 대상 파일 목록은 ListFormatFiles를 그대로 재사용한다 — OTHER의 확장자
// 허용 목록 설정과 ".del"(삭제=숨김) 규칙을 검색이 따로 흉내 내지 않고
// 자동으로 승계하기 위해서다.

import (
	"errors"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	// 결과 트리가 수천 행으로 불어나는 것을 막는 상한.
	searchMaxFiles       = 300
	searchMaxHitsPerFile = 50
	// 미리보기 한 줄이 지나치게 길어지면 트리 폭을 넘어가며 렌더만 무거워진다.
	searchPreviewMaxLen = 200
	// 요소 md가 아닌 거대한 로그/데이터 파일(OTHER)까지 매 타자마다 훑지 않는다.
	searchMaxFileBytes = 1 << 20 // 1MB
)

// SearchHit은 한 줄에서 발견된 일치. 한 줄에 여러 번 나오면 LineCount로 센다.
type SearchHit struct {
	Line int    `json:"line"` // 1-based
	Text string `json:"text"` // 그 줄 원문(앞뒤 공백 제거, 길면 잘림)
	// Index는 파일 전체에서 몇 번째 일치인지(0-based) — 이 줄의 첫 일치 기준.
	// 프론트가 렌더링된 문서의 n번째 하이라이트로 점프하는 데 쓴다.
	Index     int `json:"index"`
	LineCount int `json:"lineCount"`
}

// SearchFileResult는 파일 하나의 검색 결과.
type SearchFileResult struct {
	Path  string `json:"path"`
	Count int    `json:"count"` // 파일 전체 일치 수
	// NameMatch는 내용이 아니라 파일명이 일치한 경우 — 내용 일치가 0이어도 결과에 남긴다.
	NameMatch bool        `json:"nameMatch"`
	Hits      []SearchHit `json:"hits"`
	Truncated bool        `json:"truncated"` // 히트가 searchMaxHitsPerFile에서 잘렸는지
}

// SearchInFiles는 프로젝트의 모든 요소 파일(WP/DWP/GROUP/OTHER)에서
// query를 찾는다. 결과는 일치 수 내림차순, 같으면 경로순.
func (a *App) SearchInFiles(query string, caseSensitive bool) ([]SearchFileResult, error) {
	if a.projectRoot == "" {
		return nil, errors.New("열려 있는 프로젝트가 없습니다")
	}
	if strings.TrimSpace(query) == "" {
		return []SearchFileResult{}, nil
	}

	needle := query
	if !caseSensitive {
		needle = strings.ToLower(needle)
	}

	results := []SearchFileResult{}
	for _, format := range []string{"WP", "DWP", "GROUP", "OTHER"} {
		paths, err := a.ListFormatFiles(format)
		if err != nil {
			return nil, err
		}
		for _, p := range paths {
			if len(results) >= searchMaxFiles {
				break
			}
			r, ok := a.searchOneFile(p, needle, caseSensitive)
			if ok {
				results = append(results, r)
			}
		}
	}

	sort.Slice(results, func(i, j int) bool {
		if results[i].Count != results[j].Count {
			return results[i].Count > results[j].Count
		}
		return results[i].Path < results[j].Path
	})
	log.Printf("SearchInFiles: %q -> %d files", query, len(results))
	return results, nil
}

func (a *App) searchOneFile(relPath, needle string, caseSensitive bool) (SearchFileResult, bool) {
	full := filepath.Join(a.projectRoot, relPath)
	info, err := os.Stat(full)
	if err != nil || info.Size() > searchMaxFileBytes {
		return SearchFileResult{}, false // 조회 사이 지워졌거나, 너무 큼
	}
	data, err := os.ReadFile(full)
	if err != nil {
		return SearchFileResult{}, false
	}
	content := string(data)
	if !utf8.ValidString(content) {
		return SearchFileResult{}, false // 바이너리/다른 인코딩 — 라인 단위 표시가 의미 없다
	}

	name := filepath.Base(relPath)
	nameHaystack := name
	if !caseSensitive {
		nameHaystack = strings.ToLower(nameHaystack)
	}

	result := SearchFileResult{Path: relPath, NameMatch: strings.Contains(nameHaystack, needle), Hits: []SearchHit{}}
	total := 0
	for i, line := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		haystack := line
		if !caseSensitive {
			haystack = strings.ToLower(haystack)
		}
		n := strings.Count(haystack, needle)
		if n == 0 {
			continue
		}
		if len(result.Hits) < searchMaxHitsPerFile {
			result.Hits = append(result.Hits, SearchHit{
				Line:      i + 1,
				Text:      truncatePreview(strings.TrimSpace(line)),
				Index:     total,
				LineCount: n,
			})
		} else {
			result.Truncated = true
		}
		total += n
	}
	result.Count = total
	return result, total > 0 || result.NameMatch
}

// truncatePreview는 룬 경계에서 자른다 — 바이트로 자르면 한글이 깨진다.
func truncatePreview(s string) string {
	runes := []rune(s)
	if len(runes) <= searchPreviewMaxLen {
		return s
	}
	return string(runes[:searchPreviewMaxLen]) + "…"
}

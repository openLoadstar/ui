package main

// 구조 추출기 — `[WP][2.0][2026.07.27]구조 추출기.md` 구현.
// `.loadstar/{WP,DWP,GROUP,OTHER}`를 스캔해 SQLite(nodes/edges)에 적재한다.
// `04.META_EXTRACTION.md` §6.1~6.2 스키마를 기반으로 하되, 이 프로젝트에서
// 논의된 대로 두 군데를 확장했다:
//   - edges: 깨진 참조도 조용히 버리지 않고 to_filename(원문) + is_valid로 남긴다
//     ("가급적 현재 환경은 그대로 DB에 반영" 원칙 — 깨진 참조 탐지 자체는 여전히
//     별도 Validator WP 몫이지만, 이 데이터가 있어야 그 Validator가 나중에 쓸 수 있다)
//   - nodes: OTHER(파일명에 생성일 필드가 없음)의 created_date, 그리고 전 FORMAT
//     공통의 modified_at을 파일시스템 시각으로 채운다. git log 기반으로 대체하는
//     건 history 테이블을 붙일 후속 작업 몫 — 지금은 알려진 한계로 남겨둔다
//     (git clone/checkout 시 mtime이 리셋될 수 있음).
// history/ai_facets는 이번 범위 밖(§4.1 GOAL 참조, 데이터 추출 1차 범위는
// nodes/edges까지로 합의됨).
//
// OTHER는 공통 봉투가 면제라(`02.ELEMENT_FORMAT.md` §6) IDENTITY/CONNECTIONS를
// 파싱하지 않는다 — edges에 절대 안 나타난다. 다만 title의 "첫 헤딩/첫 줄" 대체
// 규칙은 봉투 유무와 무관한 마크다운 문법 차원의 규칙이라 OTHER의 .md 파일에도
// 그대로 적용한다(toc/checklist도 마찬가지 — `04.META_EXTRACTION.md` §4 "구조적
// 사실의 기준" 참조). 반대로 비-.md OTHER(csv/html/pptx 등)는 마크다운 자체가
// 없으니 title=파일명, toc/checklist=NULL.

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// ---------- 파일명 파서 ----------

// `[FORMAT][VER][DATE]이름.md` — FORMAT은 안 씀(파일이 어느 폴더에 있었는지로
// 이미 알고 있다 — app.go:ListFormatFiles와 동일한 "위치가 곧 FORMAT" 원칙).
var structuredNameRe = regexp.MustCompile(`^\[[^\]]+\]\[([^\]]+)\]\[([^\]]+)\](.+)\.md$`)

type parsedFilename struct {
	ver, createdDate, name string
	matched                bool
}

func parseStructuredFilename(filename string) parsedFilename {
	m := structuredNameRe.FindStringSubmatch(filename)
	if m == nil {
		return parsedFilename{}
	}
	return parsedFilename{ver: m[1], createdDate: m[2], name: m[3], matched: true}
}

// ---------- 공통 봉투 파서 (IDENTITY.SUMMARY, CONNECTIONS.*) ----------

var summaryLineRe = regexp.MustCompile(`(?m)^-\s*SUMMARY:\s*(.*)$`)

func parseSummary(raw string) string {
	m := summaryLineRe.FindStringSubmatch(raw)
	if m == nil {
		return ""
	}
	return strings.TrimSpace(m[1])
}

var connectionsHeaderRe = regexp.MustCompile(`^###\s*CONNECTIONS`)
var sectionHeaderRe = regexp.MustCompile(`^###\s`)
var itemRowRe = regexp.MustCompile(`^\s{2,}-\s+(.+?)\s*$`)

func findConnectionsBody(lines []string) []string {
	start := -1
	for i, l := range lines {
		if connectionsHeaderRe.MatchString(strings.TrimSpace(l)) {
			start = i + 1
			break
		}
	}
	if start == -1 {
		return nil
	}
	end := len(lines)
	for i := start; i < len(lines); i++ {
		if sectionHeaderRe.MatchString(strings.TrimSpace(lines[i])) {
			end = i
			break
		}
	}
	return lines[start:end]
}

// parseConnectionField reads one field(PARENT/CHILDREN/REFERENCE/ITEMS) out of
// a ### CONNECTIONS body. 관행은 groupFile.ts:parseGroupItems와 동일 —
// "- FIELD: 단일값"(PARENT류) 또는 "- FIELD: []"(빈 값) 또는
// "- FIELD:\n  - a\n  - b"(목록, REFERENCE/ITEMS류) 세 형태를 전부 받는다.
func parseConnectionField(body []string, field string) []string {
	fieldHeaderRe := regexp.MustCompile(`^-\s*` + regexp.QuoteMeta(field) + `:\s*(.*)$`)
	for i, line := range body {
		m := fieldHeaderRe.FindStringSubmatch(strings.TrimRight(line, " \t"))
		if m == nil {
			continue
		}
		inline := strings.TrimSpace(m[1])
		if inline == "[]" || inline == "" {
			if inline == "[]" {
				return nil
			}
			// 인라인 값이 비어있으면 다음 줄부터 목록 형태를 시도한다.
			var result []string
			for j := i + 1; j < len(body); j++ {
				if im := itemRowRe.FindStringSubmatch(body[j]); im != nil {
					result = append(result, strings.TrimSpace(im[1]))
					continue
				}
				if strings.TrimSpace(body[j]) == "" {
					continue
				}
				break
			}
			return result
		}
		return []string{inline}
	}
	return nil
}

// ---------- 마크다운 구조 파서 (toc, checklist) ----------

var headingRe = regexp.MustCompile(`^(#{1,6})\s+(.+)$`)
var checkboxRe = regexp.MustCompile(`^-\s*\[([ xX])\]`)

type tocEntry struct {
	Level int    `json:"level"`
	Text  string `json:"text"`
}

func parseMarkdownStructure(raw string) (toc []tocEntry, checklistTotal, checklistDone int) {
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if m := headingRe.FindStringSubmatch(trimmed); m != nil {
			toc = append(toc, tocEntry{Level: len(m[1]), Text: strings.TrimSpace(m[2])})
			continue
		}
		if m := checkboxRe.FindStringSubmatch(trimmed); m != nil {
			checklistTotal++
			if strings.ToLower(m[1]) == "x" {
				checklistDone++
			}
		}
	}
	return
}

// firstHeadingOrLine returns the document's first non-blank line, heading
// markers stripped if it happens to be one — title의 "첫 헤딩/첫 줄" 규칙.
func firstHeadingOrLine(raw string) string {
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if m := headingRe.FindStringSubmatch(trimmed); m != nil {
			return strings.TrimSpace(m[2])
		}
		return trimmed
	}
	return ""
}

// ---------- 스캔 대상 레코드 ----------

type fileRecord struct {
	format     string // WP | DWP | GROUP | OTHER — 소속 폴더 기준(app.go:ListFormatFiles와 동일 원칙)
	relPath    string // 프로젝트 루트 기준, forward slash
	filename   string
	isMarkdown bool
	content    string // .md가 아니면 빈 문자열(안 읽음)
	modTime    time.Time
}

var validFormats = []string{"WP", "DWP", "GROUP", "OTHER"}

// loadOtherExtensions mirrors app.go:GetOtherExtensions — CLI 쪽엔 *App
// 인스턴스가 없어서 같은 설정 파일(otherExtensionsPath)을 직접 읽는다.
// GUI에서 바꾼 허용 확장자를 CLI 재색인도 그대로 따르게 하기 위함.
func loadOtherExtensions() map[string]bool {
	allowed := make(map[string]bool, len(defaultOtherExtensions))
	exts := defaultOtherExtensions
	if path, err := otherExtensionsPath(); err == nil {
		if data, err := os.ReadFile(path); err == nil {
			var saved []string
			if json.Unmarshal(data, &saved) == nil && len(saved) > 0 {
				exts = saved
			}
		}
	}
	for _, e := range exts {
		allowed[strings.ToLower(e)] = true
	}
	return allowed
}

func scanElementFiles(root string) ([]fileRecord, error) {
	var records []fileRecord
	otherExtAllowed := loadOtherExtensions()
	for _, format := range validFormats {
		dir := filepath.Join(root, ".loadstar", format)
		entries, err := os.ReadDir(dir)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, fmt.Errorf("%s 스캔 실패: %w", format, err)
		}
		for _, e := range entries {
			if e.IsDir() || strings.HasSuffix(e.Name(), ".del") {
				continue // 소프트 삭제된 파일(main.ts:deleteElement) — 목록에서 제외
			}
			// GUI 목록(app.go:ListFormatFiles)과 동일한 필터 — WP/DWP/GROUP은
			// .md만 요소로 인정, OTHER는 확장자 허용목록을 따른다. 안 그러면
			// .gitkeep 같은 비-요소 파일이 그대로 node로 색인된다.
			if format == "OTHER" {
				if !otherExtAllowed[strings.ToLower(filepath.Ext(e.Name()))] {
					continue
				}
			} else if !strings.HasSuffix(e.Name(), ".md") {
				continue
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			full := filepath.Join(dir, e.Name())
			isMD := strings.HasSuffix(strings.ToLower(e.Name()), ".md")
			rec := fileRecord{
				format:     format,
				relPath:    filepath.ToSlash(filepath.Join(".loadstar", format, e.Name())),
				filename:   e.Name(),
				isMarkdown: isMD,
				modTime:    info.ModTime(),
			}
			if isMD {
				raw, err := os.ReadFile(full)
				if err != nil {
					continue // 읽기 실패한 파일은 건너뜀(권한 등) — 다음 재색인에서 재시도됨
				}
				rec.content = string(raw)
			}
			records = append(records, rec)
		}
	}
	return records, nil
}

// ---------- DB 스키마 ----------

const schemaSQL = `
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
CREATE TABLE edges (
    from_id     INTEGER NOT NULL REFERENCES nodes(id),
    to_filename TEXT NOT NULL,
    to_id       INTEGER REFERENCES nodes(id),
    edge_type   TEXT NOT NULL,
    is_valid    INTEGER NOT NULL,
    PRIMARY KEY (from_id, to_filename, edge_type)
);
`

func openIndexDB(root string) (*sql.DB, error) {
	cacheDir := filepath.Join(root, ".loadstar", ".cache")
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return nil, fmt.Errorf(".cache 디렉토리 생성 실패: %w", err)
	}
	dbPath := filepath.Join(cacheDir, "index.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("SQLite 열기 실패: %w", err)
	}
	return db, nil
}

// ---------- 재색인 ----------

type ReindexStats struct {
	Nodes       int
	Edges       int
	BrokenEdges int
}

// Reindex는 파생 캐시 원칙(`01.MASTER_GUIDE.md` §2)에 따라 매번 전체 재생성한다
// — nodes/edges를 지우고 처음부터 다시 채운다. 증분 갱신은 지금 범위 밖.
func Reindex(root string) (ReindexStats, error) {
	var stats ReindexStats

	records, err := scanElementFiles(root)
	if err != nil {
		return stats, err
	}

	db, err := openIndexDB(root)
	if err != nil {
		return stats, err
	}
	defer db.Close()

	if _, err := db.Exec("DROP TABLE IF EXISTS edges; DROP TABLE IF EXISTS nodes;"); err != nil {
		return stats, fmt.Errorf("기존 테이블 정리 실패: %w", err)
	}
	if _, err := db.Exec(schemaSQL); err != nil {
		return stats, fmt.Errorf("스키마 생성 실패: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return stats, err
	}
	defer tx.Rollback() //nolint:errcheck // 커밋 성공 시 no-op

	idByFilename := make(map[string]int64, len(records))
	insertNode, err := tx.Prepare(`INSERT INTO nodes
		(format, ver, name, created_date, modified_at, file_path, title, toc, checklist_total, checklist_done)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return stats, err
	}
	defer insertNode.Close()

	for _, rec := range records {
		parsed := parsedFilename{}
		if rec.format != "OTHER" {
			parsed = parseStructuredFilename(rec.filename)
		}

		name := rec.filename
		var ver, createdDate any
		if parsed.matched {
			name = parsed.name
			ver = parsed.ver
			createdDate = parsed.createdDate
		} else if rec.format == "OTHER" {
			createdDate = rec.modTime.Format(time.RFC3339)
		}
		// WP/DWP/GROUP인데 명명 규칙에 안 맞는 파일(손편집 등)은 ver/created_date를
		// 못 채우지만, "위치가 곧 신원"(app.go:ListFormatFiles) 원칙대로 그래도
		// 해당 FORMAT의 node로 만든다 — Tolerable Consistency, 하드 실패 안 함.

		title := parseSummary(rec.content)
		var toc any
		var checklistTotal, checklistDone any
		if rec.isMarkdown {
			if title == "" {
				title = firstHeadingOrLine(rec.content)
			}
			entries, total, done := parseMarkdownStructure(rec.content)
			if b, err := json.Marshal(entries); err == nil {
				toc = string(b)
			}
			checklistTotal, checklistDone = total, done
		}
		if title == "" {
			title = name
		}

		res, err := insertNode.Exec(rec.format, ver, name, createdDate,
			rec.modTime.Format(time.RFC3339), rec.relPath, title, toc, checklistTotal, checklistDone)
		if err != nil {
			return stats, fmt.Errorf("node insert 실패(%s): %w", rec.relPath, err)
		}
		id, err := res.LastInsertId()
		if err != nil {
			return stats, err
		}
		idByFilename[rec.filename] = id
		stats.Nodes++
	}

	insertEdge, err := tx.Prepare(`INSERT OR IGNORE INTO edges
		(from_id, to_filename, to_id, edge_type, is_valid) VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return stats, err
	}
	defer insertEdge.Close()

	addEdges := func(fromFilename string, targets []string, edgeType string) error {
		fromID, ok := idByFilename[fromFilename]
		if !ok {
			return nil
		}
		for _, target := range targets {
			toID, valid := idByFilename[target]
			var toIDParam any
			if valid {
				toIDParam = toID
			}
			isValid := 0
			if valid {
				isValid = 1
			} else {
				stats.BrokenEdges++
			}
			if _, err := insertEdge.Exec(fromID, target, toIDParam, edgeType, isValid); err != nil {
				return fmt.Errorf("edge insert 실패(%s -> %s): %w", fromFilename, target, err)
			}
			stats.Edges++
		}
		return nil
	}

	// OTHER는 공통 봉투가 면제라 여기서 아예 건너뛴다(`02.ELEMENT_FORMAT.md` §6).
	for _, rec := range records {
		if rec.format == "OTHER" || !rec.isMarkdown {
			continue
		}
		lines := strings.Split(rec.content, "\n")
		body := findConnectionsBody(lines)
		if body == nil {
			continue
		}
		switch rec.format {
		case "WP", "DWP":
			if err := addEdges(rec.filename, parseConnectionField(body, "PARENT"), "PARENT"); err != nil {
				return stats, err
			}
			if err := addEdges(rec.filename, parseConnectionField(body, "REFERENCE"), "REFERENCE"); err != nil {
				return stats, err
			}
			// CHILDREN은 저장 안 함 — PARENT의 역방향 조회로 대체(`04.META_EXTRACTION.md` §6.2)
		case "GROUP":
			if err := addEdges(rec.filename, parseConnectionField(body, "ITEMS"), "GROUP_ITEM"); err != nil {
				return stats, err
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return stats, fmt.Errorf("커밋 실패: %w", err)
	}
	return stats, nil
}

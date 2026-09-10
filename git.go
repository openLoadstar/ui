package main

// 파일 이력 뷰어 — `[WP][2.0][2026.09.10]파일 이력 뷰어.md` 구현.
// 열려 있는 탭의 파일이 git 저장소 안에 있으면 커밋 이력을 뽑아주고,
// 특정 커밋 시점의 원문을 그대로 돌려준다. go-git 같은 라이브러리를
// 새로 끌어오지 않고 설치된 `git` 실행 파일을 그대로 호출한다 —
// 이 앱은 단일 실행 파일 배포가 목표(Standalone Viewer WP GOAL)라
// 의존성을 늘리지 않는 쪽이 낫고, git이 없으면 기능만 조용히
// 비활성화되면 되는 성격이기 때문.

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// gitTimeout — 저장소가 크거나 네트워크 드라이브에 있을 때 UI가 무한정
// 멈추지 않도록 거는 상한. 로컬 log/show는 보통 수십 ms 안에 끝난다.
const gitTimeout = 15 * time.Second

// gitHistoryLimit — 콤보박스에 넣을 커밋 수 상한.
const gitHistoryLimit = 200

// GitCommit은 이력 콤보박스 항목 하나.
type GitCommit struct {
	Hash    string `json:"hash"`
	Short   string `json:"short"`
	Author  string `json:"author"`
	Date    string `json:"date"` // ISO 8601 (author date)
	Subject string `json:"subject"`
	// Path는 "그 커밋 시점의" 저장소 루트 기준 경로다. --follow로 리네임을
	// 따라가면 커밋마다 경로가 다를 수 있어서, GitFileAtCommit에 현재 경로가
	// 아니라 이 값을 그대로 넘겨야 한다.
	Path string `json:"path"`
}

// GitHistory는 이력 조회 결과. git이 없거나 저장소가 아니어도 오류가 아니라
// Available=false + Reason으로 내려준다 — 프론트가 콤보박스를 조용히
// 비활성화하기만 하면 되는 상황이지 사용자에게 알릴 실패가 아니다.
type GitHistory struct {
	Available bool        `json:"available"`
	Reason    string      `json:"reason"`
	Dirty     bool        `json:"dirty"` // 작업 트리 내용이 마지막 커밋과 다름
	Commits   []GitCommit `json:"commits"`
}

var hashPattern = regexp.MustCompile(`^[0-9a-fA-F]{4,40}$`)

// runGit은 dir에서 git을 실행하고 표준출력을 돌려준다. 실패 시 stderr를
// 오류 메시지에 실어준다(git은 실패 이유를 stderr에만 쓴다).
func runGit(dir string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), gitTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	hideConsoleWindow(cmd) // GUI 빌드에서 콘솔 창이 깜빡이지 않게 (git_windows.go)
	var stderr strings.Builder
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = err.Error()
		}
		return "", errors.New(detail)
	}
	return string(out), nil
}

// gitRepoRoot는 프로젝트 루트를 품고 있는 저장소의 최상위 경로를 돌려준다.
// 프로젝트 루트가 저장소 루트와 같을 필요는 없다(하위 디렉토리여도 된다).
func (a *App) gitRepoRoot() (string, error) {
	out, err := runGit(a.projectRoot, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", err
	}
	// Windows에서도 슬래시 경로("C:/a/b")로 나온다 — 파일 경로 연산은
	// OS 표기로 통일해두는 편이 filepath.Rel/Join과 섞일 때 안전하다.
	return filepath.Clean(strings.TrimSpace(out)), nil
}

// repoRelPath는 프로젝트 상대 경로를 저장소 루트 기준 슬래시 경로로 바꾼다.
func repoRelPath(repoRoot, projectRoot, relPath string) (string, error) {
	full, err := resolveProjectPath(projectRoot, relPath)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(repoRoot, full)
	if err != nil {
		return "", err
	}
	rel = filepath.ToSlash(rel)
	if strings.HasPrefix(rel, "../") {
		return "", errors.New("파일이 git 저장소 밖에 있습니다")
	}
	return rel, nil
}

// literalPathspec는 pathspec을 글롭 해석 없이 문자 그대로 다루게 한다.
// 요소 파일명은 `[WP][2.0][2026.09.10]이름.md`처럼 대괄호를 포함하는데,
// git pathspec에서 `[...]`는 문자 클래스라 그냥 넘기면 매칭이 안 된다.
func literalPathspec(p string) string {
	return ":(literal)" + p
}

// GitFileHistory는 프로젝트 상대 경로 파일의 커밋 이력을 최신순으로 준다.
func (a *App) GitFileHistory(relPath string) (GitHistory, error) {
	if a.projectRoot == "" {
		return GitHistory{}, errors.New("열려 있는 프로젝트가 없습니다")
	}
	repoRoot, err := a.gitRepoRoot()
	if err != nil {
		// git 미설치("executable file not found")도, 비-git 폴더도 여기로 온다.
		log.Printf("GitFileHistory: repo lookup failed: %v", err)
		return GitHistory{Available: false, Reason: "git 저장소가 아니거나 git이 설치되어 있지 않습니다"}, nil
	}
	repoPath, err := repoRelPath(repoRoot, a.projectRoot, relPath)
	if err != nil {
		return GitHistory{Available: false, Reason: err.Error()}, nil
	}

	// --name-only를 같이 받는 이유: --follow가 리네임을 따라가면 커밋마다
	// 그 시점 경로가 달라서, 나중에 `git show <hash>:<path>`에 쓸 경로를
	// 커밋별로 알아야 한다. .loadstar 요소는 이름변경(RenameFile)과
	// 삭제(.del 덧붙이기)가 전부 rename이라 실제로 자주 걸린다.
	out, err := runGit(repoRoot,
		"-c", "core.quotepath=false", // 한글 파일명이 \xxx로 이스케이프되지 않게
		"log", "--follow", fmt.Sprintf("-n%d", gitHistoryLimit),
		"--format=%x1e%H%x1f%h%x1f%an%x1f%aI%x1f%s", "--name-only",
		"--", literalPathspec(repoPath),
	)
	if err != nil {
		log.Printf("GitFileHistory: log failed for %q: %v", repoPath, err)
		return GitHistory{Available: false, Reason: "이력을 읽지 못했습니다: " + err.Error()}, nil
	}

	commits := parseGitLog(out)
	if len(commits) == 0 {
		return GitHistory{Available: false, Reason: "아직 커밋된 적이 없는 파일입니다"}, nil
	}

	dirty := false
	if status, err := runGit(repoRoot, "status", "--porcelain", "--", literalPathspec(repoPath)); err == nil {
		dirty = strings.TrimSpace(status) != ""
	}
	return GitHistory{Available: true, Dirty: dirty, Commits: commits}, nil
}

// parseGitLog는 `--format=%x1e…%x1f…` + `--name-only` 출력을 파싱한다.
// 레코드 구분자 0x1e, 필드 구분자 0x1f — 커밋 제목이나 파일명에 나타날 수
// 없는 제어문자라 파이프/탭 같은 흔한 구분자와 달리 충돌 위험이 없다.
func parseGitLog(out string) []GitCommit {
	commits := []GitCommit{}
	for _, record := range strings.Split(out, "\x1e") {
		if strings.TrimSpace(record) == "" {
			continue
		}
		fields := strings.SplitN(record, "\x1f", 5)
		if len(fields) < 5 {
			continue
		}
		// 마지막 필드는 "제목\n\n경로\n…" — 제목(%s)은 첫 줄뿐이다.
		lines := strings.Split(strings.ReplaceAll(fields[4], "\r\n", "\n"), "\n")
		c := GitCommit{Hash: fields[0], Short: fields[1], Author: fields[2], Date: fields[3], Subject: lines[0]}
		for _, l := range lines[1:] {
			if strings.TrimSpace(l) != "" {
				c.Path = l // 그 커밋 시점의 경로(리네임 이후 이름)
				break
			}
		}
		commits = append(commits, c)
	}
	return commits
}

// GitFileAtCommit은 특정 커밋 시점의 파일 원문을 돌려준다. repoRelPath는
// GitFileHistory가 준 GitCommit.Path를 그대로 넘기면 된다.
func (a *App) GitFileAtCommit(repoRelPath string, hash string) (string, error) {
	if a.projectRoot == "" {
		return "", errors.New("열려 있는 프로젝트가 없습니다")
	}
	if !hashPattern.MatchString(hash) {
		return "", errors.New("올바르지 않은 커밋 해시입니다")
	}
	repoRoot, err := a.gitRepoRoot()
	if err != nil {
		return "", err
	}
	// 저장소 루트는 프로젝트 루트보다 위일 수 있다 — 저장소 기준 경로를
	// 그대로 신뢰하면 ReadFile의 경로 격리(resolveProjectPath)를 우회해
	// 프로젝트 밖 파일을 읽을 수 있게 된다. 여기서 다시 좁힌다.
	full := filepath.Clean(filepath.Join(repoRoot, filepath.FromSlash(repoRelPath)))
	if !strings.HasPrefix(full, a.projectRoot+string(filepath.Separator)) {
		return "", errors.New("path escapes project root")
	}
	out, err := runGit(repoRoot, "-c", "core.quotepath=false", "show", hash+":"+repoRelPath)
	if err != nil {
		log.Printf("GitFileAtCommit: show %s:%s failed: %v", hash, repoRelPath, err)
		return "", errors.New("해당 버전을 읽지 못했습니다: " + err.Error())
	}
	return out, nil
}

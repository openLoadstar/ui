package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx         context.Context
	projectRoot string
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods. No project is open yet — the frontend
// shows a project-picker screen first and calls OpenProject once the user
// chooses one.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if dir, err := appDataDir(); err == nil {
		setupLogging(dir)
	}
	log.Printf("startup: waiting for project selection")
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// resolveProjectRoot guesses a starting directory for the project-picker's
// folder dialog: the dev/build tree's own project root, if launched from
// inside one (build/bin/loadstar.exe -> project root two levels up), else
// the current working directory. It is only ever a suggested default now —
// OpenProject is what actually sets the active project.
func resolveProjectRoot() string {
	if exe, err := os.Executable(); err == nil {
		candidate := filepath.Join(filepath.Dir(exe), "..", "..")
		if abs, err := filepath.Abs(candidate); err == nil && isProjectRoot(abs) {
			return abs
		}
	}
	if wd, err := os.Getwd(); err == nil && isProjectRoot(wd) {
		return wd
	}
	if exe, err := os.Executable(); err == nil {
		return filepath.Dir(exe)
	}
	return "."
}

func isProjectRoot(dir string) bool {
	info, err := os.Stat(filepath.Join(dir, ".loadstar"))
	return err == nil && info.IsDir()
}

// appDataDir returns (creating if needed) %AppData%\loadstar on Windows —
// the app's per-user data directory. Recent-project/recent-file history and
// the debug log live here rather than next to the .exe or inside whichever
// project happens to be open, because: (1) the .exe may sit somewhere
// requiring elevation to write to (e.g. Program Files), (2) this data
// belongs to the user, not to a specific project or a specific copy of the
// binary, so it must survive rebuilding/moving the .exe and switching
// projects.
func appDataDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	appDir := filepath.Join(dir, "loadstar")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return "", err
	}
	return appDir, nil
}

// setupLogging routes log output to a file so failures are inspectable even
// when the app was launched without a console (double-click) and devtools
// are disabled in production builds.
func setupLogging(dir string) {
	logPath := filepath.Join(dir, "loadstar-debug.log")
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return // 로그 파일을 못 열어도 앱 자체는 계속 동작해야 한다
	}
	log.SetOutput(f)
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
}

// LogFrontendError lets the frontend forward errors into the same log file
// (the packaged app has no visible console).
func (a *App) LogFrontendError(message string) {
	log.Printf("[frontend] %s", message)
}

// resolveProjectPath resolves a project-relative path against the project
// root and rejects any path that escapes it.
func resolveProjectPath(root, relPath string) (string, error) {
	full := filepath.Join(root, relPath)
	if !strings.HasPrefix(full, root+string(os.PathSeparator)) && full != root {
		return "", errors.New("path escapes project root")
	}
	return full, nil
}

// ReadFile reads a project-relative file's content as UTF-8 text.
func (a *App) ReadFile(relPath string) (string, error) {
	if a.projectRoot == "" {
		return "", errors.New("열려 있는 프로젝트가 없습니다")
	}
	full, err := resolveProjectPath(a.projectRoot, relPath)
	if err != nil {
		log.Printf("ReadFile: invalid path %q: %v", relPath, err)
		return "", err
	}
	data, err := os.ReadFile(full)
	if err != nil {
		log.Printf("ReadFile: failed to read %q (resolved %s): %v", relPath, full, err)
		return "", err
	}
	log.Printf("ReadFile: ok %q (%d bytes)", relPath, len(data))
	return string(data), nil
}

// WriteFile writes UTF-8 text content to a project-relative file.
func (a *App) WriteFile(relPath string, content string) error {
	if a.projectRoot == "" {
		return errors.New("열려 있는 프로젝트가 없습니다")
	}
	full, err := resolveProjectPath(a.projectRoot, relPath)
	if err != nil {
		log.Printf("WriteFile: invalid path %q: %v", relPath, err)
		return err
	}
	if err := os.WriteFile(full, []byte(content), 0644); err != nil {
		log.Printf("WriteFile: failed to write %q (resolved %s): %v", relPath, full, err)
		return err
	}
	log.Printf("WriteFile: ok %q (%d bytes)", relPath, len(content))
	return nil
}

// DeleteFile removes a project-relative file. The project-root escape check
// mirrors ReadFile/WriteFile. Used by the group editor to delete GROUP files.
func (a *App) DeleteFile(relPath string) error {
	if a.projectRoot == "" {
		return errors.New("열려 있는 프로젝트가 없습니다")
	}
	full, err := resolveProjectPath(a.projectRoot, relPath)
	if err != nil {
		log.Printf("DeleteFile: invalid path %q: %v", relPath, err)
		return err
	}
	if err := os.Remove(full); err != nil {
		log.Printf("DeleteFile: failed to delete %q (resolved %s): %v", relPath, full, err)
		return err
	}
	log.Printf("DeleteFile: ok %q", relPath)
	return nil
}

// BrowseFile opens a native "open file" dialog scoped to markdown files and
// returns the absolute path chosen, or "" if the user cancelled. Unlike
// ReadFile/WriteFile, this is not restricted to the current project root —
// 탐색 is meant to reach any .md file on disk.
func (a *App) BrowseFile() (string, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "파일 탐색",
		Filters: []runtime.FileFilter{
			{DisplayName: "Markdown (*.md)", Pattern: "*.md"},
		},
	})
	if err != nil {
		log.Printf("BrowseFile: dialog error: %v", err)
		return "", err
	}
	log.Printf("BrowseFile: selected %q", path)
	return path, nil
}

// ReadExternalFile reads a file by absolute path, outside the project-root
// restriction ReadFile enforces. Only used for files explicitly picked via
// BrowseFile or the recent-files history — never derived from untrusted input.
func (a *App) ReadExternalFile(absPath string) (string, error) {
	data, err := os.ReadFile(absPath)
	if err != nil {
		log.Printf("ReadExternalFile: failed to read %q: %v", absPath, err)
		return "", err
	}
	log.Printf("ReadExternalFile: ok %q (%d bytes)", absPath, len(data))
	return string(data), nil
}

// RecentFile is one entry in the 탐색 history shown alongside the browse dialog.
type RecentFile struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	OpenedAt string `json:"openedAt"`
}

const maxRecentFiles = 20

// recentFilesPath lives under appDataDir (not the project root): browsed
// files aren't necessarily part of any one LOADSTAR project, so the history
// should persist across projects.
func recentFilesPath() (string, error) {
	dir, err := appDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "recent_files.json"), nil
}

// GetRecentFiles returns the 탐색 history, most recently opened first.
func (a *App) GetRecentFiles() ([]RecentFile, error) {
	path, err := recentFilesPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []RecentFile{}, nil
		}
		return nil, err
	}
	var entries []RecentFile
	if err := json.Unmarshal(data, &entries); err != nil {
		log.Printf("GetRecentFiles: corrupt history file, resetting: %v", err)
		return []RecentFile{}, nil
	}
	return entries, nil
}

// AddRecentFile records a browsed file at the front of the history,
// deduplicating and capping the list at maxRecentFiles.
func (a *App) AddRecentFile(absPath string) error {
	path, err := recentFilesPath()
	if err != nil {
		return err
	}
	entries, _ := a.GetRecentFiles()
	filtered := make([]RecentFile, 0, len(entries)+1)
	for _, e := range entries {
		if e.Path != absPath {
			filtered = append(filtered, e)
		}
	}
	filtered = append([]RecentFile{{
		Path:     absPath,
		Name:     filepath.Base(absPath),
		OpenedAt: time.Now().Format(time.RFC3339),
	}}, filtered...)
	if len(filtered) > maxRecentFiles {
		filtered = filtered[:maxRecentFiles]
	}
	data, err := json.MarshalIndent(filtered, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		log.Printf("AddRecentFile: failed to write history: %v", err)
		return err
	}
	return nil
}

// GetDefaultBrowseDir suggests a starting directory for the project-folder
// picker dialog.
func (a *App) GetDefaultBrowseDir() string {
	return resolveProjectRoot()
}

// BrowseProjectFolder opens a native "select folder" dialog and returns the
// chosen absolute path, or "" if the user cancelled.
func (a *App) BrowseProjectFolder() (string, error) {
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "LOADSTAR 프로젝트 폴더 선택",
		DefaultDirectory: resolveProjectRoot(),
	})
	if err != nil {
		log.Printf("BrowseProjectFolder: dialog error: %v", err)
		return "", err
	}
	log.Printf("BrowseProjectFolder: selected %q", path)
	return path, nil
}

// OpenProject switches the active project to dir, after checking it actually
// contains .loadstar/. Records it in the recent-projects history.
func (a *App) OpenProject(dir string) error {
	if !isProjectRoot(dir) {
		return fmt.Errorf("%s는 LOADSTAR 프로젝트가 아닙니다 (.loadstar 없음)", dir)
	}
	a.projectRoot = dir
	log.Printf("OpenProject: projectRoot=%s", dir)
	return a.addRecentProject(dir)
}

// RecentProject is one entry in the project-picker's "최근 프로젝트" list.
type RecentProject struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	OpenedAt string `json:"openedAt"`
}

const maxRecentProjects = 20

func recentProjectsPath() (string, error) {
	dir, err := appDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "recent_projects.json"), nil
}

// GetRecentProjects returns the project-open history, most recent first.
func (a *App) GetRecentProjects() ([]RecentProject, error) {
	path, err := recentProjectsPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []RecentProject{}, nil
		}
		return nil, err
	}
	var entries []RecentProject
	if err := json.Unmarshal(data, &entries); err != nil {
		log.Printf("GetRecentProjects: corrupt history file, resetting: %v", err)
		return []RecentProject{}, nil
	}
	return entries, nil
}

// addRecentProject records dir at the front of the history, deduplicating
// and capping the list at maxRecentProjects.
func (a *App) addRecentProject(dir string) error {
	path, err := recentProjectsPath()
	if err != nil {
		return err
	}
	entries, _ := a.GetRecentProjects()
	filtered := make([]RecentProject, 0, len(entries)+1)
	for _, e := range entries {
		if e.Path != dir {
			filtered = append(filtered, e)
		}
	}
	filtered = append([]RecentProject{{
		Path:     dir,
		Name:     filepath.Base(dir),
		OpenedAt: time.Now().Format(time.RFC3339),
	}}, filtered...)
	if len(filtered) > maxRecentProjects {
		filtered = filtered[:maxRecentProjects]
	}
	data, err := json.MarshalIndent(filtered, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		log.Printf("addRecentProject: failed to write history: %v", err)
		return err
	}
	return nil
}

var validFormatDirs = map[string]bool{"WP": true, "DWP": true, "GROUP": true, "OTHER": true}

// ListFormatFiles lists the .md filenames directly under .loadstar/<format>/,
// returned as project-relative paths (e.g. ".loadstar/GROUP/foo.md") using
// forward slashes to match the convention ReadFile/WriteFile already expect.
// This is a purpose-built stand-in for the 구조 추출기 (structural extractor,
// not yet built) — it does no parsing, just a directory listing. Expect it to
// be superseded once that WP lands.
func (a *App) ListFormatFiles(format string) ([]string, error) {
	if a.projectRoot == "" {
		return nil, errors.New("열려 있는 프로젝트가 없습니다")
	}
	if !validFormatDirs[format] {
		return nil, fmt.Errorf("알 수 없는 FORMAT: %s", format)
	}
	dir := filepath.Join(a.projectRoot, ".loadstar", format)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}
	files := []string{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		files = append(files, path.Join(".loadstar", format, e.Name()))
	}
	return files, nil
}

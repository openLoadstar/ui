// Go 백엔드(ReadFile/WriteFile) 브릿지.
//
// Wails 웹뷰 밖(순수 브라우저의 vite dev 서버)에서는 window.go가 주입되지 않으므로,
// 개발/미리보기 중에는 목업 콘텐츠로 대체한다. 실제 Wails 앱 안에서는 항상 Go 호출을 탄다.

import {
    ReadFile as goReadFile,
    WriteFile as goWriteFile,
    BrowseFile as goBrowseFile,
    ReadExternalFile as goReadExternalFile,
    GetRecentFiles as goGetRecentFiles,
    AddRecentFile as goAddRecentFile,
    GetDefaultBrowseDir as goGetDefaultBrowseDir,
    BrowseProjectFolder as goBrowseProjectFolder,
    OpenProject as goOpenProject,
    GetRecentProjects as goGetRecentProjects,
    ListFormatFiles as goListFormatFiles,
    DeleteFile as goDeleteFile,
    CreateElement as goCreateElement,
    RenameFile as goRenameFile,
    GetOtherExtensions as goGetOtherExtensions,
    SetOtherExtensions as goSetOtherExtensions,
    ListOtherFileExtensions as goListOtherFileExtensions,
    Reindex as goReindex,
    ListAllFilesWithModTime as goListAllFilesWithModTime,
} from "../wailsjs/go/main/App";
import type { main } from "../wailsjs/go/models";
// 개발 중 브라우저 미리보기 전용 — 실제 WP 파일을 그대로 읽어와 목업으로 쓴다(내용 중복 없음).
import structuralExtractorRaw from "../../.loadstar/WP/[WP][2.0][2026.07.27]구조 추출기.md?raw";

function isWailsRuntimeAvailable(): boolean {
    return typeof window !== "undefined" && !!(window as unknown as { go?: unknown }).go;
}

const mockStore: Record<string, string> = {
    ".loadstar/WP/[WP][2.0][2026.07.27]구조 추출기.md": structuralExtractorRaw,
    "__default__": [
        "# 브라우저 미리보기 모드",
        "",
        "Wails 앱 밖(vite dev 서버)에서 열람 중이라 실제 파일을 읽지 못했습니다.",
        "",
        "```mermaid",
        "flowchart LR",
        "    Browser[브라우저 미리보기] -->|window.go 없음| Mock[목업 콘텐츠]",
        "    Wails[Wails 앱] -->|window.go 사용 가능| Real[실제 파일]",
        "```",
    ].join("\n"),
};

export async function readProjectFile(path: string): Promise<string> {
    if (isWailsRuntimeAvailable()) {
        return goReadFile(path);
    }
    return mockStore[path] ?? mockStore["__default__"];
}

export async function writeProjectFile(path: string, content: string): Promise<void> {
    if (isWailsRuntimeAvailable()) {
        await goWriteFile(path, content);
        return;
    }
    mockStore[path] = content;
    const format = path.split("/")[1]; // ".loadstar/GROUP/foo.md" -> "GROUP"
    const listing = format && mockDirListing[format];
    if (listing && !listing.includes(path)) listing.push(path);
}

/** 네이티브 "파일 열기" 다이얼로그를 띄운다. 취소 시 빈 문자열을 반환한다. */
export async function browseFile(): Promise<string> {
    if (isWailsRuntimeAvailable()) {
        return goBrowseFile();
    }
    return "";
}

/** 프로젝트 루트 제한 없이 절대 경로로 파일을 읽는다(탐색 기능 전용). */
export async function readExternalFile(absPath: string): Promise<string> {
    if (isWailsRuntimeAvailable()) {
        return goReadExternalFile(absPath);
    }
    return mockStore[absPath] ?? mockStore["__default__"];
}

const mockRecentFiles: main.RecentFile[] = [];

/** 탐색 히스토리(최근 열어본 순)를 가져온다. */
export async function getRecentFiles(): Promise<main.RecentFile[]> {
    if (isWailsRuntimeAvailable()) {
        return goGetRecentFiles();
    }
    return mockRecentFiles;
}

/** 탐색 히스토리에 항목을 추가(맨 앞으로)한다. */
export async function addRecentFile(absPath: string): Promise<void> {
    if (isWailsRuntimeAvailable()) {
        await goAddRecentFile(absPath);
        return;
    }
    const idx = mockRecentFiles.findIndex((e) => e.path === absPath);
    if (idx !== -1) mockRecentFiles.splice(idx, 1);
    mockRecentFiles.unshift({ path: absPath, name: absPath.split(/[\\/]/).pop() ?? absPath, openedAt: new Date().toISOString() });
}

/** 개발 중 브라우저 미리보기용 목업 콘텐츠를 등록한다. Wails 런타임에서는 무시된다. */
export function seedMockFile(path: string, content: string): void {
    mockStore[path] = content;
}

/** 프로젝트 폴더 다이얼로그의 시작 위치로 쓸 기본 디렉토리. */
export async function getDefaultBrowseDir(): Promise<string> {
    if (isWailsRuntimeAvailable()) {
        return goGetDefaultBrowseDir();
    }
    return "";
}

/** 네이티브 "폴더 선택" 다이얼로그를 띄운다. 취소 시 빈 문자열을 반환한다. */
export async function browseProjectFolder(): Promise<string> {
    if (isWailsRuntimeAvailable()) {
        return goBrowseProjectFolder();
    }
    // 브라우저 미리보기에는 네이티브 다이얼로그가 없으니 고정된 목업 경로로 대체한다.
    return "C:\\mock\\project";
}

/** 프로젝트를 연다(.loadstar 존재 확인 후 활성 프로젝트로 전환 + 히스토리 기록). */
export async function openProject(path: string): Promise<void> {
    if (isWailsRuntimeAvailable()) {
        await goOpenProject(path);
        return;
    }
    // 브라우저 미리보기에는 실제 파일시스템이 없으니 항상 성공한 것으로 취급한다.
}

const mockRecentProjects: main.RecentProject[] = [];

/** 프로젝트 열기 히스토리(최근 연 순)를 가져온다. */
export async function getRecentProjects(): Promise<main.RecentProject[]> {
    if (isWailsRuntimeAvailable()) {
        return goGetRecentProjects();
    }
    return mockRecentProjects;
}

const mockDirListing: Record<string, string[]> = {
    WP: [
        ".loadstar/WP/[WP][2.0][2026.07.27]구조 추출기.md",
        ".loadstar/WP/[WP][2.0][2026.07.27]md Mermaid 뷰어.md",
        ".loadstar/WP/[WP][2.0][2026.07.27]온디맨드 도메인 조회기.md",
        ".loadstar/WP/[WP][2.0][2026.07.27]탐색기 셸.md",
        ".loadstar/WP/[WP][2.0][2026.07.27]CLI 진입점.md",
    ],
    DWP: [],
    GROUP: [],
    OTHER: [],
};

/**
 * .loadstar/<format>/ 아래 .md 파일 목록을 project-relative 경로로 가져온다.
 * 구조 추출기가 아직 없어서 이 기능(그룹 편집기) 전용으로 만든 단순 디렉토리
 * 나열 — 추후 구조 추출기가 대체할 수 있다.
 */
export async function listFormatFiles(format: string): Promise<string[]> {
    if (isWailsRuntimeAvailable()) {
        return goListFormatFiles(format);
    }
    return mockDirListing[format] ?? [];
}

// OTHER는 `[FORMAT][VER][DATE]이름.md` 명명 규칙이 면제되는 유일한 FORMAT이라
// (`02.ELEMENT_FORMAT.md` §1), 확장자 무관하게 전부 보여주면 바이너리 파일까지
// 미리보기가 깨진 채로 트리에 섞인다. 대신 전역 설정(허용 확장자 목록)으로
// 걸러서 보여준다 — 기본값은 텍스트로 안전하게 열리는 확장자들.
let mockOtherExtensions = [".md", ".txt", ".json", ".csv", ".yaml", ".yml", ".log", ".xml"];

/** 현재 OTHER 목록에 적용 중인 허용 확장자(소문자, `.` 포함)를 가져온다. */
export async function getOtherExtensions(): Promise<string[]> {
    if (isWailsRuntimeAvailable()) {
        return goGetOtherExtensions();
    }
    return mockOtherExtensions;
}

/** OTHER 목록에 적용할 허용 확장자를 저장한다(전역 설정 — 프로젝트 무관). */
export async function setOtherExtensions(exts: string[]): Promise<void> {
    if (isWailsRuntimeAvailable()) {
        await goSetOtherExtensions(exts);
        return;
    }
    mockOtherExtensions = exts;
}

/** 현재 프로젝트의 .loadstar/OTHER/에 실제로 존재하는 확장자 목록(필터 무관)을 가져온다. */
export async function listOtherFileExtensions(): Promise<string[]> {
    if (isWailsRuntimeAvailable()) {
        return goListOtherFileExtensions();
    }
    return [];
}

// 브라우저 미리보기 전용 — 실제 스캐폴딩 내용은 Go 쪽(app.go: CreateElement,
// cli.go: createElement/scaffoldContent)이 유일한 출처. GUI/CLI가 같은 로직을
// 공유하게 하려고 일부러 프론트엔드엔 진짜 스캐폴딩을 다시 만들지 않았다 —
// 여기 건 미리보기 화면에 뭔가 보여주기 위한 목업일 뿐이다.
const mockScaffoldByFormat: Record<string, (name: string) => string> = {
    WP: (name) => `## [STATUS] S_IDL\n\n### IDENTITY\n- SUMMARY: ${name}\n\n### CONNECTIONS\n- CHILDREN: []\n- REFERENCE: []\n\n### TODO\n# TASK\n- [ ] \n`,
    DWP: (name) => `### IDENTITY\n- SUMMARY: ${name}\n\n### CONNECTIONS\n- REFERENCE: []\n`,
};

function formatDateYYYYMMDD(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** WP/DWP 파일을 스캐폴딩해서 생성하고 project-relative 경로를 반환한다. */
export async function createElement(format: string, name: string): Promise<string> {
    if (isWailsRuntimeAvailable()) {
        return goCreateElement(format, name);
    }
    const upper = format.toUpperCase();
    const filename = `[${upper}][2.0][${formatDateYYYYMMDD(new Date())}]${name}.md`;
    const path = `.loadstar/${upper}/${filename}`;
    const listing = mockDirListing[upper];
    if (listing?.includes(path)) {
        throw new Error(`이미 같은 이름의 ${upper}가 있습니다: ${filename}`);
    }
    mockStore[path] = mockScaffoldByFormat[upper]?.(name) ?? "";
    listing?.push(path);
    return path;
}

/** project-relative 경로의 파일을 삭제한다. 되돌릴 수 없다. */
export async function deleteProjectFile(path: string): Promise<void> {
    if (isWailsRuntimeAvailable()) {
        await goDeleteFile(path);
        return;
    }
    delete mockStore[path];
    const format = path.split("/")[1];
    const listing = format && mockDirListing[format];
    if (listing) {
        const idx = listing.indexOf(path);
        if (idx !== -1) listing.splice(idx, 1);
    }
}

/** 구조 추출기(extractor.go)를 수동 실행해 .loadstar/.cache/index.db를 재생성한다. */
export async function reindexProject(): Promise<main.ReindexStats> {
    if (isWailsRuntimeAvailable()) {
        return goReindex();
    }
    // 브라우저 미리보기엔 실제 파일시스템이 없으니 그럴듯한 고정값으로 대체한다.
    return { Nodes: 11, Edges: 24, BrokenEdges: 2 } as main.ReindexStats;
}

/** 날짜별 보기(dateTreeView.ts) 전용 — WP/DWP/GROUP/OTHER 전체를 mtime과 함께 가져온다. */
export async function listAllFilesWithModTime(): Promise<main.DatedFile[]> {
    if (isWailsRuntimeAvailable()) {
        return goListAllFilesWithModTime();
    }
    const allPaths = Object.values(mockDirListing).flat();
    const now = Date.now();
    return allPaths.map((path, i) => ({
        path,
        // 목업이라 실제 mtime이 없다 — 목록 순서대로 하루씩 차이 나는 값을 만들어 정렬 확인용으로 쓴다.
        modTime: new Date(now - i * 86_400_000).toISOString(),
    })) as main.DatedFile[];
}

/** project-relative 경로의 파일을 새 project-relative 경로로 옮긴다. 대상이 이미 있으면 실패. */
export async function renameProjectFile(oldPath: string, newPath: string): Promise<void> {
    if (isWailsRuntimeAvailable()) {
        await goRenameFile(oldPath, newPath);
        return;
    }
    if (mockStore[newPath] !== undefined) {
        throw new Error(`이미 같은 이름의 파일이 있습니다: ${newPath.split("/").pop()}`);
    }
    mockStore[newPath] = mockStore[oldPath] ?? "";
    delete mockStore[oldPath];
    const format = oldPath.split("/")[1];
    const listing = format && mockDirListing[format];
    if (listing) {
        const idx = listing.indexOf(oldPath);
        if (idx !== -1) listing[idx] = newPath;
        else listing.push(newPath);
    }
}

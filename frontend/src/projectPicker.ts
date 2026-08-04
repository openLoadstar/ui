// 프로젝트(홈 디렉토리) 선택 — 시작 화면(전체 화면 버전)과
// 파일 > 프로젝트 열기(모달 버전)에서 공용으로 쓴다.

import { getRecentProjects, browseProjectFolder, openProject } from "./fs";
import { logError, logInfo } from "./log";
import type { main } from "../wailsjs/go/models";

async function tryOpen(
    path: string,
    onOpened: (root: string) => void,
    showError: (msg: string) => void,
): Promise<void> {
    try {
        await openProject(path);
        logInfo(`프로젝트 열기 성공: ${path}`);
        onOpened(path);
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        logError(`프로젝트 열기 실패: ${path}`, err);
        showError(detail);
    }
}

function renderRecentList(
    container: HTMLElement,
    recent: main.RecentProject[],
    onSelect: (path: string) => void,
): void {
    if (recent.length === 0) {
        container.innerHTML = `<div class="modal-empty">아직 열어본 프로젝트가 없습니다.</div>`;
        return;
    }
    const list = document.createElement("ul");
    list.className = "recent-list";
    for (const entry of recent) {
        const li = document.createElement("li");
        li.className = "recent-item";
        li.innerHTML = `<span class="recent-item-name"></span><span class="recent-item-path"></span>`;
        li.querySelector(".recent-item-name")!.textContent = entry.name;
        li.querySelector(".recent-item-path")!.textContent = entry.path;
        li.addEventListener("click", () => onSelect(entry.path));
        list.appendChild(li);
    }
    container.innerHTML = "";
    container.appendChild(list);
}

function wireBrowseAndList(
    root: HTMLElement,
    handleOpen: (path: string) => void,
): void {
    const errorEl = root.querySelector<HTMLElement>(".picker-error")!;
    const listContainer = root.querySelector<HTMLElement>(".recent-list-container")!;

    root.querySelector('[data-role="browse"]')!.addEventListener("click", () => {
        void (async () => {
            try {
                const path = await browseProjectFolder();
                if (!path) return; // 취소
                errorEl.hidden = true;
                handleOpen(path);
            } catch (err) {
                logError("프로젝트 폴더 다이얼로그 오류", err);
            }
        })();
    });

    void (async () => {
        const recent = await getRecentProjects();
        renderRecentList(listContainer, recent, handleOpen);
    })();
}

const pickerBodyHtml = `
    <button class="tb-btn modal-browse-btn" data-role="browse">📂 폴더 찾아보기...</button>
    <div class="picker-error" hidden></div>
    <div class="modal-section-label">최근 프로젝트</div>
    <div class="recent-list-container"></div>
`;

/** 최초 시작 화면 — 프로젝트를 고를 때까지 #app 전체를 차지한다. */
export function renderProjectPickerScreen(container: HTMLElement, onOpened: (root: string) => void): void {
    container.innerHTML = `
        <div class="picker-screen">
            <div class="picker-card">
                <div class="picker-title">LOADSTAR 프로젝트 열기</div>
                ${pickerBodyHtml}
            </div>
        </div>
    `;
    const errorEl = container.querySelector<HTMLElement>(".picker-error")!;
    const showError = (msg: string) => {
        errorEl.hidden = false;
        errorEl.textContent = `⚠️ ${msg}`;
    };
    wireBrowseAndList(container, (path) => void tryOpen(path, onOpened, showError));
}

/** 파일 > 프로젝트 열기 — 이미 프로젝트가 열려 있는 상태에서 다른 프로젝트로 전환한다. */
export function openProjectPickerModal(onOpened: (root: string) => void): void {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="modal-box">
            <div class="modal-header">
                <span class="modal-title">프로젝트 열기</span>
                <span class="modal-close">×</span>
            </div>
            <div class="modal-body">${pickerBodyHtml}</div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
    });
    overlay.querySelector(".modal-close")!.addEventListener("click", close);

    const errorEl = overlay.querySelector<HTMLElement>(".picker-error")!;
    const showError = (msg: string) => {
        errorEl.hidden = false;
        errorEl.textContent = `⚠️ ${msg}`;
    };
    wireBrowseAndList(overlay, (path) =>
        void tryOpen(
            path,
            (openedRoot) => {
                close();
                onOpened(openedRoot);
            },
            showError,
        ),
    );
}

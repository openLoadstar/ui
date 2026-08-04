// 파일 > 탐색: 네이티브 파일 다이얼로그 + 최근 탐색 히스토리를 한 화면에서 제공한다.

import { browseFile, getRecentFiles, addRecentFile } from "./fs";
import { logError } from "./log";
import type { TabManager } from "./tabs";

export async function openBrowseModal(tabs: TabManager): Promise<void> {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="modal-box">
            <div class="modal-header">
                <span class="modal-title">파일 탐색</span>
                <span class="modal-close">×</span>
            </div>
            <div class="modal-body">
                <button class="tb-btn modal-browse-btn" data-role="browse">📂 찾아보기...</button>
                <div class="modal-section-label">최근 탐색한 파일</div>
                <div class="recent-list-container"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
    });
    overlay.querySelector(".modal-close")!.addEventListener("click", close);

    const listContainer = overlay.querySelector<HTMLElement>(".recent-list-container")!;

    async function refreshRecentList(): Promise<void> {
        const recent = await getRecentFiles();
        if (recent.length === 0) {
            listContainer.innerHTML = `<div class="modal-empty">아직 탐색한 파일이 없습니다.</div>`;
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
            li.addEventListener("click", () => void openAndClose(entry.path));
            list.appendChild(li);
        }
        listContainer.innerHTML = "";
        listContainer.appendChild(list);
    }

    async function openAndClose(path: string): Promise<void> {
        close();
        await tabs.openExternal(path);
        await addRecentFile(path);
    }

    overlay.querySelector('[data-role="browse"]')!.addEventListener("click", () => {
        void (async () => {
            try {
                const path = await browseFile();
                if (!path) return; // 취소
                await openAndClose(path);
            } catch (err) {
                logError("파일 탐색 다이얼로그 오류", err);
            }
        })();
    });

    await refreshRecentList();
}

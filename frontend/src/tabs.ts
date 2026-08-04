// 우측 탭 영역 관리 — 탭 열기/닫기/전환 + 보기·편집 모드 + 저장.

import type { ElementFormat, TreeNode } from "./tree";
import { readProjectFile, writeProjectFile, readExternalFile } from "./fs";
import { renderMarkdown } from "./viewer";
import { validateContent } from "./validate";
import { logInfo, logError } from "./log";

type Mode = "view" | "edit";

interface Tab {
    id: string;
    title: string;
    path: string;
    format: ElementFormat | "EXTERNAL";
    /** 탐색(파일 메뉴)으로 프로젝트 밖에서 불러온 파일인지 — 읽기 전용으로만 다룬다. */
    external: boolean;
    content: string;
    mode: Mode;
    dirty: boolean;
    /** 파일을 읽지 못해 오류 메시지를 대신 담고 있는 탭인지 */
    loadFailed: boolean;
}

function fileNameOf(path: string): string {
    return path.split(/[\\/]/).pop() ?? path;
}

export class TabManager {
    private tabs: Tab[] = [];
    private activeId: string | null = null;
    private tabScrollEl: HTMLElement;
    private prevBtn: HTMLButtonElement;
    private nextBtn: HTMLButtonElement;

    constructor(
        private tabBarEl: HTMLElement,
        private contentEl: HTMLElement,
    ) {
        // 탭이 넘칠 때 네이티브 스크롤바(항상 탭 줄 바로 아래에 붙어 어색한 위치) 대신
        // 좌우 버튼으로 넘긴다. 트랙패드/휠 스크롤은 계속 되게 두고, 스크롤바만 숨긴다.
        this.tabBarEl.innerHTML = `
            <button class="tab-scroll-btn" data-role="tab-scroll-prev" aria-label="이전 탭">‹</button>
            <div class="tab-scroll"></div>
            <button class="tab-scroll-btn" data-role="tab-scroll-next" aria-label="다음 탭">›</button>
        `;
        this.tabScrollEl = this.tabBarEl.querySelector<HTMLElement>(".tab-scroll")!;
        this.prevBtn = this.tabBarEl.querySelector<HTMLButtonElement>('[data-role="tab-scroll-prev"]')!;
        this.nextBtn = this.tabBarEl.querySelector<HTMLButtonElement>('[data-role="tab-scroll-next"]')!;

        this.prevBtn.addEventListener("click", () => this.scrollTabs(-1));
        this.nextBtn.addEventListener("click", () => this.scrollTabs(1));
        this.tabScrollEl.addEventListener("scroll", () => this.updateScrollButtons());
        window.addEventListener("resize", () => this.updateScrollButtons());
    }

    private scrollTabs(direction: 1 | -1): void {
        const amount = Math.round(this.tabScrollEl.clientWidth * 0.8) * direction;
        this.tabScrollEl.scrollBy({ left: amount }); // 즉시 이동 — 버튼 활성/비활성 상태를 애니메이션 타이밍과 무관하게 정확히 유지
        this.updateScrollButtons();
    }

    private updateScrollButtons(): void {
        const el = this.tabScrollEl;
        const overflowing = el.scrollWidth > el.clientWidth + 1;
        this.tabBarEl.classList.toggle("tab-bar--overflowing", overflowing);
        this.prevBtn.disabled = el.scrollLeft <= 0;
        this.nextBtn.disabled = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    }

    async open(node: TreeNode): Promise<void> {
        const existing = this.tabs.find((t) => t.path === node.path);
        if (existing) {
            this.activeId = existing.id;
            logInfo(`탭 활성화: ${node.name} (${node.path})`);
            await this.renderActive();
            return;
        }

        let content: string;
        let loadFailed = false;
        try {
            content = await readProjectFile(node.path);
            logInfo(`파일 읽기 성공: ${node.path} (${content.length}자)`);
        } catch (err) {
            logError(`파일 읽기 실패: ${node.path}`, err);
            const detail = err instanceof Error ? err.message : String(err);
            content = `⚠️ 파일을 읽지 못했습니다.\n\n- 경로: ${node.path}\n- 오류: ${detail}`;
            loadFailed = true;
        }

        const tab: Tab = {
            id: crypto.randomUUID(),
            title: node.name,
            path: node.path,
            format: node.format,
            external: false,
            content,
            mode: "view",
            dirty: false,
            loadFailed,
        };
        this.tabs.push(tab);
        this.activeId = tab.id;
        await this.renderActive();
    }

    /** 탐색(파일 > 탐색)으로 프로젝트 밖 파일을 절대 경로로 연다. 읽기 전용. */
    async openExternal(absPath: string): Promise<void> {
        const existing = this.tabs.find((t) => t.external && t.path === absPath);
        if (existing) {
            this.activeId = existing.id;
            logInfo(`탭 활성화: ${absPath}`);
            await this.renderActive();
            return;
        }

        let content: string;
        let loadFailed = false;
        try {
            content = await readExternalFile(absPath);
            logInfo(`외부 파일 읽기 성공: ${absPath} (${content.length}자)`);
        } catch (err) {
            logError(`외부 파일 읽기 실패: ${absPath}`, err);
            const detail = err instanceof Error ? err.message : String(err);
            content = `⚠️ 파일을 읽지 못했습니다.\n\n- 경로: ${absPath}\n- 오류: ${detail}`;
            loadFailed = true;
        }

        const tab: Tab = {
            id: crypto.randomUUID(),
            title: fileNameOf(absPath),
            path: absPath,
            format: "EXTERNAL",
            external: true,
            content,
            mode: "view",
            dirty: false,
            loadFailed,
        };
        this.tabs.push(tab);
        this.activeId = tab.id;
        await this.renderActive();
    }

    /**
     * 열려 있는 모든 탭을 디스크에서 다시 읽는다(외부에서 파일이 바뀐 경우 대응).
     * 저장 안 한 변경사항(dirty)이 있는 탭은 덮어쓰지 않고 건너뛴다.
     */
    async refreshAll(): Promise<number> {
        let refreshed = 0;
        for (const tab of this.tabs) {
            if (tab.dirty) continue;
            try {
                tab.content = tab.external ? await readExternalFile(tab.path) : await readProjectFile(tab.path);
                tab.loadFailed = false;
                refreshed++;
            } catch (err) {
                logError(`새로고침 실패: ${tab.path}`, err);
            }
        }
        await this.renderActive();
        return refreshed;
    }

    async close(id: string): Promise<void> {
        const idx = this.tabs.findIndex((t) => t.id === id);
        if (idx === -1) return;

        const tab = this.tabs[idx];
        if (tab.dirty && !confirm(`"${tab.title}"에 저장하지 않은 변경사항이 있습니다. 닫을까요?`)) {
            return;
        }

        this.tabs.splice(idx, 1);
        if (this.activeId === id) {
            const fallback = this.tabs[idx] ?? this.tabs[idx - 1];
            this.activeId = fallback ? fallback.id : null;
        }
        await this.renderActive();
    }

    async activate(id: string): Promise<void> {
        this.activeId = id;
        await this.renderActive();
    }

    private activeTab(): Tab | undefined {
        return this.tabs.find((t) => t.id === this.activeId);
    }

    private toggleMode(): void {
        const tab = this.activeTab();
        if (!tab || tab.external) return;
        tab.mode = tab.mode === "view" ? "edit" : "view";
        void this.renderActive();
    }

    private async save(): Promise<void> {
        const tab = this.activeTab();
        if (!tab || tab.external) return;

        const result = validateContent(tab.format as ElementFormat, tab.content);
        if (!result.valid) {
            const proceed = confirm(
                `${tab.format} 형식 검사에서 문제가 발견됐습니다:\n\n- ${result.issues.join("\n- ")}\n\n그래도 저장할까요?`,
            );
            if (!proceed) return;
        }

        try {
            await writeProjectFile(tab.path, tab.content);
            logInfo(`파일 저장 성공: ${tab.path}`);
        } catch (err) {
            logError(`파일 저장 실패: ${tab.path}`, err);
            alert(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }

        tab.dirty = false;
        tab.mode = "view";
        await this.renderActive();
    }

    private renderTabBar(): void {
        this.tabScrollEl.innerHTML = "";
        let activeEl: HTMLElement | null = null;
        for (const tab of this.tabs) {
            const el = document.createElement("div");
            el.className = "tab" + (tab.id === this.activeId ? " tab--active" : "");
            const dirtyMark = tab.dirty ? '<span class="tab-dirty">●</span>' : "";
            const errorMark = tab.loadFailed ? '<span class="tab-error">⚠</span>' : "";
            el.innerHTML = `${errorMark}<span class="tab-title"></span>${dirtyMark}<span class="tab-close">×</span>`;
            el.querySelector(".tab-title")!.textContent = tab.title;
            el.querySelector<HTMLElement>(".tab-title")!.addEventListener("click", () => void this.activate(tab.id));
            el.querySelector<HTMLElement>(".tab-close")!.addEventListener("click", () => void this.close(tab.id));
            this.tabScrollEl.appendChild(el);
            if (tab.id === this.activeId) activeEl = el;
        }
        this.updateScrollButtons();
        activeEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    private async renderActive(): Promise<void> {
        this.renderTabBar();

        const tab = this.activeTab();
        if (!tab) {
            this.contentEl.innerHTML = `<div class="viewer-empty">좌측 트리에서 항목을 선택하세요</div>`;
            return;
        }

        const editControls = tab.external
            ? '<span class="viewer-external-badge">읽기 전용 (탐색됨)</span>'
            : `<button class="tb-btn" data-role="toggle-mode"></button>
               <button class="tb-btn" data-role="save" ${tab.mode === "edit" ? "" : "disabled"}>저장</button>`;

        this.contentEl.innerHTML = `
            <div class="viewer-toolbar">
                <span class="viewer-path"></span>
                <span class="viewer-toolbar-spacer"></span>
                ${editControls}
            </div>
            <div class="viewer-body"></div>
        `;
        this.contentEl.querySelector(".viewer-path")!.textContent = tab.path;

        if (!tab.external) {
            const toggleBtn = this.contentEl.querySelector<HTMLButtonElement>('[data-role="toggle-mode"]')!;
            toggleBtn.textContent = tab.mode === "view" ? "✎ 편집" : "👁 미리보기";
            toggleBtn.addEventListener("click", () => this.toggleMode());

            this.contentEl
                .querySelector<HTMLElement>('[data-role="save"]')!
                .addEventListener("click", () => void this.save());
        }

        const body = this.contentEl.querySelector<HTMLElement>(".viewer-body")!;
        if (tab.mode === "edit") {
            body.innerHTML = `<textarea class="editor-textarea" spellcheck="false"></textarea>`;
            const textarea = body.querySelector<HTMLTextAreaElement>(".editor-textarea")!;
            textarea.value = tab.content;
            textarea.addEventListener("input", () => {
                tab.content = textarea.value;
                if (!tab.dirty) {
                    tab.dirty = true;
                    this.renderTabBar();
                }
            });
        } else {
            body.innerHTML = `<div class="md-viewer"></div>`;
            const viewerEl = body.querySelector<HTMLElement>(".md-viewer")!;
            try {
                await renderMarkdown(viewerEl, tab.content);
            } catch (err) {
                logError(`렌더링 실패: ${tab.path}`, err);
                viewerEl.innerHTML = `<div class="viewer-empty">⚠️ 렌더링 중 오류가 발생했습니다. 콘솔/로그를 확인하세요.</div>`;
            }
        }
    }
}

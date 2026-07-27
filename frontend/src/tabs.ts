// 우측 탭 영역 관리.
//
// TODO(md Mermaid 뷰어 WP): 지금은 탭 콘텐츠에 파일명만 표시한다.
// md 렌더링/편집/mermaid 표시는 별도 WP 범위이며, 이 모듈은 탭 열기·닫기·전환만 담당한다.

export interface Tab {
    id: string;
    title: string;
}

export class TabManager {
    private tabs: Tab[] = [];
    private activeId: string | null = null;

    constructor(
        private tabBarEl: HTMLElement,
        private contentEl: HTMLElement,
    ) {}

    open(title: string): void {
        const existing = this.tabs.find((t) => t.title === title);
        if (existing) {
            this.activate(existing.id);
            return;
        }
        const tab: Tab = { id: crypto.randomUUID(), title };
        this.tabs.push(tab);
        this.activate(tab.id);
    }

    close(id: string): void {
        const idx = this.tabs.findIndex((t) => t.id === id);
        if (idx === -1) return;
        this.tabs.splice(idx, 1);

        if (this.activeId === id) {
            const fallback = this.tabs[idx] ?? this.tabs[idx - 1];
            this.activeId = fallback ? fallback.id : null;
        }
        this.render();
    }

    activate(id: string): void {
        this.activeId = id;
        this.render();
    }

    private render(): void {
        this.tabBarEl.innerHTML = "";
        for (const tab of this.tabs) {
            const el = document.createElement("div");
            el.className = "tab" + (tab.id === this.activeId ? " tab--active" : "");
            el.innerHTML = `<span class="tab-title"></span><span class="tab-close">×</span>`;
            el.querySelector(".tab-title")!.textContent = tab.title;
            el.querySelector(".tab-title")!.addEventListener("click", () => this.activate(tab.id));
            el.querySelector(".tab-close")!.addEventListener("click", (e) => {
                e.stopPropagation();
                this.close(tab.id);
            });
            this.tabBarEl.appendChild(el);
        }

        const active = this.tabs.find((t) => t.id === this.activeId);
        this.contentEl.innerHTML = active
            ? `<div class="viewer-placeholder">📄 <strong></strong><p>md/Mermaid 뷰어는 별도 WP에서 구현 예정</p></div>`
            : `<div class="viewer-empty">좌측 트리에서 항목을 선택하세요</div>`;
        if (active) {
            this.contentEl.querySelector("strong")!.textContent = active.title;
        }
    }
}

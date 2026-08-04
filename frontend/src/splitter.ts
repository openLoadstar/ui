// 트리/탭 패널 사이의 드래그로 크기 조정 가능한 구분선.

export function initSplitter(
    splitterEl: HTMLElement,
    leftPanel: HTMLElement,
    options?: { min?: number; max?: number },
): void {
    const min = options?.min ?? 160;
    const max = options?.max ?? 640;

    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    splitterEl.addEventListener("mousedown", (e) => {
        dragging = true;
        startX = e.clientX;
        startWidth = leftPanel.getBoundingClientRect().width;
        splitterEl.classList.add("splitter--dragging");
        document.body.classList.add("resizing-col");
        e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const next = Math.min(max, Math.max(min, startWidth + (e.clientX - startX)));
        leftPanel.style.width = `${next}px`;
    });

    window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        splitterEl.classList.remove("splitter--dragging");
        document.body.classList.remove("resizing-col");
    });
}

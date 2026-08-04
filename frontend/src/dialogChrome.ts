// 모달 대화상자에 드래그 이동 + 리사이즈를 붙이는 유틸리티.
// splitter.ts와 동일한 mousedown/mousemove/mouseup 패턴.

/** 헤더(handle)를 드래그해서 box를 옮길 수 있게 한다. 처음 드래그하는 순간 flex 중앙정렬에서 고정 좌표로 전환된다. */
export function makeDraggable(box: HTMLElement, handle: HTMLElement): void {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    handle.addEventListener("mousedown", (e) => {
        if ((e.target as HTMLElement).closest(".modal-close")) return; // 닫기 버튼은 드래그 아님
        dragging = true;
        const rect = box.getBoundingClientRect();
        toFixedPosition(box, rect);
        startLeft = rect.left;
        startTop = rect.top;
        startX = e.clientX;
        startY = e.clientY;
        e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const rect = box.getBoundingClientRect();
        const maxLeft = window.innerWidth - 80;
        const maxTop = window.innerHeight - 40;
        const left = clamp(startLeft + (e.clientX - startX), -(rect.width - 80), maxLeft);
        const top = clamp(startTop + (e.clientY - startY), 0, maxTop);
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
    });

    window.addEventListener("mouseup", () => {
        dragging = false;
    });
}

/** box 우하단에 리사이즈 손잡이를 붙인다. */
export function makeResizable(box: HTMLElement, opts?: { minWidth?: number; minHeight?: number }): void {
    const minWidth = opts?.minWidth ?? 400;
    const minHeight = opts?.minHeight ?? 300;

    const handle = document.createElement("div");
    handle.className = "dialog-resize-handle";
    box.appendChild(handle);

    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    handle.addEventListener("mousedown", (e) => {
        resizing = true;
        const rect = box.getBoundingClientRect();
        toFixedPosition(box, rect);
        box.style.maxHeight = "none"; // CSS max-height 대신 이제부터 JS가 높이를 직접 제어
        startWidth = rect.width;
        startHeight = rect.height;
        startX = e.clientX;
        startY = e.clientY;
        e.preventDefault();
        e.stopPropagation(); // 헤더 드래그 리스너로 번지지 않게
    });

    window.addEventListener("mousemove", (e) => {
        if (!resizing) return;
        box.style.width = `${Math.max(minWidth, startWidth + (e.clientX - startX))}px`;
        box.style.height = `${Math.max(minHeight, startHeight + (e.clientY - startY))}px`;
    });

    window.addEventListener("mouseup", () => {
        resizing = false;
    });
}

function toFixedPosition(box: HTMLElement, rect: DOMRect): void {
    if (box.style.position === "fixed") return;
    box.style.position = "fixed";
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.margin = "0";
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

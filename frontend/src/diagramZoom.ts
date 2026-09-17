// 그림 배율 — mermaid가 그린 SVG를 창 폭에 맞춰 줄이지 않고 원하는 크기로 본다.
//
// mermaid는 그린 뒤 SVG에 `max-width: <자연폭>px`를 직접 박는다(`useMaxWidth` 기본값
// true). 그래서 노드가 많을수록 그림이 통째로 줄어 글자가 작아진다 — 노드 40개짜리
// 흐름도가 읽기 어려워진 이유다. 여기서는 그 제한을 풀고 자연 크기의 배수로
// 폭·높이를 직접 준다.
//
// `transform: scale()`을 안 쓰는 이유: transform은 레이아웃 크기를 안 바꿔서 확대해도
// 스크롤 범위가 원래 크기 그대로 남는다. SVG에는 viewBox가 있어 폭·높이만 키우면
// 내용이 같은 비율로 커지므로, 스크롤도 저절로 맞는다. 벡터라 글자도 선명하다.

/** 창 폭에 맞춰 줄여 보는 기본 상태 — mermaid가 준 그대로다. */
export const ZOOM_FIT = 0;

const STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const EPS = 1e-3;

/** viewBox가 그림의 자연 크기다 — 없으면 실제로 재본다. */
function naturalSize(svg: SVGSVGElement): { w: number; h: number } | null {
    const box = svg.viewBox.baseVal;
    if (box && box.width > 0 && box.height > 0) return { w: box.width, h: box.height };
    try {
        const bbox = svg.getBBox();
        if (bbox.width > 0 && bbox.height > 0) return { w: bbox.width, h: bbox.height };
    } catch {
        // 문서에 안 붙어 있으면 잴 수 없다 — 배율을 포기하고 원래대로 둔다.
    }
    return null;
}

function applyScale(container: HTMLElement, scale: number): void {
    container.querySelectorAll<SVGSVGElement>("pre.mermaid svg").forEach((svg) => {
        // mermaid가 박아 둔 원래 style을 한 번만 기억해 둔다 — 맞춤으로 돌아갈 때 쓴다.
        if (svg.dataset.zoomBase === undefined) svg.dataset.zoomBase = svg.style.cssText;
        svg.style.cssText = svg.dataset.zoomBase;
        // 가운데 정렬인 채로 부모보다 넓어지면 왼쪽으로도 삐져나가는데, 그쪽은
        // 스크롤로 닿을 수 없다(scrollLeft가 음수가 못 된다). 확대 중엔 왼쪽 정렬.
        svg.closest("pre.mermaid")?.classList.toggle("mermaid--zoomed", scale !== ZOOM_FIT);
        if (scale === ZOOM_FIT) return;

        const size = naturalSize(svg);
        if (!size) return;
        svg.style.maxWidth = "none";
        svg.style.width = `${Math.round(size.w * scale)}px`;
        svg.style.height = `${Math.round(size.h * scale)}px`;
    });
}

/**
 * 지금 화면에 보이는 실제 배율. 맞춤은 "창 폭에 맞춰 줄인 상태"라 값이 정해져
 * 있지 않아서, 그릴 때마다 재야 `−`/`+`가 양쪽으로 예측대로 움직인다.
 */
function effectiveScale(container: HTMLElement, scale: number): number {
    if (scale !== ZOOM_FIT) return scale;
    const svg = container.querySelector<SVGSVGElement>("pre.mermaid svg");
    const size = svg ? naturalSize(svg) : null;
    if (!svg || !size) return 1;
    return svg.getBoundingClientRect().width / size.w || 1;
}

function step(current: number, dir: 1 | -1): number {
    if (dir > 0) return STEPS.find((s) => s > current + EPS) ?? STEPS[STEPS.length - 1];
    return [...STEPS].reverse().find((s) => s < current - EPS) ?? STEPS[0];
}

/** 실제로 스크롤되는 조상 — 보기 모드는 `.viewer-body`, 그림 편집은 `.flow-canvas` 자신이다. */
function scrollParent(el: HTMLElement): HTMLElement | null {
    let node: HTMLElement | null = el;
    while (node) {
        const style = getComputedStyle(node);
        if (/auto|scroll/.test(style.overflowY) || /auto|scroll/.test(style.overflowX)) return node;
        node = node.parentElement;
    }
    return null;
}

/**
 * 그림 위에 놓이는 가로 막대. 하위 흐름 칩과 배율을 같은 줄에 태우려고
 * 둘이 공유한다 — 먼저 부르는 쪽이 만들고 나중이 얹는다.
 */
export function ensureDiagramBar(container: HTMLElement): HTMLElement {
    const found = container.querySelector<HTMLElement>(":scope > .diagram-bar");
    if (found) return found;
    const bar = document.createElement("div");
    bar.className = "diagram-bar";
    container.prepend(bar);
    return bar;
}

/**
 * container 안의 mermaid 그림에 배율 막대와 `Ctrl+휠`을 붙인다.
 *
 * 배율 자체는 탭이 들고 있어야 접기·편집으로 다시 그려도 유지된다 — 바뀔 때마다
 * onChange로 넘기되, **다시 그리지는 말 것**. 확대 중 스크롤 위치를 맞춰 놓는데
 * 그 자리에서 재렌더가 일어나면 도로 날아간다.
 */
export function attachDiagramZoom(
    container: HTMLElement,
    scale: number,
    onChange: (next: number) => void,
): void {
    if (!container.querySelector("pre.mermaid svg")) return;

    let current = scale;
    applyScale(container, current);

    // 다시 붙일 때 배율 막대가 둘이 되지 않게.
    container.querySelector(":scope > .diagram-bar .zoom-group")?.remove();

    const group = document.createElement("div");
    group.className = "zoom-group";

    const label = document.createElement("span");
    label.className = "zoom-value";
    label.title = "지금 배율 — 맞춤일 때는 창 폭에 맞추느라 줄어든 실제 배율이다";

    const paint = (): void => {
        // 맞춤에도 값을 보여준다 — 버튼이 이미 "맞춤"이라 라벨까지 그러면 읽을 게 없다.
        const shown = current === ZOOM_FIT ? effectiveScale(container, ZOOM_FIT) : current;
        label.textContent = `${Math.round(shown * 100)}%`;
        fitBtn.classList.toggle("zoom-btn--on", current === ZOOM_FIT);
    };

    const setScale = (next: number): void => {
        current = next;
        applyScale(container, current);
        paint();
        onChange(current);
    };

    const button = (text: string, title: string, onClick: () => void): HTMLButtonElement => {
        const btn = document.createElement("button");
        btn.className = "zoom-btn";
        btn.textContent = text;
        btn.title = title;
        btn.addEventListener("click", onClick);
        return btn;
    };

    const outBtn = button("−", "축소", () => setScale(step(effectiveScale(container, current), -1)));
    const inBtn = button("+", "확대", () => setScale(step(effectiveScale(container, current), 1)));
    const fitBtn = button("맞춤", "창 폭에 맞춰 보기", () => setScale(ZOOM_FIT));

    group.append(outBtn, label, inBtn, fitBtn);
    paint();
    ensureDiagramBar(container).appendChild(group);

    const scroller = scrollParent(container);
    container.addEventListener(
        "wheel",
        (ev) => {
            if (!ev.ctrlKey) return;
            ev.preventDefault(); // 안 막으면 웹뷰가 화면 전체를 확대한다
            const svg = container.querySelector<SVGSVGElement>("pre.mermaid svg");
            if (!svg) return;

            // 커서 밑에 있던 지점이 그 자리에 남도록, 확대 후 크기를 재서 스크롤을 보정한다.
            const before = svg.getBoundingClientRect();
            const fx = (ev.clientX - before.left) / (before.width || 1);
            const fy = (ev.clientY - before.top) / (before.height || 1);
            setScale(step(effectiveScale(container, current), ev.deltaY < 0 ? 1 : -1));
            const after = svg.getBoundingClientRect();
            if (scroller) {
                scroller.scrollLeft += after.left + after.width * fx - ev.clientX;
                scroller.scrollTop += after.top + after.height * fy - ev.clientY;
            }
        },
        { passive: false },
    );
}

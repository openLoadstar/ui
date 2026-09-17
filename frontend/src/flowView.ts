// FLOW 탭의 그림 상호작용 — 렌더된 mermaid SVG의 노드를 집어내 클릭·선택을
// 붙이고, 그림 편집 모드의 속성 패널을 그린다.
//
// mermaid가 그린 노드 element의 id는 `<svgId>-flowchart-<노드id>-<n>` 형태다
// (실측, mermaid 11.x). 이 패턴이 바뀌어도 그림 자체는 그대로 보여야 하므로,
// 매칭에 실패하면 조용히 바인딩만 걸지 않는다.

import { parseElementFilename, formatIcon, type ElementFormat } from "./tree";
import { listFormatFiles } from "./fs";
import type { FlowDoc, FlowNode, FlowShape } from "./flowFile";

const SVG_NODE_ID = /-flowchart-(.+)-\d+$/;

export const SHAPE_LABEL: Record<FlowShape, string> = {
    step: "단계",
    branch: "분기",
    merge: "병합",
    subflow: "하위 흐름",
    store: "저장소",
    terminal: "시작·종료",
};

/**
 * 렌더가 끝난 SVG 노드에 id를 심고 상태 클래스를 붙인다.
 *
 * 클릭 처리는 여기서 하지 않는다 — 연결을 바꿀 때마다 이 함수를 다시 부르는데,
 * 노드마다 리스너를 달면 호출할 때마다 중복으로 쌓인다. 클릭은 호출하는 쪽이
 * 컨테이너에 위임 리스너 하나로 처리하고, 여기서 심은 `data-flow-id`를 읽는다.
 */
export function markFlowNodes(container: HTMLElement, doc: FlowDoc, selectedId: string | null): void {
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));
    for (const g of Array.from(container.querySelectorAll<SVGGElement>("g.node"))) {
        const id = SVG_NODE_ID.exec(g.id)?.[1];
        if (!id) continue; // mermaid가 id 형식을 바꿨을 때 — 그림은 그대로 두고 상호작용만 포기한다
        const node = byId.get(id);
        if (!node) continue;
        g.setAttribute("data-flow-id", id);
        g.classList.add("flow-node");
        g.classList.toggle("flow-node--linked", node.ref !== null);
        g.classList.toggle("flow-node--selected", selectedId === id);
    }
}

/** 클릭 이벤트가 어떤 노드에서 났는지 — 없으면 null(빈 곳 클릭). */
export function flowNodeIdFromEvent(e: Event): string | null {
    const el = e.target as Element | null;
    return el?.closest?.("[data-flow-id]")?.getAttribute("data-flow-id") ?? null;
}

/** 연결 대상으로 고를 수 있는 요소 목록(WP/DWP/FLOW/OTHER). */
async function loadLinkCandidates(): Promise<{ filename: string; format: ElementFormat; name: string }[]> {
    const lists = await Promise.all([
        listFormatFiles("WP"),
        listFormatFiles("DWP"),
        listFormatFiles("FLOW"),
        listFormatFiles("OTHER"),
    ]);
    return lists
        .flat()
        .map((p) => p.split("/").pop() ?? p)
        .map((filename) => ({ filename, ...parseElementFilename(filename) }))
        .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));
}

export interface FlowPanelOptions {
    doc: FlowDoc;
    selected: FlowNode | null;
    /** 선택 노드의 연결을 바꾼다(null이면 해제). */
    onLink: (id: string, filename: string | null) => void;
    /** 연결된 요소를 탭으로 연다. */
    onOpenRef: (filename: string) => void;
}

/**
 * 그림 편집 모드의 우측 속성 패널. 지금 할 수 있는 편집은 "노드에 요소 연결/해제"
 * 뿐이다 — 그림 구조(노드 추가·삭제)는 다음 단계이며, 그건 `DIAGRAM` 코드블록을
 * 건드리므로 별도로 다룬다(`[WP][2.0][2026.09.17]흐름(FLOW) 요소.md`).
 */
export function renderFlowPanel(container: HTMLElement, opts: FlowPanelOptions): void {
    const { doc, selected } = opts;

    if (!selected) {
        const hint = doc.problem
            ? `⚠️ ${doc.problem}`
            : "그림에서 노드를 클릭하면 여기에 속성이 나옵니다.";
        container.innerHTML = `<div class="flow-panel-empty"></div>`;
        container.querySelector(".flow-panel-empty")!.textContent = hint;
        renderOrphanWarning(container, doc);
        return;
    }

    container.innerHTML = `
        <div class="flow-panel-section">
            <div class="flow-panel-label">노드</div>
            <div class="flow-panel-node">
                <code class="flow-panel-id"></code>
                <span class="flow-panel-shape"></span>
            </div>
            <div class="flow-panel-nodelabel"></div>
        </div>
        <div class="flow-panel-section">
            <div class="flow-panel-label">연결된 요소</div>
            <div class="flow-panel-ref"></div>
        </div>
        <div class="flow-panel-section flow-panel-section--grow">
            <div class="flow-panel-label">연결할 요소 고르기</div>
            <input class="flow-panel-filter" type="text" placeholder="이름으로 좁히기" spellcheck="false" />
            <div class="flow-panel-candidates">불러오는 중…</div>
        </div>
    `;
    container.querySelector(".flow-panel-id")!.textContent = selected.id;
    container.querySelector(".flow-panel-shape")!.textContent = SHAPE_LABEL[selected.shape];
    container.querySelector(".flow-panel-nodelabel")!.textContent = selected.label || "(라벨 없음)";

    renderRef(container.querySelector<HTMLElement>(".flow-panel-ref")!, selected, opts);

    const filterEl = container.querySelector<HTMLInputElement>(".flow-panel-filter")!;
    const listEl = container.querySelector<HTMLElement>(".flow-panel-candidates")!;
    void loadLinkCandidates().then((candidates) => {
        const draw = () => {
            const q = filterEl.value.trim().toLowerCase();
            const shown = (q ? candidates.filter((c) => c.filename.toLowerCase().includes(q)) : candidates).slice(0, 200);
            listEl.innerHTML = "";
            if (shown.length === 0) {
                listEl.innerHTML = `<div class="flow-panel-empty">해당하는 요소가 없습니다.</div>`;
                return;
            }
            for (const c of shown) {
                const row = document.createElement("div");
                row.className = "flow-candidate" + (c.filename === selected.ref ? " flow-candidate--current" : "");
                row.innerHTML = `<span class="tree-icon">${formatIcon[c.format]}</span><span class="flow-candidate-name"></span>`;
                row.querySelector(".flow-candidate-name")!.textContent = c.name;
                row.title = c.filename;
                row.addEventListener("click", () => opts.onLink(selected.id, c.filename));
                listEl.appendChild(row);
            }
        };
        filterEl.addEventListener("input", draw);
        draw();
    });

    renderOrphanWarning(container, doc);
}

function renderRef(el: HTMLElement, selected: FlowNode, opts: FlowPanelOptions): void {
    if (!selected.ref) {
        el.innerHTML = `<span class="flow-panel-empty">아직 없음</span>`;
        return;
    }
    const { format, name } = parseElementFilename(selected.ref);
    el.innerHTML = `
        <span class="tree-icon">${formatIcon[format]}</span>
        <button class="flow-ref-open"></button>
        <button class="tb-btn flow-ref-unlink" title="연결 해제">×</button>
    `;
    const openBtn = el.querySelector<HTMLButtonElement>(".flow-ref-open")!;
    openBtn.textContent = name;
    openBtn.title = selected.ref;
    openBtn.addEventListener("click", () => opts.onOpenRef(selected.ref!));
    el.querySelector(".flow-ref-unlink")!.addEventListener("click", () => opts.onLink(selected.id, null));
}

/** REFERENCES에는 있는데 그림에 없는 id — 오타나 노드 삭제 흔적이다. */
function renderOrphanWarning(container: HTMLElement, doc: FlowDoc): void {
    if (doc.orphanRefs.length === 0) return;
    const box = document.createElement("div");
    box.className = "flow-panel-orphans";
    box.innerHTML = `<div class="flow-panel-label">그림에 없는 참조</div>`;
    for (const o of doc.orphanRefs) {
        const row = document.createElement("div");
        row.className = "flow-panel-orphan";
        row.textContent = `${o.id} → ${o.ref}`;
        box.appendChild(row);
    }
    container.appendChild(box);
}

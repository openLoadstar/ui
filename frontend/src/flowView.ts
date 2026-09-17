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

const SHAPE_ORDER: FlowShape[] = ["step", "branch", "merge", "subflow", "store", "terminal"];

function shapeOptions(selected: FlowShape): string {
    return SHAPE_ORDER.map(
        (s) => `<option value="${s}"${s === selected ? " selected" : ""}>${SHAPE_LABEL[s]}</option>`,
    ).join("");
}

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
    /** 라벨·종류 변경. */
    onLabel: (id: string, shape: FlowShape, label: string) => void;
    /** 노드 id 변경 — 그림과 REFERENCES를 함께 고친다. */
    onRename: (oldId: string, newId: string) => void;
    /**
     * 선택 노드 뒤에 새 노드를 만든다.
     * - `parallel`: 갈래를 하나 더 낸다(기존 갈래는 그대로).
     * - `insert`: 기존 갈래를 새 노드 뒤로 밀어 사이에 끼운다.
     */
    onAdd: (anchorId: string, mode: "parallel" | "insert", shape: FlowShape, label: string) => void;
    /** 선택 노드를 대상 노드 뒤로 옮긴다. */
    onMove: (id: string, afterId: string) => void;
    /** 선택 노드 삭제. */
    onDelete: (id: string) => void;
    /** 간선의 조건 라벨 변경(빈 문자열이면 라벨 제거). */
    onEdgeLabel: (line: number, label: string) => void;
    /** 그 간선 하나에만 노드를 끼워 넣는다. */
    onEdgeInsert: (line: number) => void;
    /** 간선 삭제. */
    onEdgeDelete: (line: number) => void;
    /** 간선별 조건 라벨(줄 번호 → 라벨) — 원문에서 읽어 넘긴다. */
    edgeLabels?: Map<number, string>;
    /** 방금 노드를 만든 직후인지 — 임시 라벨을 바로 고쳐 쓰도록 입력칸에 포커스를 준다. */
    focusLabel?: boolean;
}

/** 그림 편집 모드의 우측 속성 패널. */
export function renderFlowPanel(container: HTMLElement, opts: FlowPanelOptions): void {
    const { doc, selected } = opts;
    container.innerHTML = "";

    if (!selected) {
        const hint = document.createElement("div");
        hint.className = "flow-panel-empty";
        hint.textContent = doc.problem ?? "그림에서 노드를 클릭하면 여기에 속성이 나옵니다.";
        container.appendChild(hint);
        renderOrphanWarning(container, doc);
        return;
    }

    renderIdentity(container, opts, selected);
    if (opts.focusLabel) {
        const labelInput = container.querySelector<HTMLInputElement>('[data-role="label"]');
        labelInput?.focus();
        labelInput?.select();
    }
    renderEdges(container, opts, selected);
    renderStructure(container, opts, selected);
    renderRefSection(container, opts, selected);
    renderOrphanWarning(container, doc);
}

/** id·종류·라벨 — 있는 노드를 고치는 자리. */
function renderIdentity(container: HTMLElement, opts: FlowPanelOptions, selected: FlowNode): void {
    const box = document.createElement("div");
    box.className = "flow-panel-section";
    box.innerHTML = `
        <div class="flow-panel-label">노드</div>
        <div class="flow-field">
            <span class="flow-field-name">id</span>
            <input class="flow-input" data-role="id" spellcheck="false" />
        </div>
        <div class="flow-field">
            <span class="flow-field-name">종류</span>
            <select class="flow-input" data-role="shape">${shapeOptions(selected.shape)}</select>
        </div>
        <div class="flow-field">
            <span class="flow-field-name">라벨</span>
            <input class="flow-input" data-role="label" spellcheck="false" />
        </div>
        <div class="flow-field-error" hidden></div>
    `;
    container.appendChild(box);

    const idInput = box.querySelector<HTMLInputElement>('[data-role="id"]')!;
    const shapeSel = box.querySelector<HTMLSelectElement>('[data-role="shape"]')!;
    const labelInput = box.querySelector<HTMLInputElement>('[data-role="label"]')!;
    const error = box.querySelector<HTMLElement>(".flow-field-error")!;
    idInput.value = selected.id;
    labelInput.value = selected.label;

    const lock = opts.doc.structureLock;
    for (const el of [idInput, shapeSel, labelInput]) {
        el.disabled = lock !== null;
        if (lock) el.title = lock;
    }

    const applyLabel = () => opts.onLabel(selected.id, shapeSel.value as FlowShape, labelInput.value);
    labelInput.addEventListener("change", applyLabel);
    shapeSel.addEventListener("change", applyLabel);

    const applyId = () => {
        const next = idInput.value.trim();
        if (next === selected.id) return;
        // id는 REFERENCES의 키이자 그림 위에서 노드를 찾는 키다(`appendix/FLOW.md`).
        if (!/^[A-Za-z_]\w*$/.test(next)) {
            error.hidden = false;
            error.textContent = "id는 영문자·숫자·밑줄만 쓸 수 있고 숫자로 시작할 수 없습니다.";
            idInput.value = selected.id;
            return;
        }
        if (opts.doc.nodes.some((n) => n.id === next)) {
            error.hidden = false;
            error.textContent = `이미 있는 id입니다: ${next}`;
            idInput.value = selected.id;
            return;
        }
        error.hidden = true;
        opts.onRename(selected.id, next);
    };
    idInput.addEventListener("change", applyId);
}

/** 노드를 붙이고, 옮기고, 지우는 자리. */
function renderStructure(container: HTMLElement, opts: FlowPanelOptions, selected: FlowNode): void {
    const box = document.createElement("div");
    box.className = "flow-panel-section";
    box.innerHTML = `
        <div class="flow-panel-label">노드 추가·이동·삭제</div>
        <div class="flow-field">
            <span class="flow-field-name">종류</span>
            <select class="flow-input" data-role="new-shape">${shapeOptions("step")}</select>
        </div>
        <div class="flow-field">
            <span class="flow-field-name">라벨</span>
            <input class="flow-input" data-role="new-label" placeholder="새 노드 라벨" spellcheck="false" />
        </div>
        <div class="flow-buttons">
            <button class="tb-btn" data-role="add-parallel" title="갈래를 하나 더 낸다 — 기존 갈래는 그대로">⑂ 병렬 추가</button>
            <button class="tb-btn" data-role="add-insert" title="기존 갈래를 새 노드 뒤로 밀어 사이에 끼운다">↳ 삽입 추가</button>
        </div>
        <div class="flow-field">
            <span class="flow-field-name">이동</span>
            <select class="flow-input" data-role="move-target"></select>
            <button class="tb-btn flow-edge-btn" data-role="move" title="선택한 노드를 이 노드 뒤로 옮긴다">▸</button>
        </div>
        <button class="tb-btn tb-btn--danger" data-role="delete">이 노드 삭제</button>
    `;
    container.appendChild(box);

    const shapeSel = box.querySelector<HTMLSelectElement>('[data-role="new-shape"]')!;
    const labelInput = box.querySelector<HTMLInputElement>('[data-role="new-label"]')!;
    const moveSel = box.querySelector<HTMLSelectElement>('[data-role="move-target"]')!;
    for (const n of opts.doc.nodes) {
        if (n.id === selected.id) continue;
        const o = document.createElement("option");
        o.value = n.id;
        o.textContent = n.label || n.id;
        moveSel.appendChild(o);
    }
    if (moveSel.options.length === 0) {
        moveSel.innerHTML = `<option value="">옮길 자리 없음</option>`;
    }

    if (opts.doc.structureLock) {
        for (const el of Array.from(box.querySelectorAll<HTMLElement>("input,select,button"))) {
            (el as HTMLInputElement).disabled = true;
            el.title = opts.doc.structureLock;
        }
        const note = document.createElement("div");
        note.className = "flow-panel-lock";
        note.textContent = `구조 편집 잠김 — ${opts.doc.structureLock} 텍스트 편집 모드에서 직접 고칠 수 있습니다.`;
        box.appendChild(note);
        return;
    }

    const add = (mode: "parallel" | "insert") => {
        // 병합점은 라벨이 없는 것이 규약이라(`appendix/FLOW.md`) 빈 라벨을 그대로 허용한다.
        opts.onAdd(selected.id, mode, shapeSel.value as FlowShape, labelInput.value.trim());
        labelInput.value = "";
    };
    box.querySelector('[data-role="add-parallel"]')!.addEventListener("click", () => add("parallel"));
    box.querySelector('[data-role="add-insert"]')!.addEventListener("click", () => add("insert"));
    box.querySelector('[data-role="move"]')!.addEventListener("click", () => {
        if (moveSel.value) opts.onMove(selected.id, moveSel.value);
    });
    box.querySelector('[data-role="delete"]')!.addEventListener("click", () => opts.onDelete(selected.id));
}

/** 노드에 붙은 화살표들 — 조건 라벨 수정, 그 갈래에만 끼워 넣기, 갈래 추가·삭제. */
function renderEdges(container: HTMLElement, opts: FlowPanelOptions, selected: FlowNode): void {
    const locked = opts.doc.structureLock !== null;
    const nameOf = (id: string) => {
        const n = opts.doc.nodes.find((x) => x.id === id);
        return n?.label || id;
    };
    const outgoing = opts.doc.edges.filter((e) => e.from === selected.id);
    const incoming = opts.doc.edges.filter((e) => e.to === selected.id);

    const box = document.createElement("div");
    box.className = "flow-panel-section";
    box.innerHTML = `<div class="flow-panel-label">화살표</div>`;
    container.appendChild(box);

    const row = (line: number, label: string, arrowText: string, peer: string): HTMLElement => {
        const el = document.createElement("div");
        el.className = "flow-edge";
        el.innerHTML = `
            <input class="flow-input flow-edge-label" placeholder="조건" spellcheck="false" />
            <span class="flow-edge-peer"></span>
            <button class="tb-btn flow-edge-btn" data-role="insert" title="이 갈래에만 노드 끼우기">↳</button>
            <button class="tb-btn flow-edge-btn" data-role="drop" title="이 화살표 끊기">×</button>
        `;
        const input = el.querySelector<HTMLInputElement>(".flow-edge-label")!;
        input.value = label;
        el.querySelector(".flow-edge-peer")!.textContent = `${arrowText} ${peer}`;
        for (const c of Array.from(el.querySelectorAll<HTMLElement>("input,button"))) {
            (c as HTMLInputElement).disabled = locked;
            if (locked) c.title = opts.doc.structureLock!;
        }
        input.addEventListener("change", () => opts.onEdgeLabel(line, input.value));
        el.querySelector('[data-role="insert"]')!.addEventListener("click", () => opts.onEdgeInsert(line));
        el.querySelector('[data-role="drop"]')!.addEventListener("click", () => opts.onEdgeDelete(line));
        return el;
    };

    for (const e of outgoing) box.appendChild(row(e.line, edgeLabel(opts, e.line), "→", nameOf(e.to)));
    for (const e of incoming) box.appendChild(row(e.line, edgeLabel(opts, e.line), "←", nameOf(e.from)));
    if (outgoing.length === 0 && incoming.length === 0) {
        const empty = document.createElement("div");
        empty.className = "flow-panel-empty";
        empty.textContent = "이 노드에 연결된 화살표가 없습니다.";
        box.appendChild(empty);
    }

}

/** 패널이 그려질 때의 원문 기준 간선 라벨 — 호출부가 넘겨준 doc에는 없어 따로 읽는다. */
function edgeLabel(opts: FlowPanelOptions, line: number): string {
    return opts.edgeLabels?.get(line) ?? "";
}

/** 연결된 요소 + 고르기 목록. */
function renderRefSection(container: HTMLElement, opts: FlowPanelOptions, selected: FlowNode): void {
    const box = document.createElement("div");
    box.className = "flow-panel-section";
    box.innerHTML = `
        <div class="flow-panel-label">연결된 요소</div>
        <div class="flow-panel-ref"></div>
        <div class="flow-panel-label">연결할 요소 고르기</div>
        <input class="flow-panel-filter" type="text" placeholder="이름으로 좁히기" spellcheck="false" />
        <div class="flow-panel-candidates">불러오는 중…</div>
    `;
    container.appendChild(box);

    renderRef(box.querySelector<HTMLElement>(".flow-panel-ref")!, selected, opts);

    const filterEl = box.querySelector<HTMLInputElement>(".flow-panel-filter")!;
    const listEl = box.querySelector<HTMLElement>(".flow-panel-candidates")!;
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

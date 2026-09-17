// FLOW 요소(`SPEC 2.0/appendix/FLOW.md`) 파싱과 편집.
//
// 파싱 대상은 두 곳이다:
//   - `### DIAGRAM`의 mermaid 코드블록 — 노드 id·라벨·도형(= 종류)과 간선
//   - `### REFERENCES` — `노드id: 요소 파일명`
//
// 편집은 **원문을 다시 생성하지 않고 줄 단위로 수술**한다. 모델로 파싱한 뒤
// 통째로 재직렬화하면 사람이 손으로 쓴 주석·빈 줄·우리가 모르는 mermaid 문법이
// 날아간다. 손대지 않은 줄은 한 글자도 바뀌지 않아야 한다.
//
// 파서를 Go가 아니라 여기 둔 이유: 편집 중인(저장 전) 텍스트를 그 자리에서
// 파싱해야 하는데, Go 바인딩은 디스크의 파일을 읽는 쪽이 자연스럽다. 구조
// 추출기가 나중에 필요로 하는 것은 `REFERENCES`뿐이라(간선 위상은 색인 대상이
// 아니다) Go 쪽에 생길 파서는 이 파일 전체의 중복이 아니라 그 일부다.

/** 노드 도형이 곧 종류다(부록의 팔레트 표). */
export type FlowShape = "step" | "branch" | "merge" | "subflow" | "store" | "terminal";

export interface FlowNode {
    id: string;
    label: string;
    shape: FlowShape;
    /** `REFERENCES`에 적힌 대상 파일명. 연결이 없으면 null. */
    ref: string | null;
}

export interface FlowEdge {
    from: string;
    to: string;
    /** 문서 전체 기준 줄 번호 — 수술 대상을 정확히 짚기 위해 들고 있는다. */
    line: number;
}

export interface FlowDoc {
    nodes: FlowNode[];
    edges: FlowEdge[];
    /** `REFERENCES`에는 있는데 그림에 그 id가 없는 항목 — 사용자에게 알려줄 불일치. */
    orphanRefs: { id: string; ref: string }[];
    /** `### DIAGRAM`의 mermaid 코드블록을 찾지 못한 경우의 사유. */
    problem: string | null;
    /**
     * 구조 편집(노드 추가·삭제·이름변경)을 막아야 하는 사유. null이면 편집 가능.
     * 우리가 줄 단위로 안전하게 고칠 수 있는 문법을 벗어난 그림이 대상이다 —
     * 연결 편집(`REFERENCES`)은 그림을 건드리지 않으므로 이 잠금과 무관하다.
     */
    structureLock: string | null;
}

const MERMAID_FENCE_OPEN = /^\s*```\s*mermaid\s*$/;
const FENCE_CLOSE = /^\s*```\s*$/;
const HEADING = /^###\s+(\w+)/;

// 노드 표현: `id`, `id[라벨]`, `id((라벨))`, `id[[라벨]]`, `id[(라벨)]`, `id{라벨}`.
// 괄호가 겹치는 형태(`[[`와 `[`)가 있어 긴 것부터 시도해야 한다.
const SHAPE_PART = String.raw`(?:\(\(.*?\)\)|\[\[.*?\]\]|\[\(.*?\)\]|\{.*?\}|\[.*?\])`;
const NODE_EXPR = String.raw`[A-Za-z_]\w*(?:${SHAPE_PART})?`;
// 화살표 — 라벨이 붙은 두 형태(`-- 예 -->`, `-->|예|`)를 먼저 본다.
const ARROW_PART = String.raw`(?:--\s[^|>]*?\s-{2,3}>|-{2,3}>\|[^|]*\||-\.->|-\.-|={2,3}>?|-{2,3}[>ox]?)`;

const EDGE_LINE = new RegExp(String.raw`^(\s*)(${NODE_EXPR})\s*(${ARROW_PART})\s*(${NODE_EXPR})\s*$`);
const NODE_LINE = new RegExp(String.raw`^(\s*)(${NODE_EXPR})\s*$`);
const NODE_DEF_PARTS = new RegExp(String.raw`^([A-Za-z_]\w*)(${SHAPE_PART})?$`);
// 줄 안의 모든 노드 정의를 훑을 때 쓰는 전역 패턴(그룹으로 도형을 구분한다).
const NODE_DEF_SCAN = /([A-Za-z_][\w]*)(?:\(\((.*?)\)\)|\[\[(.*?)\]\]|\[\((.*?)\)\]|\{(.*?)\}|\[(.*?)\])/g;

const IGNORED_LINE = /^\s*(%%|flowchart|graph|direction|style|classDef|class|click|linkStyle)\b/;
const BLOCKING_LINE = /^\s*(subgraph|end)\b/;

/** 편집기가 새로 만드는 노드 id의 접두어 — 종류를 보면 알아보게. */
const ID_PREFIX: Record<FlowShape, string> = {
    step: "s",
    branch: "b",
    merge: "m",
    subflow: "f",
    store: "d",
    terminal: "t",
};

function shapeOf(groups: (string | undefined)[]): { shape: FlowShape; label: string } {
    const [round, subflow, store, branch, step] = groups;
    if (round !== undefined) {
        // `id(( ))`처럼 라벨이 비면 병합점, 라벨이 있으면 시작·종료.
        return { shape: round.trim() === "" ? "merge" : "terminal", label: round.trim() };
    }
    if (subflow !== undefined) return { shape: "subflow", label: subflow.trim() };
    if (store !== undefined) return { shape: "store", label: store.trim() };
    if (branch !== undefined) return { shape: "branch", label: branch.trim() };
    return { shape: "step", label: (step ?? "").trim() };
}

/**
 * 라벨을 비워두면 `s1[]`이 되어 mermaid가 파싱에 실패한다. 병합점만 빈 라벨이
 * 규약이고(`id(( ))`), 나머지는 임시 이름을 채워 그림이 깨지지 않게 한다 —
 * 편집기는 새 노드를 만든 뒤 라벨 입력칸에 바로 포커스를 준다.
 */
const DEFAULT_LABEL: Record<FlowShape, string> = {
    step: "새 단계",
    branch: "조건?",
    merge: "",
    subflow: "새 하위 흐름",
    store: "새 저장소",
    terminal: "끝",
};

/** 라벨에 mermaid 구분자가 섞이면 따옴표로 감싼다. */
function labelText(label: string): string {
    const clean = label.replace(/"/g, "'");
    return /[[\]{}()|]/.test(clean) ? `"${clean}"` : clean;
}

/** 종류·라벨로 mermaid 노드 표현을 만든다. */
export function nodeExpr(id: string, shape: FlowShape, label: string): string {
    const t = labelText(label.trim() === "" ? DEFAULT_LABEL[shape] : label);
    switch (shape) {
        case "branch":
            return `${id}{${t}}`;
        case "merge":
            return `${id}(( ))`;
        case "subflow":
            return `${id}[[${t}]]`;
        case "store":
            return `${id}[(${t})]`;
        case "terminal":
            return `${id}((${t}))`;
        default:
            return `${id}[${t}]`;
    }
}

/** `### <NAME>` 섹션의 본문 줄 범위 [start, end) 를 찾는다. 없으면 null. */
function sectionRange(lines: string[], name: string): { heading: number; start: number; end: number } | null {
    const heading = lines.findIndex((l) => HEADING.exec(l)?.[1] === name);
    if (heading === -1) return null;
    let end = lines.length;
    for (let i = heading + 1; i < lines.length; i++) {
        if (/^###\s+/.test(lines[i])) {
            end = i;
            break;
        }
    }
    return { heading, start: heading + 1, end };
}

/** DIAGRAM 섹션 안의 mermaid 코드블록 본문 줄 범위를 찾는다. */
function diagramRange(lines: string[]): { start: number; end: number } | null {
    const section = sectionRange(lines, "DIAGRAM");
    if (!section) return null;
    let open = -1;
    for (let i = section.start; i < section.end; i++) {
        if (MERMAID_FENCE_OPEN.test(lines[i])) {
            open = i;
            break;
        }
    }
    if (open === -1) return null;
    for (let i = open + 1; i < section.end; i++) {
        if (FENCE_CLOSE.test(lines[i])) return { start: open + 1, end: i };
    }
    return null;
}

function parseReferences(lines: string[]): Map<string, string> {
    const refs = new Map<string, string>();
    const section = sectionRange(lines, "REFERENCES");
    if (!section) return refs;
    for (let i = section.start; i < section.end; i++) {
        const m = /^\s*-\s*([A-Za-z_][\w]*)\s*:\s*(.+?)\s*$/.exec(lines[i]);
        if (m) refs.set(m[1], m[2]);
    }
    return refs;
}

/** `### DIAGRAM`의 mermaid 원문만 떼어낸다(그림 편집 모드에서 그림만 다시 그릴 때 쓴다). */
export function extractDiagram(raw: string): string | null {
    const lines = raw.split(/\r?\n/);
    const range = diagramRange(lines);
    return range ? lines.slice(range.start, range.end).join("\n") : null;
}

/** 한 줄을 간선 문장으로 해석한다. 아니면 null. 하위 흐름 합성(flowCompose.ts)도 쓴다. */
export function parseEdgeLine(line: string): { indent: string; left: string; arrow: string; right: string } | null {
    const m = EDGE_LINE.exec(line);
    return m ? { indent: m[1], left: m[2], arrow: m[3], right: m[4] } : null;
}

/** 노드 표현에서 id만 뽑는다(`scan[.loadstar 스캔]` → `scan`). */
export function idOf(expr: string): string {
    return NODE_DEF_PARTS.exec(expr)?.[1] ?? expr;
}

/** FLOW md 원문에서 노드·간선과 연결 상태를 뽑는다. */
export function parseFlow(raw: string): FlowDoc {
    const lines = raw.split(/\r?\n/);
    const refs = parseReferences(lines);
    const range = diagramRange(lines);
    if (!range) {
        return {
            nodes: [],
            edges: [],
            orphanRefs: [...refs].map(([id, ref]) => ({ id, ref })),
            problem: "DIAGRAM 섹션에서 mermaid 코드블록을 찾지 못했습니다.",
            structureLock: "그림을 찾지 못했습니다.",
        };
    }

    const byId = new Map<string, FlowNode>();
    const edges: FlowEdge[] = [];
    let structureLock: string | null = null;

    const addFromExpr = (expr: string) => {
        const parts = NODE_DEF_PARTS.exec(expr);
        if (!parts) return;
        const id = parts[1];
        if (parts[2] === undefined) {
            // 도형 없이 id만 등장 — mermaid는 기본 사각형으로 그린다.
            if (!byId.has(id)) byId.set(id, { id, label: id, shape: "step", ref: refs.get(id) ?? null });
            return;
        }
        NODE_DEF_SCAN.lastIndex = 0;
        const m = NODE_DEF_SCAN.exec(expr);
        if (!m) return;
        const { shape, label } = shapeOf([m[2], m[3], m[4], m[5], m[6]]);
        // 도형이 붙은 정의가 나오면 그것을 신뢰한다(먼저 본 것이 맨 id뿐이었을 수 있다).
        const known = byId.get(id);
        if (!known || known.label === id) byId.set(id, { id, label, shape, ref: refs.get(id) ?? null });
    };

    for (let i = range.start; i < range.end; i++) {
        const line = lines[i];
        if (line.trim() === "" || IGNORED_LINE.test(line)) continue;
        if (BLOCKING_LINE.test(line)) {
            structureLock ??= "subgraph가 있는 그림은 구조 편집을 지원하지 않습니다.";
            continue;
        }

        const edge = parseEdgeLine(line);
        if (edge) {
            addFromExpr(edge.left);
            addFromExpr(edge.right);
            edges.push({ from: idOf(edge.left), to: idOf(edge.right), line: i });
            continue;
        }
        const nodeOnly = NODE_LINE.exec(line);
        if (nodeOnly) {
            addFromExpr(nodeOnly[2]);
            continue;
        }

        // 한 줄에 화살표가 여러 개거나(`a --> b --> c`), `;`로 문장을 붙였거나,
        // 우리가 모르는 문법이다 — 줄 단위 수술이 안전하지 않다.
        structureLock ??= `줄 단위로 다룰 수 없는 구문이 있습니다: "${line.trim()}"`;
        // 그래도 노드 목록에는 넣어둔다 — 연결 편집은 계속 되어야 한다.
        NODE_DEF_SCAN.lastIndex = 0;
        for (let m = NODE_DEF_SCAN.exec(line); m; m = NODE_DEF_SCAN.exec(line)) {
            const { shape, label } = shapeOf([m[2], m[3], m[4], m[5], m[6]]);
            if (!byId.has(m[1])) byId.set(m[1], { id: m[1], label, shape, ref: refs.get(m[1]) ?? null });
        }
    }

    const orphanRefs = [...refs].filter(([id]) => !byId.has(id)).map(([id, ref]) => ({ id, ref }));
    return { nodes: [...byId.values()], edges, orphanRefs, problem: null, structureLock };
}

/**
 * `REFERENCES`에서 한 노드의 연결을 바꾼 새 원문을 돌려준다(filename이 null이면 해제).
 * 해당 줄 하나만 넣고/고치고/지운다 — 나머지 줄은 그대로 둔다.
 */
export function setNodeRef(raw: string, id: string, filename: string | null): string {
    const newline = raw.includes("\r\n") ? "\r\n" : "\n";
    const lines = raw.split(/\r?\n/);
    const entry = `- ${id}: ${filename ?? ""}`;
    const isThisId = (l: string) => new RegExp(`^\\s*-\\s*${id}\\s*:`).test(l);

    const section = sectionRange(lines, "REFERENCES");
    if (!section) {
        if (filename === null) return raw; // 지울 게 없다
        // 섹션이 없으면 DIAGRAM 바로 뒤에 만든다 — 없으면 문서 끝.
        const diagram = sectionRange(lines, "DIAGRAM");
        const at = diagram ? diagram.end : lines.length;
        lines.splice(at, 0, "### REFERENCES", entry, "");
        return lines.join(newline);
    }

    const existing = lines.slice(section.start, section.end).findIndex(isThisId);
    if (existing !== -1) {
        const at = section.start + existing;
        if (filename === null) lines.splice(at, 1);
        else lines[at] = entry;
        return lines.join(newline);
    }
    if (filename === null) return raw;

    // 섹션 끝의 빈 줄들 앞에 끼워 넣어 문단 간격을 유지한다.
    let at = section.end;
    while (at > section.start && lines[at - 1].trim() === "") at--;
    lines.splice(at, 0, entry);
    return lines.join(newline);
}

/** 쓰이지 않은 노드 id를 만든다 — 종류 접두어 + 번호. */
export function nextNodeId(doc: FlowDoc, shape: FlowShape): string {
    const used = new Set(doc.nodes.map((n) => n.id));
    const prefix = ID_PREFIX[shape];
    for (let i = 1; ; i++) {
        const id = `${prefix}${i}`;
        if (!used.has(id)) return id;
    }
}

interface EditContext {
    newline: string;
    lines: string[];
    range: { start: number; end: number };
}

function openEdit(raw: string): EditContext | null {
    const newline = raw.includes("\r\n") ? "\r\n" : "\n";
    const lines = raw.split(/\r?\n/);
    const range = diagramRange(lines);
    return range ? { newline, lines, range } : null;
}

function indentOf(lines: string[], range: { start: number; end: number }): string {
    for (let i = range.start; i < range.end; i++) {
        const m = /^(\s+)\S/.exec(lines[i]);
        if (m) return m[1];
    }
    return "    ";
}

/**
 * 선택 노드의 앞이나 뒤에 새 노드를 끼워 넣는다.
 *
 * 뒤에 넣을 때: `sel ARROW X` 들을 `new ARROW X`로 바꾸고 `sel --> new`를 한 줄 넣는다.
 * 화살표 라벨은 뒷쪽 간선에 남는다 — 분기 조건은 보통 갈라진 다음 단계에 붙는다.
 */
export function addNode(
    raw: string,
    opts: { anchorId: string; position: "before" | "after"; id: string; shape: FlowShape; label: string },
): string {
    const ctx = openEdit(raw);
    if (!ctx) return raw;
    const { lines, range, newline } = ctx;
    const expr = nodeExpr(opts.id, opts.shape, opts.label);
    // 간선을 다시 쓰면 그 줄에 실려 있던 앵커의 정의가 밀려난다
    // (`begin --> scan[.loadstar 스캔]`의 오른쪽을 새 노드로 바꾸면 scan의 라벨이 사라진다).
    const defs = collectDefinitions(lines, range);

    let firstTouched = -1;
    let lastTouched = -1;
    for (let i = range.start; i < range.end; i++) {
        const edge = parseEdgeLine(lines[i]);
        if (!edge) continue;
        if (opts.position === "after" && idOf(edge.left) === opts.anchorId) {
            lines[i] = `${edge.indent}${opts.id} ${edge.arrow} ${edge.right}`;
        } else if (opts.position === "before" && idOf(edge.right) === opts.anchorId) {
            lines[i] = `${edge.indent}${edge.left} ${edge.arrow} ${opts.id}`;
        } else {
            continue;
        }
        if (firstTouched === -1) firstTouched = i;
        lastTouched = i;
    }

    // 앵커와 새 노드를 잇는 줄 — 새 노드의 정의(도형·라벨)가 여기 들어간다.
    // 넣는 위치는 읽는 순서를 따른다: 뒤에 붙일 땐 `앵커 --> 새것`이 먼저 오고,
    // 앞에 붙일 땐 `새것 --> 앵커`가 나중에 온다.
    const indent = indentOf(lines, range);
    const link =
        opts.position === "after" ? `${indent}${opts.anchorId} --> ${expr}` : `${indent}${expr} --> ${opts.anchorId}`;
    let at = range.end;
    if (firstTouched !== -1) at = opts.position === "after" ? firstTouched : lastTouched + 1;
    lines.splice(at, 0, link);
    restoreDefinitions(lines, defs);
    return lines.join(newline);
}

/**
 * 노드를 지우고 앞뒤를 이어 붙인다(`a → n → b`에서 n을 지우면 `a → b`).
 * 화살표 라벨은 살릴 방법이 없어 사라진다 — 호출 쪽이 미리 알려야 한다.
 */
export function deleteNode(raw: string, id: string): string {
    const ctx = openEdit(raw);
    if (!ctx) return raw;
    const { lines, range, newline } = ctx;

    const incoming: string[] = [];
    const outgoing: string[] = [];
    const removeAt: number[] = [];

    for (let i = range.start; i < range.end; i++) {
        const edge = parseEdgeLine(lines[i]);
        if (edge) {
            const from = idOf(edge.left);
            const to = idOf(edge.right);
            if (from === id || to === id) {
                if (to === id) incoming.push(idOf(edge.left));
                if (from === id) outgoing.push(idOf(edge.right));
                removeAt.push(i);
            }
            continue;
        }
        const nodeOnly = NODE_LINE.exec(lines[i]);
        if (nodeOnly && idOf(nodeOnly[2]) === id) removeAt.push(i);
    }
    if (removeAt.length === 0) return raw;

    // 지우기 전에 되살릴 연결을 만들어 둔다. 남은 쪽에 정의가 없을 수 있으니
    // id만 쓰고, 도형·라벨은 다른 줄의 정의가 계속 책임진다.
    const indent = indentOf(lines, range);
    const reconnect: string[] = [];
    for (const from of incoming) {
        for (const to of outgoing) {
            if (from === to) continue; // 자기 자신으로 가는 고리는 만들지 않는다
            reconnect.push(`${indent}${from} --> ${to}`);
        }
    }

    // 지우려는 줄에 **다른 노드의 정의**가 실려 있을 수 있다
    // (`n --> parse[[요소 파싱]]`에서 n을 지우면 parse의 도형·라벨이 같이 날아간다).
    // 지우기 전에 정의를 기억해뒀다가, 사라졌으면 남은 줄에 되돌려 놓는다.
    const defs = collectDefinitions(lines, range);

    const insertAt = removeAt[0];
    for (const i of [...removeAt].reverse()) lines.splice(i, 1);
    lines.splice(insertAt, 0, ...reconnect);
    restoreDefinitions(lines, defs, id);

    // 지워진 노드를 가리키던 참조도 같이 정리한다(고아 참조를 만들지 않는다).
    return setNodeRef(lines.join(newline), id, null);
}

/** 도형이 붙은 노드 표현을 id별로 모은다(첫 정의 기준). */
function collectDefinitions(lines: string[], range: { start: number; end: number }): Map<string, string> {
    const defs = new Map<string, string>();
    const remember = (expr: string) => {
        const parts = NODE_DEF_PARTS.exec(expr);
        if (parts?.[2] !== undefined && !defs.has(parts[1])) defs.set(parts[1], expr);
    };
    for (let i = range.start; i < range.end; i++) {
        const edge = parseEdgeLine(lines[i]);
        if (edge) {
            remember(edge.left);
            remember(edge.right);
            continue;
        }
        const nodeOnly = NODE_LINE.exec(lines[i]);
        if (nodeOnly) remember(nodeOnly[2]);
    }
    return defs;
}

/**
 * 줄이 지워지면서 정의를 잃은 노드에게 정의를 돌려준다 — 여전히 그림에
 * 등장하는데 도형이 사라진 노드가 대상이다(등장 자체가 없으면 놔둔다).
 */
function restoreDefinitions(lines: string[], defs: Map<string, string>, skipId?: string): void {
    const range = diagramRange(lines);
    if (!range) return;

    for (const [id, expr] of defs) {
        if (id === skipId) continue;
        let firstBare = -1;
        let defined = false;
        for (let i = range.start; i < range.end && !defined; i++) {
            const edge = parseEdgeLine(lines[i]);
            const exprs = edge ? [edge.left, edge.right] : [NODE_LINE.exec(lines[i])?.[2] ?? ""];
            for (const e of exprs) {
                if (!e) continue;
                const parts = NODE_DEF_PARTS.exec(e);
                if (!parts || parts[1] !== id) continue;
                if (parts[2] !== undefined) defined = true;
                else if (firstBare === -1) firstBare = i;
            }
        }
        if (defined || firstBare === -1) continue;

        const edge = parseEdgeLine(lines[firstBare]);
        if (edge) {
            const left = idOf(edge.left) === id ? expr : edge.left;
            const right = idOf(edge.right) === id && left !== expr ? expr : edge.right;
            lines[firstBare] = `${edge.indent}${left} ${edge.arrow} ${right}`;
        } else {
            const nodeOnly = NODE_LINE.exec(lines[firstBare]);
            if (nodeOnly) lines[firstBare] = `${nodeOnly[1]}${expr}`;
        }
    }
}

/**
 * 노드의 라벨·종류를 바꾼다. 정의가 있던 자리를 새 표현으로 교체하고,
 * 다른 줄에 또 정의가 있으면 id만 남겨 중복 선언을 없앤다.
 */
export function setNodeLabel(raw: string, id: string, shape: FlowShape, label: string): string {
    const ctx = openEdit(raw);
    if (!ctx) return raw;
    const { lines, range, newline } = ctx;
    const expr = nodeExpr(id, shape, label);

    let defined = false;
    for (let i = range.start; i < range.end; i++) {
        const edge = parseEdgeLine(lines[i]);
        if (edge) {
            const leftIsIt = idOf(edge.left) === id;
            const rightIsIt = idOf(edge.right) === id;
            if (!leftIsIt && !rightIsIt) continue;
            // 첫 등장에만 정의를 남기고 나머지는 id만 쓴다 — 도형 선언이 여러 줄에
            // 흩어져 있으면 라벨을 바꿀 때 한쪽만 바뀌는 사고가 난다.
            const left = leftIsIt ? (defined ? id : expr) : edge.left;
            const right = rightIsIt ? (defined || leftIsIt ? id : expr) : edge.right;
            lines[i] = `${edge.indent}${left} ${edge.arrow} ${right}`;
            defined = true;
            continue;
        }
        const nodeOnly = NODE_LINE.exec(lines[i]);
        if (nodeOnly && idOf(nodeOnly[2]) === id) {
            lines[i] = `${nodeOnly[1]}${defined ? id : expr}`;
            defined = true;
        }
    }
    return defined ? lines.join(newline) : raw;
}

/**
 * 노드 id를 바꾼다 — 그림의 모든 등장 위치와 `REFERENCES`의 키를 **함께** 고친다.
 * 한쪽만 바꾸면 참조가 고아가 되므로 둘을 갈라놓지 않는다.
 */
export function renameNodeId(raw: string, oldId: string, newId: string): string {
    const ctx = openEdit(raw);
    if (!ctx) return raw;
    const { lines, range, newline } = ctx;

    const swap = (expr: string) => {
        const parts = NODE_DEF_PARTS.exec(expr);
        if (!parts || parts[1] !== oldId) return expr;
        return `${newId}${parts[2] ?? ""}`;
    };

    for (let i = range.start; i < range.end; i++) {
        const edge = parseEdgeLine(lines[i]);
        if (edge) {
            // 라벨 안의 글자는 건드리지 않도록 노드 표현만 바꿔 다시 조립한다.
            lines[i] = `${edge.indent}${swap(edge.left)} ${edge.arrow} ${swap(edge.right)}`;
            continue;
        }
        const nodeOnly = NODE_LINE.exec(lines[i]);
        if (nodeOnly) lines[i] = `${nodeOnly[1]}${swap(nodeOnly[2])}`;
    }

    let out = lines.join(newline);
    const ref = parseReferences(out.split(/\r?\n/)).get(oldId);
    if (ref !== undefined) {
        out = setNodeRef(out, oldId, null);
        out = setNodeRef(out, newId, ref);
    }
    return out;
}

// ---- 간선 단위 편집 -------------------------------------------------------
//
// 간선은 줄 번호(`FlowEdge.line`)로 짚는다. 편집할 때마다 문서를 다시 파싱하므로
// 한 번의 갱신 주기 안에서는 줄 번호가 그대로 유효하다.

// `-- 예 -->`(텍스트 형)와 `-->|예|`(파이프 형) 두 가지 라벨 표기를 다룬다.
const ARROW_TEXT_LABEL = /^(-{2,3})\s(.*)\s(-{2,3}>)$/;
const ARROW_PIPE_LABEL = /^(.*?)\|([^|]*)\|$/;

/** 화살표에서 라벨을 떼어낸 형태와, 원래 어떤 표기였는지. */
function arrowParts(arrow: string): { base: string; style: "text" | "pipe" | "none"; label: string } {
    const text = ARROW_TEXT_LABEL.exec(arrow);
    if (text) return { base: text[3], style: "text", label: text[2].trim() };
    const pipe = ARROW_PIPE_LABEL.exec(arrow);
    if (pipe) return { base: pipe[1].trim(), style: "pipe", label: pipe[2].trim() };
    return { base: arrow, style: "none", label: "" };
}

/** 그 간선에 붙은 조건 라벨. */
export function edgeLabelOf(raw: string, line: number): string {
    const lines = raw.split(/\r?\n/);
    const edge = parseEdgeLine(lines[line] ?? "");
    return edge ? arrowParts(edge.arrow).label : "";
}

/**
 * 라벨을 붙인 화살표 문자열. 원래 표기를 유지하되, 라벨이 없던 화살표는
 * `-- 예 -->` 형으로 만든다 — 점선·굵은선은 그 표기가 안 먹어서 `|예|` 형을 쓴다.
 */
function arrowWithLabel(arrow: string, label: string): string {
    const { base, style } = arrowParts(arrow);
    const text = label.trim();
    if (text === "") return base;
    const plain = /^-{2,3}>$/.test(base);
    if (style === "pipe" || !plain) return base + "|" + text + "|";
    return "-- " + text + " " + base;
}

/** 간선의 조건 라벨을 바꾼다(빈 문자열이면 라벨 제거). */
export function setEdgeLabel(raw: string, line: number, label: string): string {
    const newline = raw.includes("\r\n") ? "\r\n" : "\n";
    const lines = raw.split(/\r?\n/);
    const edge = parseEdgeLine(lines[line] ?? "");
    if (!edge) return raw;
    lines[line] = edge.indent + edge.left + " " + arrowWithLabel(edge.arrow, label) + " " + edge.right;
    return lines.join(newline);
}

/**
 * 그 간선 하나에만 노드를 끼워 넣는다 — `ok -- 예 --> edge`에 넣으면
 * `ok -- 예 --> new`, `new --> edge`가 된다. **조건 라벨은 분기 쪽에 남는다**:
 * 갈래를 고른 뒤에 한 단계를 더 거치는 것이지, 조건이 뒤로 밀리는 게 아니다.
 */
export function insertOnEdge(
    raw: string,
    line: number,
    opts: { id: string; shape: FlowShape; label: string },
): string {
    const ctx = openEdit(raw);
    if (!ctx) return raw;
    const { lines, range, newline } = ctx;
    if (line < range.start || line >= range.end) return raw;
    const edge = parseEdgeLine(lines[line]);
    if (!edge) return raw;

    const defs = collectDefinitions(lines, range);
    const expr = nodeExpr(opts.id, opts.shape, opts.label);
    lines[line] = edge.indent + edge.left + " " + edge.arrow + " " + opts.id;
    lines.splice(line + 1, 0, edge.indent + expr + " --> " + edge.right);
    restoreDefinitions(lines, defs);
    return lines.join(newline);
}

/** 간선 한 줄을 지운다. 양 끝 노드는 다른 줄에 남아 있으면 그대로 유지된다. */
export function deleteEdge(raw: string, line: number): string {
    const ctx = openEdit(raw);
    if (!ctx) return raw;
    const { lines, range, newline } = ctx;
    if (line < range.start || line >= range.end || !parseEdgeLine(lines[line])) return raw;

    const defs = collectDefinitions(lines, range);
    lines.splice(line, 1);
    restoreDefinitions(lines, defs);
    return lines.join(newline);
}

/**
 * 노드에서 나가는 갈래를 하나 더 만든다. 대상은 기존 노드이거나 새로 만드는 노드다.
 * 새 줄은 출발 노드가 마지막으로 등장한 줄 뒤에 넣는다 — 관련 줄끼리 모여 읽기 좋게.
 */
export function addEdge(
    raw: string,
    fromId: string,
    target: { existingId: string } | { id: string; shape: FlowShape; label: string },
    edgeLabel: string,
): string {
    const ctx = openEdit(raw);
    if (!ctx) return raw;
    const { lines, range, newline } = ctx;

    const rightExpr =
        "existingId" in target ? target.existingId : nodeExpr(target.id, target.shape, target.label);
    const arrow = arrowWithLabel("-->", edgeLabel);
    const indent = indentOf(lines, range);

    let at = range.end;
    for (let i = range.start; i < range.end; i++) {
        const edge = parseEdgeLine(lines[i]);
        if (edge && (idOf(edge.left) === fromId || idOf(edge.right) === fromId)) at = i + 1;
    }
    lines.splice(at, 0, indent + fromId + " " + arrow + " " + rightExpr);
    return lines.join(newline);
}

/**
 * 노드를 지금 자리에서 떼어내 다른 노드 **뒤**로 옮긴다.
 *
 * 두 동작의 합이다: 원래 자리에서는 앞뒤를 이어 붙이고(노드 삭제와 같은 통과 연결),
 * 새 자리에서는 대상의 나가는 간선을 이 노드 뒤로 밀어낸다(삽입 추가와 같은 재배선).
 * 조건 라벨은 원래 자리의 것이 사라진다 — 갈래를 떠나는 이동이라 살릴 근거가 없다.
 */
export function moveNode(raw: string, id: string, afterId: string): string {
    if (id === afterId) return raw;
    const ctx = openEdit(raw);
    if (!ctx) return raw;
    const { lines, range, newline } = ctx;

    const defs = collectDefinitions(lines, range);
    const movedExpr = defs.get(id) ?? id;
    const indent = indentOf(lines, range);

    // 1) 원래 자리에서 떼어낸다.
    const incoming: string[] = [];
    const outgoing: string[] = [];
    const removeAt: number[] = [];
    for (let i = range.start; i < range.end; i++) {
        const edge = parseEdgeLine(lines[i]);
        if (edge) {
            const from = idOf(edge.left);
            const to = idOf(edge.right);
            if (from === id || to === id) {
                if (to === id) incoming.push(from);
                if (from === id) outgoing.push(to);
                removeAt.push(i);
            }
            continue;
        }
        const nodeOnly = NODE_LINE.exec(lines[i]);
        if (nodeOnly && idOf(nodeOnly[2]) === id) removeAt.push(i);
    }
    const reconnect: string[] = [];
    for (const from of incoming) {
        for (const to of outgoing) {
            if (from === to || from === afterId) continue;
            reconnect.push(indent + from + " --> " + to);
        }
    }
    const insertAt = removeAt.length > 0 ? removeAt[0] : range.end;
    for (const i of [...removeAt].reverse()) lines.splice(i, 1);
    lines.splice(insertAt, 0, ...reconnect);

    // 2) 대상 뒤에 끼워 넣는다 — 대상의 나가는 간선을 이 노드 뒤로 민다.
    const after = diagramRange(lines);
    if (!after) return raw;
    let firstTouched = -1;
    for (let i = after.start; i < after.end; i++) {
        const edge = parseEdgeLine(lines[i]);
        if (!edge || idOf(edge.left) !== afterId) continue;
        lines[i] = edge.indent + id + " " + edge.arrow + " " + edge.right;
        if (firstTouched === -1) firstTouched = i;
    }
    const link = indent + afterId + " --> " + movedExpr;
    lines.splice(firstTouched !== -1 ? firstTouched : after.end, 0, link);

    restoreDefinitions(lines, defs);
    return lines.join(newline);
}

/**
 * 간선의 한쪽 끝을 다른 노드로 바꾼다 — 갈래를 기존 노드로 합류시키는 통로다.
 *
 * 바뀌는 쪽은 맨 id로만 적는다. 그 자리에 노드 정의(도형·라벨)가 실려 있었다면
 * 다른 줄로 되돌려 놓는다(`restoreDefinitions`) — 정의가 통째로 사라지지 않게.
 */
export function setEdgeEndpoint(raw: string, line: number, side: "from" | "to", nodeId: string): string {
    const ctx = openEdit(raw);
    if (!ctx) return raw;
    const { lines, range, newline } = ctx;
    if (line < range.start || line >= range.end) return raw;
    const edge = parseEdgeLine(lines[line]);
    if (!edge) return raw;

    const defs = collectDefinitions(lines, range);
    const left = side === "from" ? nodeId : edge.left;
    const right = side === "to" ? nodeId : edge.right;
    lines[line] = edge.indent + left + " " + edge.arrow + " " + right;
    restoreDefinitions(lines, defs);
    return lines.join(newline);
}

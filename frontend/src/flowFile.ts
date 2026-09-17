// FLOW 요소(`SPEC 2.0/appendix/FLOW.md`) 파싱과 편집.
//
// 파싱 대상은 두 곳이다:
//   - `### DIAGRAM`의 mermaid 코드블록 — 노드 id·라벨·도형(= 종류)
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

export interface FlowDoc {
    nodes: FlowNode[];
    /** `REFERENCES`에는 있는데 그림에 그 id가 없는 항목 — 사용자에게 알려줄 불일치. */
    orphanRefs: { id: string; ref: string }[];
    /** `### DIAGRAM`의 mermaid 코드블록을 찾지 못한 경우의 사유. */
    problem: string | null;
}

const MERMAID_FENCE_OPEN = /^\s*```\s*mermaid\s*$/;
const FENCE_CLOSE = /^\s*```\s*$/;
const HEADING = /^###\s+(\w+)/;

// 노드 정의: `id((라벨))` `id[[라벨]]` `id[(라벨)]` `id{라벨}` `id[라벨]`.
// 괄호가 겹치는 형태(예: `[[`와 `[`)가 있어 긴 것부터 시도해야 한다.
const NODE_DEF = /([A-Za-z_][\w]*)(?:\(\((.*?)\)\)|\[\[(.*?)\]\]|\[\((.*?)\)\]|\{(.*?)\}|\[(.*?)\])/g;

// 화살표(라벨 붙은 형태 포함)를 공백으로 바꿔 남은 토큰에서 "정의 없이 등장하는" 노드 id를 줍는다.
const ARROW = /(-{2,3}[>ox]?|-\.-+>?|={2,3}>?|<-{2,3})/g;
const EDGE_LABEL = /\|[^|]*\|/g;

// mermaid 문법 키워드 — 노드 id로 오인하면 안 된다.
const KEYWORDS = new Set([
    "flowchart", "graph", "subgraph", "end", "direction",
    "LR", "RL", "TD", "TB", "BT",
    "style", "classDef", "class", "click", "linkStyle", "linkStyle;",
]);

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

/** FLOW md 원문에서 노드 목록과 연결 상태를 뽑는다. */
export function parseFlow(raw: string): FlowDoc {
    const lines = raw.split(/\r?\n/);
    const refs = parseReferences(lines);
    const range = diagramRange(lines);
    if (!range) {
        return {
            nodes: [],
            orphanRefs: [...refs].map(([id, ref]) => ({ id, ref })),
            problem: "`### DIAGRAM`에서 mermaid 코드블록을 찾지 못했습니다.",
        };
    }

    const byId = new Map<string, FlowNode>();
    for (let i = range.start; i < range.end; i++) {
        const line = lines[i];
        if (/^\s*(%%|flowchart|graph|subgraph|end|style|classDef|class|click|linkStyle|direction)\b/.test(line)) {
            continue; // 헤더·주석·스타일 지시자 — 노드 정의가 아니다
        }

        let rest = line;
        NODE_DEF.lastIndex = 0;
        for (let m = NODE_DEF.exec(line); m; m = NODE_DEF.exec(line)) {
            const { shape, label } = shapeOf([m[2], m[3], m[4], m[5], m[6]]);
            // 같은 노드가 여러 줄에 나오면 처음 정의를 신뢰한다(mermaid도 같은 규칙).
            if (!byId.has(m[1])) byId.set(m[1], { id: m[1], label, shape, ref: refs.get(m[1]) ?? null });
            rest = rest.replace(m[0], " ");
        }

        // 도형 없이 id만 등장하는 노드(`a --> b`)도 mermaid는 기본 사각형으로 그린다.
        for (const token of rest.replace(EDGE_LABEL, " ").replace(ARROW, " ").split(/\s+/)) {
            const id = token.trim();
            if (!id || KEYWORDS.has(id) || !/^[A-Za-z_][\w]*$/.test(id) || byId.has(id)) continue;
            byId.set(id, { id, label: id, shape: "step", ref: refs.get(id) ?? null });
        }
    }

    const orphanRefs = [...refs].filter(([id]) => !byId.has(id)).map(([id, ref]) => ({ id, ref }));
    return { nodes: [...byId.values()], orphanRefs, problem: null };
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

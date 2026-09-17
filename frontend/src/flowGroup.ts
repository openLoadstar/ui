// 하위 흐름 묶기·풀기 — 여러 노드를 새 FLOW로 떼어내거나, 하위 흐름을 부모에
// 도로 펼쳐 넣는다. "한 단계가 커지면 쪼갠다"(`appendix/FLOW.md`)를 실제로
// 수행하는 자리이고, 잘못 쪼갰을 때 되돌릴 수 있도록 풀기를 짝으로 둔다.
//
// 부모 쪽은 다른 편집과 마찬가지로 줄 단위 수술이다. 새로 만드는 자식 파일만은
// 모델에서 생성한다 — 원문을 옮겨 붙일 대상이 없기 때문.

import {
    parseFlow,
    parseEdgeLine,
    parseReferences,
    openEdit,
    indentOf,
    collectDefinitions,
    restoreDefinitions,
    setNodeRef,
    nodeExpr,
    edgeLabelOf,
    idOf,
    NODE_LINE,
    type FlowDoc,
    type FlowEdge,
} from "./flowFile";
import { entryExitOf } from "./flowCompose";

const NL = String.fromCharCode(10);

export interface GroupBoundary {
    /** 바깥에서 묶음 안으로 들어오는 화살표(없으면 묶음이 흐름의 시작이다). */
    entering: FlowEdge | null;
    /** 묶음 안에서 바깥으로 나가는 화살표(없으면 묶음이 흐름의 끝이다). */
    exiting: FlowEdge | null;
    /** 묶을 수 없는 이유. null이면 묶어도 된다. */
    problem: string | null;
}

/**
 * 묶음의 경계를 본다.
 *
 * 부모에는 `[[ ]]` 한 칸만 남아야 하므로, 드나드는 화살표가 각각 최대 하나여야
 * 한다 — 여러 개면 한 칸으로 줄일 수 없고, 자식의 입구·출구도 하나로 정해지지
 * 않아 펼침 조건과도 어긋난다(`flowCompose.ts`).
 */
export function groupBoundary(doc: FlowDoc, ids: ReadonlySet<string>): GroupBoundary {
    const entering = doc.edges.filter((e) => !ids.has(e.from) && ids.has(e.to));
    const exiting = doc.edges.filter((e) => ids.has(e.from) && !ids.has(e.to));

    let problem: string | null = null;
    if (ids.size === 0) problem = "묶을 노드를 고르세요.";
    else if (entering.length > 1) problem = `묶음으로 들어오는 화살표가 ${entering.length}개입니다 — 하나여야 합니다.`;
    else if (exiting.length > 1) problem = `묶음에서 나가는 화살표가 ${exiting.length}개입니다 — 하나여야 합니다.`;

    return { entering: entering[0] ?? null, exiting: exiting[0] ?? null, problem };
}

/** 묶음 안쪽 간선만 추린다. */
function innerEdges(doc: FlowDoc, ids: ReadonlySet<string>): FlowEdge[] {
    return doc.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
}

/** 새로 만들 자식 FLOW 파일의 내용. */
function buildChildFlow(
    raw: string,
    doc: FlowDoc,
    ids: ReadonlySet<string>,
    boundary: GroupBoundary,
    name: string,
    parentFilename: string,
): string {
    const refs = parseReferences(raw.split(/\r?\n/));
    const defined = new Set<string>();
    const expr = (id: string): string => {
        const node = doc.nodes.find((n) => n.id === id);
        if (!node || defined.has(id)) return id;
        defined.add(id);
        return nodeExpr(id, node.shape, node.label);
    };

    const body: string[] = [];
    // 들어오고 나가던 자리에 시작·끝을 세운다 — 펼칠 때 이 둘은 다시 흡수된다.
    if (boundary.entering) body.push(`    begin((시작)) --> ${expr(boundary.entering.to)}`);
    for (const edge of innerEdges(doc, ids)) {
        const label = edgeLabelOf(raw, edge.line);
        const arrow = label === "" ? "-->" : `-- ${label} -->`;
        body.push(`    ${expr(edge.from)} ${arrow} ${expr(edge.to)}`);
    }
    if (boundary.exiting) body.push(`    ${expr(boundary.exiting.from)} --> done((끝))`);
    // 간선 없이 노드 하나만 묶은 경우에도 그림이 비지 않게.
    for (const id of ids) if (!defined.has(id)) body.push(`    ${expr(id)}`);

    // 묶여 들어간 노드들이 가리키던 요소 연결은 자식으로 함께 옮긴다.
    const movedRefs = [...ids]
        .filter((id) => refs.has(id))
        .map((id) => `- ${id}: ${refs.get(id)}`);

    return [
        "### IDENTITY",
        `- SUMMARY: ${name}`,
        "",
        "### CONNECTIONS",
        `- PARENT: ${parentFilename}`,
        "- REFERENCE: []",
        "",
        "### DIAGRAM",
        "```mermaid",
        "flowchart LR",
        ...body,
        "```",
        "",
        "### REFERENCES",
        ...movedRefs,
        "",
        "### ISSUE",
        "",
    ].join(NL);
}

export interface GroupResult {
    parent: string;
    child: string;
}

/**
 * 고른 노드들을 새 FLOW로 떼어내고, 부모에는 그 자리를 `[[ ]]` 한 칸으로 남긴다.
 * 경계가 맞지 않으면(`groupBoundary`) null.
 */
export function groupIntoSubflow(
    raw: string,
    ids: ReadonlySet<string>,
    opts: { newId: string; name: string; childFilename: string; parentFilename: string },
): GroupResult | null {
    const doc = parseFlow(raw);
    const boundary = groupBoundary(doc, ids);
    if (boundary.problem) return null;

    const ctx = openEdit(raw);
    if (!ctx) return null;
    const { lines, range, newline } = ctx;
    const defs = collectDefinitions(lines, range);
    const child = buildChildFlow(raw, doc, ids, boundary, opts.name, opts.parentFilename);

    const subflowExpr = nodeExpr(opts.newId, "subflow", opts.name);
    let placed = false; // 새 노드의 정의(도형·라벨)를 한 번만 적기 위해
    const here = () => {
        if (placed) return opts.newId;
        placed = true;
        return subflowExpr;
    };

    const removeAt: number[] = [];
    for (let i = range.start; i < range.end; i++) {
        const edge = parseEdgeLine(lines[i]);
        if (edge) {
            const fromIn = ids.has(idOf(edge.left));
            const toIn = ids.has(idOf(edge.right));
            if (fromIn && toIn) removeAt.push(i); // 묶음 안쪽 간선 — 자식으로 옮겨갔다
            else if (toIn) lines[i] = `${edge.indent}${edge.left} ${edge.arrow} ${here()}`;
            else if (fromIn) lines[i] = `${edge.indent}${here()} ${edge.arrow} ${edge.right}`;
            continue;
        }
        const nodeOnly = NODE_LINE.exec(lines[i]);
        if (nodeOnly && ids.has(idOf(nodeOnly[2]))) removeAt.push(i);
    }

    const insertAt = removeAt.length > 0 ? removeAt[0] : range.end;
    for (const i of [...removeAt].reverse()) lines.splice(i, 1);
    // 드나드는 화살표가 아예 없었다면(흐름 전체를 묶은 경우) 홀로 선 노드로 남긴다.
    if (!placed) lines.splice(insertAt, 0, `${indentOf(lines, range)}${subflowExpr}`);
    restoreDefinitions(lines, defs);

    let parent = lines.join(newline);
    for (const id of ids) parent = setNodeRef(parent, id, null); // 옮겨간 연결은 부모에서 지운다
    parent = setNodeRef(parent, opts.newId, opts.childFilename);
    return { parent, child };
}

/**
 * 하위 흐름 노드를 부모 안으로 도로 펼쳐 넣는다(묶기의 반대).
 * 자식 파일은 지우지 않는다 — 연결만 끊는다.
 */
export function ungroupSubflow(parentRaw: string, nodeId: string, childRaw: string): string | null {
    const parentDoc = parseFlow(parentRaw);
    const child = parseFlow(childRaw);
    const ee = entryExitOf(child.nodes, child.edges);
    if (!ee || child.nodes.length === 0) return null;

    // 부모에 이미 있는 id와 부딪히지 않게 자식 id를 옮겨 적는다.
    const taken = new Set(parentDoc.nodes.map((n) => n.id));
    const rename = new Map<string, string>();
    for (const n of child.nodes) {
        let id = n.id;
        for (let i = 2; taken.has(id); i++) id = `${n.id}_${i}`;
        taken.add(id);
        rename.set(n.id, id);
    }
    const mapped = (id: string) => rename.get(id) ?? id;

    const ctx = openEdit(parentRaw);
    if (!ctx) return null;
    const { lines, range, newline } = ctx;
    const defs = collectDefinitions(lines, range);
    const indent = indentOf(lines, range);

    // 자식 내용을 부모 줄들로 펼쳐 쓴다(시작·끝은 흡수).
    const defined = new Set<string>();
    const expr = (id: string): string => {
        const node = child.nodes.find((n) => n.id === id);
        if (!node || defined.has(id)) return mapped(id);
        defined.add(id);
        return nodeExpr(mapped(id), node.shape, node.label);
    };
    const inlined: string[] = [];
    for (const edge of child.edges) {
        if (ee.absorbed.has(edge.from) || ee.absorbed.has(edge.to)) continue;
        const label = edgeLabelOf(childRaw, edge.line);
        const arrow = label === "" ? "-->" : `-- ${label} -->`;
        inlined.push(`${indent}${expr(edge.from)} ${arrow} ${expr(edge.to)}`);
    }

    let touched = -1;
    const removeAt: number[] = [];
    for (let i = range.start; i < range.end; i++) {
        const edge = parseEdgeLine(lines[i]);
        if (edge) {
            const leftIsIt = idOf(edge.left) === nodeId;
            const rightIsIt = idOf(edge.right) === nodeId;
            if (!leftIsIt && !rightIsIt) continue;
            const left = leftIsIt ? expr(ee.exit) : edge.left;
            const right = rightIsIt ? expr(ee.entry) : edge.right;
            lines[i] = `${edge.indent}${left} ${edge.arrow} ${right}`;
            if (touched === -1) touched = i;
            continue;
        }
        const nodeOnly = NODE_LINE.exec(lines[i]);
        if (nodeOnly && idOf(nodeOnly[2]) === nodeId) removeAt.push(i);
    }
    for (const i of [...removeAt].reverse()) lines.splice(i, 1);
    lines.splice(touched !== -1 ? touched + 1 : range.end, 0, ...inlined);
    restoreDefinitions(lines, defs);

    // 연결 정리 — 하위 흐름 참조는 빼고, 자식이 들고 있던 요소 연결은 부모로 가져온다.
    let out = setNodeRef(lines.join(newline), nodeId, null);
    for (const [childId, filename] of parseReferences(childRaw.split(/\r?\n/))) {
        if (ee.absorbed.has(childId)) continue;
        out = setNodeRef(out, mapped(childId), filename);
    }
    return out;
}

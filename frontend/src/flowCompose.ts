// 하위 흐름 펼침 — `[[ ]]` 노드 자리에 그 FLOW의 내용을 `subgraph`로 끼워 넣은
// mermaid 원문을 만들어낸다.
//
// **합성 결과는 화면에만 쓰고 파일에는 절대 쓰지 않는다.** 두 파일의 내용을 합쳐
// 저장하면 같은 그림이 두 곳에 생겨, 2.0이 피하려던 동기화 문제가 그대로 생긴다
// (`01.MASTER_GUIDE.md §2` 원본과 파생의 분리). 원본은 언제나 각 FLOW 파일이다.
//
// 하위 노드 id에는 `<노드id>__` 접두어를 붙인다 — 두 흐름에 똑같이 `begin`,
// `s1`이 있어도 합칠 때 부딪히지 않게. 접두어가 붙은 노드는 부모 문서의 노드가
// 아니므로 선택·편집 대상이 되지 않는다(보기 전용).

import { parseFlow, extractDiagram, parseEdgeLine, idOf, nodeExpr, edgeLabelOf, type FlowNode } from "./flowFile";
import { parseElementFilename } from "./tree";

export interface ComposeResult {
    /** 렌더할 mermaid 원문. 펼친 게 없으면 원본 그대로다. */
    text: string;
    /** 펼칠 수 있는 노드 — 노드 id → 하위 FLOW 파일명. */
    subflows: Map<string, string>;
    /** 펼치지 못한 이유(입출구가 여러 개인 경우 등). */
    problems: string[];
}

/** 하위 흐름에서 부모 화살표를 이어 붙일 자리. */
export interface EntryExit {
    entry: string;
    exit: string;
    /** 그리지 않고 흡수한 시작·종료 노드. */
    absorbed: Set<string>;
}

/**
 * 들어오는 화살표가 없는 노드가 입구, 나가는 화살표가 없는 노드가 출구다.
 * 그게 `((시작))`/`((끝))`이면 그리지 않고 그다음·그앞 노드를 쓴다 — 부모 흐름
 * 한가운데에 시작·끝 표시가 또 나오는 건 군더더기다.
 */
export function entryExitOf(nodes: FlowNode[], edges: { from: string; to: string }[]): EntryExit | null {
    const hasIncoming = new Set(edges.map((e) => e.to));
    const hasOutgoing = new Set(edges.map((e) => e.from));
    const entries = nodes.filter((n) => !hasIncoming.has(n.id));
    const exits = nodes.filter((n) => !hasOutgoing.has(n.id));
    if (entries.length !== 1 || exits.length !== 1) return null;

    const absorbed = new Set<string>();
    let entry = entries[0];
    let exit = exits[0];

    if (entry.shape === "terminal") {
        const outs = edges.filter((e) => e.from === entry.id);
        const next = outs.length === 1 ? nodes.find((n) => n.id === outs[0].to) : undefined;
        if (next) {
            absorbed.add(entry.id);
            entry = next;
        }
    }
    if (exit.shape === "terminal" && exit.id !== entry.id) {
        const ins = edges.filter((e) => e.to === exit.id);
        const prev = ins.length === 1 ? nodes.find((n) => n.id === ins[0].from) : undefined;
        if (prev) {
            absorbed.add(exit.id);
            exit = prev;
        }
    }
    return { entry: entry.id, exit: exit.id, absorbed };
}

/**
 * 하위 흐름을 `subgraph` 블록 문자열로 만든다.
 *
 * 이 블록만은 원문을 줄 단위로 옮기는 대신 **모델에서 다시 생성**한다 — 화면에만
 * 쓰는 사본이라 원문 보존이 목적이 아니고, 접두어를 붙이고 흡수한 노드를 빼는 일이
 * 생성 쪽이 훨씬 단순하기 때문이다.
 */
function subgraphBlock(childRaw: string, prefix: string, title: string, ee: EntryExit, indent: string): string {
    const doc = parseFlow(childRaw);
    const defined = new Set<string>();
    const expr = (id: string): string => {
        const node = doc.nodes.find((n) => n.id === id);
        if (!node) return prefix + id;
        if (defined.has(id)) return prefix + id;
        defined.add(id);
        return nodeExpr(prefix + id, node.shape, node.label);
    };

    const body: string[] = [];
    for (const edge of doc.edges) {
        if (ee.absorbed.has(edge.from) || ee.absorbed.has(edge.to)) continue;
        const label = edgeLabelOf(childRaw, edge.line);
        const arrow = label === "" ? "-->" : `-- ${label} -->`;
        body.push(`${indent}    ${expr(edge.from)} ${arrow} ${expr(edge.to)}`);
    }
    // 간선이 하나도 없는(노드 한 개짜리) 흐름도 그려는 준다.
    if (body.length === 0 && doc.nodes.length > 0) {
        const only = doc.nodes.find((n) => !ee.absorbed.has(n.id));
        if (only) body.push(`${indent}    ${expr(only.id)}`);
    }

    return [`${indent}subgraph ${prefix}box["${title.replace(/"/g, "'")}"]`, ...body, `${indent}end`].join("\n");
}

/**
 * 펼침 상태를 반영한 mermaid 원문을 만든다.
 *
 * @param expanded 펼쳐진 노드 id들(부모 문서 기준). 비어 있으면 원본을 그대로 돌려준다.
 * @param readFile 프로젝트 상대 경로로 파일을 읽는 함수.
 */
export async function composeFlow(
    raw: string,
    expanded: ReadonlySet<string>,
    readFile: (path: string) => Promise<string>,
): Promise<ComposeResult> {
    const doc = parseFlow(raw);
    const diagram = extractDiagram(raw);
    const subflows = new Map<string, string>();
    const problems: string[] = [];
    if (diagram === null) return { text: "", subflows, problems };

    // 하위 흐름을 가리키는 노드 추리기 — FORMAT 접두어로 판단(`02.ELEMENT_FORMAT.md §4`).
    for (const node of doc.nodes) {
        if (!node.ref) continue;
        if (parseElementFilename(node.ref).format === "FLOW") subflows.set(node.id, node.ref);
    }

    const lines = diagram.split("\n");
    const indent = /^(\s+)\S/.exec(lines.find((l) => /^\s+\S/.test(l)) ?? "    x")?.[1] ?? "    ";
    const blocks: string[] = [];

    for (const [id, filename] of subflows) {
        if (!expanded.has(id)) continue;
        let childRaw: string;
        try {
            childRaw = await readFile(`.loadstar/FLOW/${filename}`);
        } catch {
            problems.push(`${labelOf(doc, id)}: 하위 흐름 파일을 읽지 못했습니다.`);
            continue;
        }
        const child = parseFlow(childRaw);
        if (child.nodes.length === 0) {
            problems.push(`${labelOf(doc, id)}: 하위 흐름에 노드가 없습니다.`);
            continue;
        }
        const ee = entryExitOf(child.nodes, child.edges);
        if (!ee) {
            problems.push(
                `${labelOf(doc, id)}: 하위 흐름의 시작이나 끝이 하나로 정해지지 않아 펼칠 수 없습니다.`,
            );
            continue;
        }

        const prefix = `${id}__`;
        // 부모 쪽 화살표를 하위 흐름의 입구·출구로 갈아 끼우고, 그 노드의 홀로 선 정의는 뺀다.
        for (let i = 0; i < lines.length; i++) {
            const edge = parseEdgeLine(lines[i]);
            if (edge) {
                const left = idOf(edge.left) === id ? prefix + ee.exit : edge.left;
                const right = idOf(edge.right) === id ? prefix + ee.entry : edge.right;
                if (left !== edge.left || right !== edge.right) {
                    lines[i] = `${edge.indent}${left} ${edge.arrow} ${right}`;
                }
                continue;
            }
            if (idOf(lines[i].trim()) === id && lines[i].trim() !== "") lines[i] = "";
        }
        blocks.push(subgraphBlock(childRaw, prefix, labelOf(doc, id), ee, indent));
    }

    const text = [...lines.filter((l) => l.trim() !== "" || lines.length < 2), ...blocks].join("\n");
    return { text, subflows, problems };
}

function labelOf(doc: { nodes: FlowNode[] }, id: string): string {
    const node = doc.nodes.find((n) => n.id === id);
    return node?.label || id;
}

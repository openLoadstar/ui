// 하위 흐름 접기 — `subgraph` 구역을 상자 한 칸으로 줄인 mermaid 원문을 만든다.
//
// **접기는 보는 방식일 뿐 파일을 바꾸지 않는다.** 원본은 언제나 펼쳐진 형태이고,
// 접힌 모습은 그릴 때만 만들어낸다. 구역이 같은 파일 안에 있으므로 노드 id를
// 갈아 끼울 일도, 다른 파일을 읽을 일도 없다.

import { parseFlow, parseEdgeLine, idOf, openEdit, NODE_LINE, type FlowGroup } from "./flowFile";

export interface CollapseResult {
    /** 렌더할 mermaid 원문. 접은 게 없으면 원본 그대로다. */
    text: string;
    /** 이 그림에 있는 구역들 — 접기 칩을 그리는 데 쓴다. */
    groups: FlowGroup[];
}

/** 접힌 구역들을 상자 한 칸으로 줄인 그림 원문. */
export function collapseGroups(raw: string, collapsed: ReadonlySet<string>): CollapseResult {
    const doc = parseFlow(raw);
    const ctx = openEdit(raw);
    if (!ctx) return { text: "", groups: doc.groups };
    const { lines, range } = ctx;

    const targets = doc.groups.filter((g) => collapsed.has(g.id));
    if (targets.length === 0) {
        return { text: lines.slice(range.start, range.end).join("\n"), groups: doc.groups };
    }

    // 접힌 구역의 멤버를 그 구역 id로 바꿔치기하기 위한 표.
    const boxOf = new Map<string, string>();
    for (const g of targets) for (const id of g.nodeIds) boxOf.set(id, g.id);

    const dropped = new Set<number>();
    for (const g of targets) for (let i = g.open; i <= g.close; i++) dropped.add(i);

    const out: string[] = [];
    const placed = new Set<string>(); // 상자의 정의(도형·라벨)를 한 번만 적기 위해
    const boxExpr = (groupId: string): string => {
        const g = targets.find((x) => x.id === groupId)!;
        if (placed.has(groupId)) return groupId;
        placed.add(groupId);
        return `${groupId}[[${g.title}]]`;
    };

    for (let i = range.start; i < range.end; i++) {
        if (dropped.has(i)) continue;
        const edge = parseEdgeLine(lines[i]);
        if (edge) {
            const fromBox = boxOf.get(idOf(edge.left));
            const toBox = boxOf.get(idOf(edge.right));
            // 구역 안에서 안으로 향하던 간선은 접히면 자기 자신으로 가는 고리가 된다 — 버린다.
            if (fromBox && toBox && fromBox === toBox) continue;
            const left = fromBox ? boxExpr(fromBox) : edge.left;
            const right = toBox ? boxExpr(toBox) : edge.right;
            out.push(`${edge.indent}${left} ${edge.arrow} ${right}`);
            continue;
        }
        const nodeOnly = NODE_LINE.exec(lines[i]);
        if (nodeOnly && boxOf.has(idOf(nodeOnly[2]))) {
            out.push(`${nodeOnly[1]}${boxExpr(boxOf.get(idOf(nodeOnly[2]))!)}`);
            continue;
        }
        out.push(lines[i]);
    }

    // 같은 상자로 들어오는 화살표가 여럿이면 똑같은 줄이 생긴다 — 한 번만 그린다.
    const seen = new Set<string>();
    const deduped = out.filter((line) => {
        const key = line.trim();
        if (key === "") return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // 아무 간선에도 안 걸린 상자(구역이 통째로 고립된 경우)도 그려는 준다.
    for (const g of targets) {
        if (!placed.has(g.id)) deduped.push(`    ${g.id}[[${g.title}]]`);
    }

    return { text: deduped.join("\n"), groups: doc.groups };
}

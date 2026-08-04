// GROUP 파일들을 읽어 계층 구조로 만든다. 그룹 편집기와 메인 좌측 트리가 공용으로 쓴다.
//
// 구조 추출기가 아직 없어서, 호출할 때마다 .loadstar/GROUP/ 아래 파일을 전부 읽어
// ITEMS를 파싱해 즉석에서 구성한다 — 구조 추출기 완료 시 그쪽으로 대체될 임시 대역.

import { listFormatFiles, readProjectFile } from "./fs";
import { parseElementFilename } from "./tree";
import { parseGroupItems } from "./groupFile";
import { logError } from "./log";

export interface GroupNode {
    path: string; // .loadstar/GROUP/....md
    filename: string;
    name: string;
    items: string[]; // 원본 ITEMS 값(파일명 리스트) — 하위 GROUP과 WP/DWP/OTHER 섞여 있음
    children: GroupNode[];
}

export function basename(p: string): string {
    return p.split(/[\\/]/).pop()!;
}

export async function loadAllGroups(): Promise<GroupNode[]> {
    const paths = await listFormatFiles("GROUP");
    const nodes: GroupNode[] = [];
    for (const p of paths) {
        const filename = basename(p);
        const { name } = parseElementFilename(filename);
        let raw = "";
        try {
            raw = await readProjectFile(p);
        } catch (err) {
            logError(`GROUP 파일 읽기 실패: ${p}`, err);
        }
        nodes.push({ path: p, filename, name, items: parseGroupItems(raw), children: [] });
    }
    return nodes;
}

/** ITEMS를 통해 서로 참조하는 GROUP들로 트리를 구성한다. 어느 GROUP의 ITEMS에도 없으면 최상위. */
export function buildGroupTree(all: GroupNode[]): GroupNode[] {
    const byFilename = new Map(all.map((n) => [n.filename, n]));
    const childFilenames = new Set<string>();
    for (const node of all) {
        node.children = [];
        for (const item of node.items) {
            const child = byFilename.get(item);
            if (child) {
                node.children.push(child);
                childFilenames.add(item);
            }
        }
    }
    return all.filter((n) => !childFilenames.has(n.filename));
}

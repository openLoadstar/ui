// 좌측 트리를 GROUP 계층 기반의 실제 프로젝트 구조로 구성한다.
// GROUP은 폴더처럼, WP/DWP/OTHER는 자신이 속한 GROUP의 자식 노드로 배치된다.
// 어느 GROUP의 ITEMS에도 없는 WP/DWP/OTHER, 그리고 어느 GROUP의 하위도 아닌
// GROUP은 트리 루트에 그대로 노출한다(appendix/GROUP.md의 "미분류" 트레이드오프 대응).

import { listFormatFiles } from "./fs";
import { parseElementFilename, type TreeNode } from "./tree";
import { loadAllGroups, basename } from "./groupIndex";

export async function buildProjectTree(): Promise<TreeNode[]> {
    const [groups, wpPaths, dwpPaths, otherPaths] = await Promise.all([
        loadAllGroups(),
        listFormatFiles("WP"),
        listFormatFiles("DWP"),
        listFormatFiles("OTHER"),
    ]);

    const memberPaths = [...wpPaths, ...dwpPaths, ...otherPaths];
    const memberPathByFilename = new Map(memberPaths.map((p) => [basename(p), p]));

    const groupTreeNodes = new Map<string, TreeNode>();
    for (const g of groups) {
        groupTreeNodes.set(g.filename, { name: g.name, format: "GROUP", path: g.path, children: [] });
    }

    const assignedGroupFilenames = new Set<string>();
    const assignedMemberFilenames = new Set<string>();

    for (const g of groups) {
        const node = groupTreeNodes.get(g.filename)!;
        for (const item of g.items) {
            const childGroupNode = groupTreeNodes.get(item);
            if (childGroupNode) {
                node.children!.push(childGroupNode);
                assignedGroupFilenames.add(item);
                continue;
            }
            const memberPath = memberPathByFilename.get(item);
            if (memberPath) {
                const { format, name } = parseElementFilename(item);
                node.children!.push({ name, format, path: memberPath });
                assignedMemberFilenames.add(item);
            }
            // ITEMS에 있지만 실제 파일이 없는 경우(깨진 참조)는 조용히 건너뛴다 — 검증기(validator) 영역.
        }
    }

    const rootNodes: TreeNode[] = [];

    for (const g of groups) {
        if (!assignedGroupFilenames.has(g.filename)) {
            rootNodes.push(groupTreeNodes.get(g.filename)!);
        }
    }

    for (const p of memberPaths) {
        const filename = basename(p);
        if (!assignedMemberFilenames.has(filename)) {
            const { format, name } = parseElementFilename(filename);
            rootNodes.push({ name, format, path: p });
        }
    }

    return rootNodes;
}

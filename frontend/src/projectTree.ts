// 좌측 트리를 GROUP 계층 기반의 실제 프로젝트 구조로 구성한다.
// GROUP은 폴더처럼, WP/DWP/OTHER는 자신이 속한 GROUP의 자식 노드로 배치된다.
// 어느 GROUP의 ITEMS에도 없는 WP/DWP/OTHER, 그리고 어느 GROUP의 하위도 아닌
// GROUP은 트리 루트에 그대로 노출한다(appendix/GROUP.md의 "미분류" 트레이드오프 대응).

import { listFormatFiles, readProjectFile } from "./fs";
import { parseElementFilename, type TreeNode } from "./tree";
import { loadAllGroups, basename } from "./groupIndex";
import { parseWpStatusBucket } from "./wpStatus";

/** 트리 안의 모든 WP 노드에 STATUS를 읽어 붙인다. 같은 WP가 여러 GROUP에 중복 소속될 수 있어 경로별로 한 번만 읽는다. */
async function attachWpStatuses(nodes: TreeNode[]): Promise<void> {
    const wpNodes: TreeNode[] = [];
    const collect = (list: TreeNode[]) => {
        for (const node of list) {
            if (node.format === "WP") wpNodes.push(node);
            if (node.children) collect(node.children);
        }
    };
    collect(nodes);

    const uniquePaths = [...new Set(wpNodes.map((n) => n.path))];
    const statusByPath = new Map<string, ReturnType<typeof parseWpStatusBucket>>();
    await Promise.all(
        uniquePaths.map(async (path) => {
            try {
                statusByPath.set(path, parseWpStatusBucket(await readProjectFile(path)));
            } catch {
                statusByPath.set(path, null);
            }
        }),
    );

    for (const node of wpNodes) {
        node.status = statusByPath.get(node.path) ?? undefined;
    }
}

/** 트리의 모든 레벨(루트 + 각 GROUP의 children)을 이름 순으로 정렬한다 — 기본 정렬 기준. */
function sortByName(nodes: TreeNode[]): TreeNode[] {
    const sorted = [...nodes].sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));
    for (const node of sorted) {
        if (node.children) node.children = sortByName(node.children);
    }
    return sorted;
}

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

    await attachWpStatuses(rootNodes);

    return sortByName(rootNodes);
}

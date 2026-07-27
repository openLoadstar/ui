// 좌측 트리 데이터 모델과 렌더링.
//
// TODO(구조 추출기 WP 완료 후): 이 목업 데이터를 Go 백엔드의 GROUP_ITEM 엣지 조회 결과로 교체한다.
// GROUP에 속하지 않은 WP/DWP는 트리 루트에 그대로 노출한다(appendix/GROUP.md 트레이드오프 대응).

export type ElementFormat = "GROUP" | "WP" | "DWP";

export interface TreeNode {
    name: string;
    format: ElementFormat;
    children?: TreeNode[];
}

export const mockTree: TreeNode[] = [
    {
        name: "LOADSTAR 2.0 Standalone Viewer",
        format: "WP",
    },
    {
        name: "구조 추출기",
        format: "WP",
    },
    {
        name: "md Mermaid 뷰어",
        format: "WP",
    },
    {
        name: "온디맨드 도메인 조회기",
        format: "WP",
    },
    {
        name: "탐색기 셸",
        format: "WP",
    },
    {
        name: "CLI 진입점",
        format: "WP",
    },
];

const formatIcon: Record<ElementFormat, string> = {
    GROUP: "\u{1F4C1}", // 📁
    WP: "\u{1F4C4}", // 📄
    DWP: "\u{1F5C3}️", // 🗃️
};

export function renderTree(
    container: HTMLElement,
    nodes: TreeNode[],
    onSelect: (node: TreeNode) => void,
): void {
    container.innerHTML = "";
    const list = document.createElement("ul");
    list.className = "tree-list";
    for (const node of nodes) {
        list.appendChild(renderNode(node, onSelect));
    }
    container.appendChild(list);
}

function renderNode(node: TreeNode, onSelect: (node: TreeNode) => void): HTMLElement {
    const li = document.createElement("li");
    li.className = "tree-node";

    const row = document.createElement("div");
    row.className = "tree-row";
    row.innerHTML = `<span class="tree-icon">${formatIcon[node.format]}</span><span class="tree-label">${escapeHtml(node.name)}</span>`;
    row.addEventListener("click", () => onSelect(node));
    li.appendChild(row);

    if (node.children && node.children.length > 0) {
        const childList = document.createElement("ul");
        childList.className = "tree-list tree-list--nested";
        for (const child of node.children) {
            childList.appendChild(renderNode(child, onSelect));
        }
        li.appendChild(childList);
    }

    return li;
}

function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

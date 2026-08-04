// 좌측 트리 데이터 모델과 렌더링. 실제 트리 구성(GROUP 계층 기반)은 projectTree.ts.

export type ElementFormat = "GROUP" | "WP" | "DWP" | "OTHER";

export interface TreeNode {
    name: string;
    format: ElementFormat;
    /** 프로젝트 루트 기준 상대 경로. Go의 ReadFile/WriteFile에 그대로 전달된다. */
    path: string;
    children?: TreeNode[];
}

export const formatIcon: Record<ElementFormat, string> = {
    GROUP: "\u{1F4C1}", // 📁
    WP: "\u{1F4C4}", // 📄
    DWP: "\u{1F5C3}️", // 🗃️
    OTHER: "\u{1F4DD}", // 📝
};

const STRUCTURED_NAME = /^\[([^\]]+)\]\[[^\]]+\]\[[^\]]+\](.+)\.md$/;

/**
 * 파일명(디렉토리 제외)에서 FORMAT과 표시 이름을 뽑아낸다.
 * `[FORMAT][VER][DATE]이름.md` 패턴에 안 맞으면 OTHER로 간주한다
 * (`02.ELEMENT_FORMAT.md` §1 "유일한 예외").
 */
export function parseElementFilename(filename: string): { format: ElementFormat; name: string } {
    const m = filename.match(STRUCTURED_NAME);
    if (m) {
        return { format: m[1] as ElementFormat, name: m[2] };
    }
    return { format: "OTHER", name: filename.replace(/\.md$/, "") };
}

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

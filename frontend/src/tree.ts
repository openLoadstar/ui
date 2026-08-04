// 좌측 트리 데이터 모델과 렌더링. 실제 트리 구성(GROUP 계층 기반)은 projectTree.ts.

import { STATUS_COLORS, STATUS_LABELS, type StatusBucket } from "./wpStatus";

export type ElementFormat = "GROUP" | "WP" | "DWP" | "OTHER";

export interface TreeNode {
    name: string;
    format: ElementFormat;
    /** 프로젝트 루트 기준 상대 경로. Go의 ReadFile/WriteFile에 그대로 전달된다. */
    path: string;
    children?: TreeNode[];
    /** format이 WP일 때만 의미 있음. STATUS 헤더가 없거나 파싱 실패하면 undefined. */
    status?: StatusBucket;
}

// 이모지(📄 등)는 폰트에 색이 고정된 그림이라 CSS로 못 바꾼다 — WP/DWP는
// 같은 모양의 선(stroke) 아이콘으로 만들고 색만 다르게 줘서 구분한다.
function fileIconSvg(strokeColor: string): string {
    return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
}

export const formatIcon: Record<ElementFormat, string> = {
    GROUP: "\u{1F4C1}", // 📁
    WP: fileIconSvg("currentColor"), // 트리 기본 텍스트색(다크 테마에서 흰색 계열)
    DWP: fileIconSvg("var(--accent)"), // 파란 accent색
    OTHER: "\u{1F4DD}", // 📝
};

const STRUCTURED_NAME = /^\[([^\]]+)\]\[[^\]]+\]\[[^\]]+\](.+)\.md$/;
const STRUCTURED_PREFIX = /^(\[[^\]]+\]\[[^\]]+\]\[[^\]]+\]).+(\.md)$/;

/**
 * 파일명의 `[FORMAT][VER][DATE]` 접두어는 그대로 두고 자유 텍스트 이름만
 * 바꾼 새 파일명을 만든다(`02.ELEMENT_FORMAT.md` §2 — 이름만 리네이밍 가능).
 * 접두어 패턴에 안 맞으면(OTHER 등) null.
 */
export function renameFilenameKeepingPrefix(filename: string, newName: string): string | null {
    const m = filename.match(STRUCTURED_PREFIX);
    if (!m) return null;
    return `${m[1]}${newName}${m[2]}`;
}

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

export interface TreeCallbacks {
    onSelect: (node: TreeNode) => void;
    onContextMenu?: (node: TreeNode, x: number, y: number) => void;
    /** GROUP 더블클릭 시 펼침/접힘을 토글해달라는 신호. */
    onToggleCollapse?: (node: TreeNode) => void;
    /** GROUP이 지금 접혀 있는지(자식 숨김) 조회 — 상태는 호출 쪽이 들고 있는다. */
    isCollapsed?: (node: TreeNode) => boolean;
}

export function renderTree(container: HTMLElement, nodes: TreeNode[], callbacks: TreeCallbacks): void {
    container.innerHTML = "";
    const list = document.createElement("ul");
    list.className = "tree-list";
    for (const node of nodes) {
        list.appendChild(renderNode(node, callbacks));
    }
    container.appendChild(list);
}

// 더블클릭으로 판정되기 전까지 단일 클릭 처리(onSelect)를 미루는 유예 시간.
// 이 시간 안에 두 번째 클릭(→ dblclick)이 오면 onSelect는 아예 호출되지 않는다.
const GROUP_CLICK_DELAY_MS = 220;

function renderNode(node: TreeNode, callbacks: TreeCallbacks): HTMLElement {
    const li = document.createElement("li");
    li.className = "tree-node";

    const row = document.createElement("div");
    row.className = "tree-row";
    const isGroup = node.format === "GROUP";
    const hasChildren = !!node.children && node.children.length > 0;
    const collapsed = isGroup && hasChildren && (callbacks.isCollapsed?.(node) ?? false);
    // 접기/펼치기 화살표는 GROUP+자식 있을 때만 보이지만, 자리는 모든 행에 동일하게
    // 둬서 들여쓰기가 포맷에 따라 어긋나지 않게 한다.
    const toggleArrow =
        isGroup && hasChildren
            ? `<span class="tree-toggle">${collapsed ? "▸" : "▾"}</span>`
            : `<span class="tree-toggle tree-toggle--empty"></span>`;
    const statusDot = node.status
        ? `<span class="tree-status-dot" style="background:${STATUS_COLORS[node.status]}" title="${STATUS_LABELS[node.status]}"></span>`
        : "";
    row.innerHTML = `${toggleArrow}<span class="tree-icon">${formatIcon[node.format]}</span>${statusDot}<span class="tree-label">${escapeHtml(node.name)}</span>`;

    if (isGroup && callbacks.onToggleCollapse) {
        let pendingClick: ReturnType<typeof setTimeout> | null = null;
        row.addEventListener("click", () => {
            if (pendingClick) return; // 이미 단일 클릭을 기다리는 중(연타 방지)
            pendingClick = setTimeout(() => {
                pendingClick = null;
                callbacks.onSelect(node);
            }, GROUP_CLICK_DELAY_MS);
        });
        row.addEventListener("dblclick", () => {
            if (pendingClick) {
                clearTimeout(pendingClick);
                pendingClick = null;
            }
            callbacks.onToggleCollapse!(node); // 더블클릭은 오직 접기/펼치기만 — 정보 탭은 건드리지 않는다
        });
    } else {
        row.addEventListener("click", () => callbacks.onSelect(node));
    }

    // 우클릭 메뉴(이름변경/삭제)는 WP/DWP에만 둔다 — GROUP은 그룹 편집기가 전담,
    // OTHER는 범위 밖.
    if (callbacks.onContextMenu && (node.format === "WP" || node.format === "DWP")) {
        row.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            callbacks.onContextMenu!(node, e.clientX, e.clientY);
        });
    }
    li.appendChild(row);

    if (hasChildren && !collapsed) {
        const childList = document.createElement("ul");
        childList.className = "tree-list tree-list--nested";
        for (const child of node.children!) {
            childList.appendChild(renderNode(child, callbacks));
        }
        li.appendChild(childList);
    }

    return li;
}

/**
 * WP 노드를 STATUS 필터로 걸러낸 트리 복사본을 만든다.
 * GROUP/DWP/OTHER는 필터 대상이 아니므로 항상 유지한다(자식이 전부 걸러져도 GROUP 자체는 남는다).
 * status가 없는 WP(파싱 실패 등)도 안전하게 항상 표시한다.
 */
export function filterTreeByStatus(nodes: TreeNode[], activeStatuses: ReadonlySet<StatusBucket>): TreeNode[] {
    const result: TreeNode[] = [];
    for (const node of nodes) {
        if (node.format === "WP" && node.status && !activeStatuses.has(node.status)) continue;
        const children = node.children ? filterTreeByStatus(node.children, activeStatuses) : undefined;
        result.push(children ? { ...node, children } : { ...node });
    }
    return result;
}

function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

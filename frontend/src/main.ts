import "./style.css";
import { renderTree, renameFilenameKeepingPrefix, resolveOtherFilename, parseElementFilename, type TreeNode } from "./tree";
import type { ViewMode } from "./viewMode";
import { groupTreeView } from "./groupTreeView";
import { dateTreeView } from "./dateTreeView";
import { searchView, focusSearchInput } from "./searchView";
import { parseFlow } from "./flowFile";
import { TabManager } from "./tabs";
import { initSplitter } from "./splitter";
import { logInfo, logError } from "./log";
import { openBrowseModal } from "./browseModal";
import { renderProjectPickerScreen, openProjectPickerModal } from "./projectPicker";
import { openGroupEditor } from "./groupEditor";
import { openOtherFilterSettings } from "./otherFilterSettings";
import { openRenameDialog } from "./renameDialog";
import { openDeleteDialog } from "./deleteDialog";
import { openReindexDialog } from "./reindexDialog";
import { createElement, readProjectFile, writeProjectFile, renameProjectFile, reindexProject } from "./fs";
import { loadAllGroups } from "./groupIndex";
import { parseGroupItems, setGroupItems } from "./groupFile";

// 새 뷰는 여기 추가하면 된다 — `[WP][2.0][2026.08.13]뷰 전환 아키텍처.md` 참조.
const VIEWS: ViewMode[] = [groupTreeView, dateTreeView, searchView];

const app = document.querySelector<HTMLDivElement>("#app")!;

// 프로젝트를 다시 열면 startExplorer가 다시 돌아 화면을 통째로 새로 만든다 —
// 전역 단축키 핸들러가 중복 등록되지 않도록 이전 것을 떼어낸다.
let globalKeyHandler: ((e: KeyboardEvent) => void) | null = null;

function startExplorer(projectRoot: string): void {
    logInfo(`프로젝트 열림: ${projectRoot}`);
    if (globalKeyHandler) document.removeEventListener("keydown", globalKeyHandler);

    app.innerHTML = `
      <div id="layout">
        <div id="menubar">
          <div class="menu-item-wrap">
            <span class="menu-item" data-menu="file">파일</span>
            <div class="menu-dropdown" id="file-menu-dropdown" hidden>
              <div class="menu-dropdown-item" data-role="open-project">프로젝트 열기...</div>
              <div class="menu-dropdown-item" data-role="browse-file">탐색...</div>
            </div>
          </div>
          <div class="menu-item-wrap">
            <span class="menu-item" data-menu="edit">편집</span>
            <div class="menu-dropdown" id="edit-menu-dropdown" hidden>
              <div class="menu-dropdown-item" data-role="find">찾기<span class="menu-dropdown-shortcut">Ctrl+F</span></div>
              <div class="menu-dropdown-item" data-role="search-all">전체 검색<span class="menu-dropdown-shortcut">Ctrl+Shift+F</span></div>
              <div class="menu-dropdown-sep"></div>
              <div class="menu-dropdown-item" data-role="group-editor">그룹편집</div>
              <div class="menu-dropdown-item" data-role="other-filter-settings">OTHER 확장자 설정</div>
            </div>
          </div>
          <div class="menu-item-wrap">
            <span class="menu-item" data-menu="view">보기</span>
            <div class="menu-dropdown" id="view-menu-dropdown" hidden></div>
          </div>
        </div>
        <div id="toolbar">
          <button class="tb-btn" data-action="new-wp">+ WP</button>
          <button class="tb-btn" data-action="new-dwp">+ DWP</button>
          <button class="tb-btn" data-role="new-group">+ GROUP</button>
          <button class="tb-btn" data-action="new-flow">+ FLOW</button>
          <button class="tb-btn" data-action="reindex">⟳ 재색인</button>
          <div class="toolbar-spacer"></div>
          <select id="view-switcher" class="view-switcher"></select>
          <div id="view-filter-panel" class="status-filter"></div>
        </div>
        <div id="main">
          <div id="tree-panel" class="panel">
            <div class="tree-header">
              <button class="tb-btn" data-role="refresh-tree" title="외부에서 바뀐 파일 내용을 다시 불러옵니다">⟳ 업데이트</button>
              <span class="tree-updated-at"></span>
            </div>
            <div id="tree-body" class="tree-body"></div>
          </div>
          <div id="splitter" class="splitter"></div>
          <div id="content-panel" class="panel">
            <div id="tab-bar"></div>
            <div id="tab-content"></div>
          </div>
        </div>
      </div>
    `;

    const treePanel = document.querySelector<HTMLDivElement>("#tree-panel")!;
    const treeBody = document.querySelector<HTMLDivElement>("#tree-body")!;
    const treeUpdatedAt = document.querySelector<HTMLElement>(".tree-updated-at")!;
    const viewSwitcherEl = document.querySelector<HTMLSelectElement>("#view-switcher")!;
    const viewFilterPanelEl = document.querySelector<HTMLDivElement>("#view-filter-panel")!;
    const splitter = document.querySelector<HTMLDivElement>("#splitter")!;
    const tabBar = document.querySelector<HTMLDivElement>("#tab-bar")!;
    const tabContent = document.querySelector<HTMLDivElement>("#tab-content")!;

    initSplitter(splitter, treePanel, { min: 260, max: 640 }); // 260px = 트리 패널 초기 폭(style.css #tree-panel)

    const tabs = new TabManager(tabBar, tabContent, () => void refreshTreeAndTimestamp());

    function markUpdated(): void {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        treeUpdatedAt.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} updated`;
    }

    // 현재 뷰가 걸러서 넘겨준 결과. 필터 변경은 재조회가 아니라 이걸 갱신하는 것뿐
    // (`[WP][2.0][2026.08.13]뷰 전환 아키텍처.md` COMMENT — 동기화 이슈 유예 결정).
    let currentView: ViewMode = VIEWS[0];
    let currentFilteredNodes: TreeNode[] = [];
    // 접힌 GROUP의 path 집합 — 재렌더링(필터 변경, 업데이트 등)에도 유지되도록 트리 데이터가 아니라 여기 따로 둔다.
    const collapsedGroupPaths = new Set<string>();

    function onTreeNodeSelect(node: TreeNode): void {
        logInfo(`트리 선택: ${node.name} (${node.path})`);
        void (async () => {
            // 검색 결과의 라인 히트 노드는 name이 그 줄 원문이라 탭 제목으로 쓸 수 없다 —
            // 파일명에서 다시 표시 이름을 뽑는다.
            const target: TreeNode =
                node.hitIndex === undefined
                    ? node
                    : { ...node, name: parseElementFilename(node.path.split("/").pop() ?? node.path).name };
            await tabs.open(target);
            // 검색 뷰에서 연 파일은 같은 키워드가 하이라이트된 상태로 진입한다
            // (`[WP][2.0][2026.09.10]검색.md` G2).
            const query = currentView.selectionQuery?.();
            if (query) tabs.openFind(query, node.hitIndex ?? 0);
        })();
    }

    function toggleGroupCollapse(node: TreeNode): void {
        if (collapsedGroupPaths.has(node.path)) collapsedGroupPaths.delete(node.path);
        else collapsedGroupPaths.add(node.path);
        renderFilteredTree();
    }

    function renderFilteredTree(): void {
        renderTree(treeBody, currentFilteredNodes, {
            onSelect: onTreeNodeSelect,
            onContextMenu: openTreeContextMenu,
            onToggleCollapse: toggleGroupCollapse,
            isCollapsed: (node) => collapsedGroupPaths.has(node.path),
        });
    }

    function onFilterChange(filtered: TreeNode[]): void {
        currentFilteredNodes = filtered;
        renderFilteredTree();
    }

    viewSwitcherEl.innerHTML = VIEWS.map((v) => `<option value="${v.id}">${v.label}</option>`).join("");
    viewSwitcherEl.addEventListener("change", () => switchToView(viewSwitcherEl.value));

    /**
     * 뷰 전환의 단일 진입점 — 툴바 콤보박스, 보기 메뉴, Ctrl+Shift+F가 모두 여기를 탄다.
     * 이미 그 뷰면 아무것도 하지 않는다(필터 패널이 다시 마운트되며 입력 포커스가 튀는 것 방지).
     */
    function switchToView(id: string): void {
        const view = VIEWS.find((v) => v.id === id);
        if (!view || view === currentView) return;
        currentView = view;
        viewSwitcherEl.value = id;
        renderViewMenu();
        void renderCurrentTree();
    }

    /** 보기 메뉴 = 뷰 목록. 현재 뷰에 체크 표시를 단다. */
    function renderViewMenu(): void {
        viewDropdown.innerHTML = VIEWS.map(
            (v) =>
                `<div class="menu-dropdown-item" data-view-id="${v.id}"><span class="menu-dropdown-check">${v.id === currentView.id ? "✓" : ""}</span>${v.label}${v.id === searchView.id ? '<span class="menu-dropdown-shortcut">Ctrl+Shift+F</span>' : ""}</div>`,
        ).join("");
        for (const item of Array.from(viewDropdown.querySelectorAll<HTMLElement>("[data-view-id]"))) {
            item.addEventListener("click", () => {
                closeAllDropdowns();
                const id = item.dataset.viewId!;
                switchToView(id);
                if (id === searchView.id) setTimeout(() => focusSearchInput(), 0);
            });
        }
    }

    async function renderCurrentTree(): Promise<void> {
        let nodes: TreeNode[] = [];
        try {
            nodes = await currentView.buildNodes();
        } catch (err) {
            logError("트리 구성 실패", err);
        }
        // renderFilterPanel은 계약상 마운트 시 onFilterChange를 한 번 호출한다 —
        // 그게 currentFilteredNodes를 채우고 트리 렌더까지 트리거한다.
        currentView.renderFilterPanel(viewFilterPanelEl, nodes, onFilterChange);
    }

    async function refreshTreeAndTimestamp(): Promise<void> {
        await renderCurrentTree();
        markUpdated();
    }

    void refreshTreeAndTimestamp();

    document.querySelector<HTMLElement>('[data-role="refresh-tree"]')!.addEventListener("click", () => {
        void (async () => {
            await renderCurrentTree();
            const refreshed = await tabs.refreshAll();
            markUpdated();
            logInfo(`업데이트 완료 — 열린 탭 ${refreshed}개 새로고침`);
        })();
    });

    /**
     * "+ WP"/"+ DWP" — 이름만 물어보고 스캐폴딩된 파일을 바로 생성(그룹 편집기의
     * "+ GROUP"과 동일한 패턴)한 뒤, 편집 모드로 탭을 열어 SUMMARY/GOAL/TODO를
     * 채우게 한다. pendingCreation 탭이라 닫기(×)를 누르면 저장 확인 대신
     * 삭제 확인이 뜬다(tabs.ts).
     */
    async function createAndOpenElement(format: "WP" | "DWP" | "FLOW"): Promise<void> {
        const name = prompt(`새 ${format} 이름:`);
        if (name === null) return; // 취소
        const trimmed = name.trim();
        if (!trimmed) return;

        let path: string;
        try {
            path = await createElement(format, trimmed);
            logInfo(`${format} 생성: ${path}`);
        } catch (err) {
            logError(`${format} 생성 실패`, err);
            alert(`생성 실패: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }

        await refreshTreeAndTimestamp();
        await tabs.open({ name: trimmed, format, path }, { pendingCreation: true });
    }

    document.querySelector<HTMLElement>('[data-action="new-wp"]')!.addEventListener("click", () => void createAndOpenElement("WP"));
    document.querySelector<HTMLElement>('[data-action="new-dwp"]')!.addEventListener("click", () => void createAndOpenElement("DWP"));
    document.querySelector<HTMLElement>('[data-action="new-flow"]')!.addEventListener("click", () => void createAndOpenElement("FLOW"));

    document.querySelector<HTMLElement>('[data-action="reindex"]')!.addEventListener("click", () => {
        openReindexDialog({ onReindex: reindexProject });
    });

    // --- WP/DWP 우클릭 메뉴(이름변경/삭제) ---

    function closeTreeContextMenu(): void {
        document.querySelector(".context-menu")?.remove();
    }

    function openTreeContextMenu(node: TreeNode, x: number, y: number): void {
        closeTreeContextMenu();
        const menu = document.createElement("div");
        menu.className = "context-menu";
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.innerHTML = `
            <div class="context-menu-item" data-role="rename">이름변경</div>
            <div class="context-menu-item context-menu-item--danger" data-role="delete">삭제</div>
        `;
        document.body.appendChild(menu);
        menu.querySelector('[data-role="rename"]')!.addEventListener("click", () => {
            closeTreeContextMenu();
            renameElement(node);
        });
        menu.querySelector('[data-role="delete"]')!.addEventListener("click", () => {
            closeTreeContextMenu();
            deleteElement(node);
        });
        // 지금 이 클릭 이벤트가 document까지 버블링돼서 바로 닫히지 않도록 다음 tick에 등록.
        setTimeout(() => document.addEventListener("click", closeTreeContextMenu, { once: true }), 0);
    }

    /** filename이 소속된 모든 GROUP의 ITEMS를 replacement로 갱신한다(null이면 제거). */
    async function updateGroupMemberships(filename: string, replacement: string | null): Promise<void> {
        const groups = await loadAllGroups();
        for (const g of groups) {
            if (!g.items.includes(filename)) continue;
            const raw = await readProjectFile(g.path);
            const items = replacement
                ? parseGroupItems(raw).map((f) => (f === filename ? replacement : f))
                : parseGroupItems(raw).filter((f) => f !== filename);
            await writeProjectFile(g.path, setGroupItems(raw, items));
        }
    }

    function renameElement(node: TreeNode): void {
        const filename = node.path.split("/").pop()!;
        // OTHER는 `[FORMAT][VER][DATE]` 접두어 규칙이 면제라(§02.ELEMENT_FORMAT.md §1)
        // 붙이고 뗄 접두어 자체가 없다 — 입력값이 곧 새 파일명(확장자 포함).
        const resolveNewFilename =
            node.format === "OTHER"
                ? resolveOtherFilename
                : (newDisplayName: string) => renameFilenameKeepingPrefix(filename, newDisplayName);
        // OTHER는 node.name이 표시용으로 ".md"를 뗀 값일 수 있다(tree.ts:parseElementFilename) —
        // 여기선 입력값이 그대로 새 파일명이 되니, 원본 확장자를 잃지 않도록 전체 파일명을 채운다.
        openRenameDialog({
            currentFilename: filename,
            currentDisplayName: node.format === "OTHER" ? filename : node.name,
            resolveNewFilename,
            onRename: async (newFilename) => {
                const dir = node.path.slice(0, node.path.length - filename.length);
                const newPath = `${dir}${newFilename}`;
                await renameProjectFile(node.path, newPath);
                await updateGroupMemberships(filename, newFilename);
                logInfo(`이름 변경: ${node.path} → ${newPath}`);
                await tabs.closeByPath(node.path);
                await refreshTreeAndTimestamp();
            },
        });
    }

    function deleteElement(node: TreeNode): void {
        void (async () => {
            // FLOW는 그림 한 장이 통째로 들어 있는 파일이라, 노드가 남아 있는 동안은
            // 목록에서 치우는 것조차 막는다(사용자 결정) — 비우고 지우든, 탐색기에서
            // 직접 옮기든 한 번 더 의식하게 만드는 쪽을 택했다.
            if (node.format === "FLOW") {
                try {
                    const doc = parseFlow(await readProjectFile(node.path));
                    if (doc.nodes.length > 0) {
                        alert(
                            `"${node.name}" 흐름에 노드가 ${doc.nodes.length}개 있어 삭제할 수 없습니다.` +
                                " 그림 편집에서 노드를 모두 지운 뒤 다시 시도하거나, 탐색기에서 파일을 직접 옮기세요.",
                        );
                        return;
                    }
                } catch (err) {
                    // 읽지 못하면 판단할 근거가 없다 — 막지 않고 평소대로 진행한다.
                    logError(`FLOW 노드 수 확인 실패: ${node.path}`, err);
                }
            }
            openDeleteDialogFor(node);
        })();
    }

    /** "삭제"는 실제로 지우지 않고 .del을 덧붙여 목록에서만 숨긴다(deleteDialog.ts 참조) —
     * 대부분 설계 문서라 진짜 삭제는 탐색기에서 직접 하는 게 안전하다는 판단.
     * GROUP의 ITEMS는 일부러 안 건드린다 — 탐색기에서 .del만 떼어 되돌리면 소속도 같이 복구되도록. */
    function openDeleteDialogFor(node: TreeNode): void {
        openDeleteDialog({
            displayName: node.name,
            format: node.format,
            onDelete: async () => {
                const delPath = `${node.path}.del`;
                await renameProjectFile(node.path, delPath);
                logInfo(`삭제(숨김): ${node.path} → ${delPath}`);
                await tabs.closeByPath(node.path);
                await refreshTreeAndTimestamp();
            },
        });
    }

    document.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => {
        const handled = ["new-wp", "new-dwp", "new-flow", "reindex"];
        if (handled.includes(el.dataset.action ?? "")) return; // 위에서 별도 처리
        el.addEventListener("click", () => {
            const action = el.dataset.action;
            logInfo(`[TODO] action not yet implemented: ${action}`);
        });
    });

    const fileDropdown = document.querySelector<HTMLElement>("#file-menu-dropdown")!;
    const editDropdown = document.querySelector<HTMLElement>("#edit-menu-dropdown")!;
    const viewDropdown = document.querySelector<HTMLElement>("#view-menu-dropdown")!;
    const allDropdowns = [fileDropdown, editDropdown, viewDropdown];

    function closeAllDropdowns(): void {
        for (const d of allDropdowns) d.hidden = true;
    }

    document.querySelector<HTMLElement>('[data-menu="file"]')!.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = fileDropdown.hidden;
        closeAllDropdowns();
        fileDropdown.hidden = !willOpen;
    });

    document.querySelector<HTMLElement>('[data-menu="edit"]')!.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = editDropdown.hidden;
        closeAllDropdowns();
        editDropdown.hidden = !willOpen;
        // 열린 탭이 없으면 "찾기"는 대상이 없다 — 눌러도 아무 일이 없는 대신 흐리게 표시한다.
        editDropdown
            .querySelector('[data-role="find"]')!
            .classList.toggle("menu-dropdown-item--disabled", !tabs.hasActiveTab());
    });

    document.querySelector<HTMLElement>('[data-menu="view"]')!.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = viewDropdown.hidden;
        closeAllDropdowns();
        viewDropdown.hidden = !willOpen;
    });

    document.addEventListener("click", closeAllDropdowns);

    editDropdown.querySelector<HTMLElement>('[data-role="find"]')!.addEventListener("click", () => {
        if (!tabs.hasActiveTab()) return;
        closeAllDropdowns();
        tabs.openFind();
    });

    editDropdown.querySelector<HTMLElement>('[data-role="search-all"]')!.addEventListener("click", () => {
        closeAllDropdowns();
        switchToView(searchView.id);
        setTimeout(() => focusSearchInput(), 0);
    });

    renderViewMenu();

    fileDropdown.querySelector<HTMLElement>('[data-role="browse-file"]')!.addEventListener("click", () => {
        closeAllDropdowns();
        void openBrowseModal(tabs);
    });

    fileDropdown.querySelector<HTMLElement>('[data-role="open-project"]')!.addEventListener("click", () => {
        closeAllDropdowns();
        openProjectPickerModal((root) => startExplorer(root));
    });

    editDropdown.querySelector<HTMLElement>('[data-role="group-editor"]')!.addEventListener("click", () => {
        closeAllDropdowns();
        openGroupEditor(() => void refreshTreeAndTimestamp());
    });

    editDropdown.querySelector<HTMLElement>('[data-role="other-filter-settings"]')!.addEventListener("click", () => {
        closeAllDropdowns();
        openOtherFilterSettings(() => void refreshTreeAndTimestamp());
    });

    document.querySelector<HTMLElement>('[data-role="new-group"]')!.addEventListener("click", () => {
        openGroupEditor(() => void refreshTreeAndTimestamp());
    });

    // --- 전역 단축키 (`[WP][2.0][2026.09.10]검색.md`) ---
    globalKeyHandler = (e: KeyboardEvent) => {
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && e.shiftKey && (e.key === "F" || e.key === "f")) {
            e.preventDefault();
            switchToView(searchView.id);
            // 뷰 전환(비동기 buildNodes)이 끝나고 필터 패널이 마운트된 뒤에 포커스를 준다.
            setTimeout(() => focusSearchInput(), 0);
            return;
        }
        if (ctrl && (e.key === "F" || e.key === "f")) {
            e.preventDefault();
            tabs.openFind();
            return;
        }
        // 그림 편집은 textarea가 아니라 구조 조작이라 브라우저 기본 undo가 없다.
        // 그림 편집 모드가 아닐 때는 기본 동작(텍스트 실행취소)을 그대로 둔다.
        if (ctrl && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
            if (tabs.undoFlowEdit()) e.preventDefault();
            return;
        }
        if (e.key === "F3") {
            e.preventDefault();
            tabs.findNext(e.shiftKey ? -1 : 1);
            return;
        }
        if (e.key === "Escape" && tabs.isFindOpen()) {
            tabs.closeFind();
        }
    };
    document.addEventListener("keydown", globalKeyHandler);

    logInfo("앱 초기화 완료");
}

renderProjectPickerScreen(app, (root) => startExplorer(root));

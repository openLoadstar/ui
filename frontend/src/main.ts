import "./style.css";
import { renderTree, filterTreeByStatus, renameFilenameKeepingPrefix, type TreeNode } from "./tree";
import { buildProjectTree } from "./projectTree";
import { TabManager } from "./tabs";
import { initSplitter } from "./splitter";
import { logInfo, logError } from "./log";
import { openBrowseModal } from "./browseModal";
import { renderProjectPickerScreen, openProjectPickerModal } from "./projectPicker";
import { openGroupEditor } from "./groupEditor";
import { openOtherFilterSettings } from "./otherFilterSettings";
import { createElement, readProjectFile, writeProjectFile, deleteProjectFile, renameProjectFile } from "./fs";
import { loadAllGroups } from "./groupIndex";
import { parseGroupItems, setGroupItems } from "./groupFile";
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS, type StatusBucket } from "./wpStatus";

const app = document.querySelector<HTMLDivElement>("#app")!;

function startExplorer(projectRoot: string): void {
    logInfo(`프로젝트 열림: ${projectRoot}`);

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
              <div class="menu-dropdown-item" data-role="group-editor">그룹편집</div>
              <div class="menu-dropdown-item" data-role="other-filter-settings">OTHER 확장자 설정</div>
            </div>
          </div>
          <span class="menu-item" data-action="view">보기</span>
        </div>
        <div id="toolbar">
          <button class="tb-btn" data-action="new-wp">+ WP</button>
          <button class="tb-btn" data-action="new-dwp">+ DWP</button>
          <button class="tb-btn" data-role="new-group">+ GROUP</button>
          <button class="tb-btn" data-action="reindex">⟳ 재색인</button>
          <div class="toolbar-spacer"></div>
          <div id="status-filter" class="status-filter"></div>
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
    const statusFilterEl = document.querySelector<HTMLDivElement>("#status-filter")!;
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

    // 마지막으로 불러온(미필터) 트리. 체크박스만 바꿀 때는 재조회 없이 이걸 다시 필터링해서 그린다.
    let latestProjectTree: TreeNode[] = [];
    const activeStatuses = new Set<StatusBucket>(STATUS_ORDER);
    // 접힌 GROUP의 path 집합 — 재렌더링(필터 토글, 업데이트 등)에도 유지되도록 트리 데이터가 아니라 여기 따로 둔다.
    const collapsedGroupPaths = new Set<string>();

    function onTreeNodeSelect(node: TreeNode): void {
        logInfo(`트리 선택: ${node.name} (${node.path})`);
        void tabs.open(node);
    }

    function toggleGroupCollapse(node: TreeNode): void {
        if (collapsedGroupPaths.has(node.path)) collapsedGroupPaths.delete(node.path);
        else collapsedGroupPaths.add(node.path);
        renderFilteredTree();
    }

    function renderFilteredTree(): void {
        renderTree(treeBody, filterTreeByStatus(latestProjectTree, activeStatuses), {
            onSelect: onTreeNodeSelect,
            onContextMenu: openTreeContextMenu,
            onToggleCollapse: toggleGroupCollapse,
            isCollapsed: (node) => collapsedGroupPaths.has(node.path),
        });
    }

    statusFilterEl.innerHTML = STATUS_ORDER.map(
        (status) => `
      <label class="status-filter-item" data-status="${status}">
        <input type="checkbox" checked />
        <span class="status-dot" style="background:${STATUS_COLORS[status]}"></span>
        ${STATUS_LABELS[status]}
      </label>`,
    ).join("");

    statusFilterEl.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const status = checkbox.closest<HTMLElement>("[data-status]")!.dataset.status as StatusBucket;
            if (checkbox.checked) activeStatuses.add(status);
            else activeStatuses.delete(status);
            renderFilteredTree();
        });
    });

    async function renderCurrentTree(): Promise<void> {
        try {
            latestProjectTree = await buildProjectTree();
        } catch (err) {
            logError("트리 구성 실패", err);
            latestProjectTree = [];
        }
        renderFilteredTree();
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
    async function createAndOpenElement(format: "WP" | "DWP"): Promise<void> {
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
            void renameElement(node);
        });
        menu.querySelector('[data-role="delete"]')!.addEventListener("click", () => {
            closeTreeContextMenu();
            void deleteElement(node);
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

    async function renameElement(node: TreeNode): Promise<void> {
        const newName = prompt(`새 이름:`, node.name);
        if (newName === null) return;
        const trimmed = newName.trim();
        if (!trimmed || trimmed === node.name) return;

        const filename = node.path.split("/").pop()!;
        const newFilename = renameFilenameKeepingPrefix(filename, trimmed);
        if (!newFilename) {
            alert("파일명 형식을 해석할 수 없어 이름을 바꿀 수 없습니다.");
            return;
        }
        const dir = node.path.slice(0, node.path.length - filename.length);
        const newPath = `${dir}${newFilename}`;

        if (
            !confirm(
                `"${node.name}" → "${trimmed}"로 이름을 바꿀까요?\n\n이 파일을 참조하는 다른 WP의 CONNECTIONS는 자동으로 갱신되지 않습니다(나중에 검증 도구가 깨진 참조로 감지). 소속 GROUP은 자동으로 갱신됩니다.`,
            )
        ) {
            return;
        }

        try {
            await renameProjectFile(node.path, newPath);
            await updateGroupMemberships(filename, newFilename);
            logInfo(`이름 변경: ${node.path} → ${newPath}`);
        } catch (err) {
            logError(`이름 변경 실패: ${node.path}`, err);
            alert(`이름 변경 실패: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }

        await tabs.closeByPath(node.path);
        await refreshTreeAndTimestamp();
    }

    async function deleteElement(node: TreeNode): Promise<void> {
        if (
            !confirm(
                `"${node.name}"(${node.format})을 삭제할까요?\n\n파일이 실제로 삭제되며 되돌릴 수 없습니다. 이 파일을 참조하는 다른 WP의 CONNECTIONS는 자동으로 정리되지 않습니다(나중에 검증 도구가 깨진 참조로 감지). 소속 GROUP에서는 자동으로 제거됩니다.`,
            )
        ) {
            return;
        }

        const filename = node.path.split("/").pop()!;
        try {
            await deleteProjectFile(node.path);
            await updateGroupMemberships(filename, null);
            logInfo(`삭제: ${node.path}`);
        } catch (err) {
            logError(`삭제 실패: ${node.path}`, err);
            alert(`삭제 실패: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }

        await tabs.closeByPath(node.path);
        await refreshTreeAndTimestamp();
    }

    document.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => {
        if (el.dataset.action === "new-wp" || el.dataset.action === "new-dwp") return; // 위에서 별도 처리
        el.addEventListener("click", () => {
            const action = el.dataset.action;
            logInfo(`[TODO] action not yet implemented: ${action}`);
        });
    });

    const fileDropdown = document.querySelector<HTMLElement>("#file-menu-dropdown")!;
    const editDropdown = document.querySelector<HTMLElement>("#edit-menu-dropdown")!;
    const allDropdowns = [fileDropdown, editDropdown];

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
    });

    document.addEventListener("click", closeAllDropdowns);

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

    logInfo("앱 초기화 완료");
}

renderProjectPickerScreen(app, (root) => startExplorer(root));

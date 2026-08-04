import "./style.css";
import { renderTree, filterTreeByStatus, type TreeNode } from "./tree";
import { buildProjectTree } from "./projectTree";
import { TabManager } from "./tabs";
import { initSplitter } from "./splitter";
import { logInfo, logError } from "./log";
import { openBrowseModal } from "./browseModal";
import { renderProjectPickerScreen, openProjectPickerModal } from "./projectPicker";
import { openGroupEditor } from "./groupEditor";
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

    const tabs = new TabManager(tabBar, tabContent);

    function markUpdated(): void {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        treeUpdatedAt.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} updated`;
    }

    // 마지막으로 불러온(미필터) 트리. 체크박스만 바꿀 때는 재조회 없이 이걸 다시 필터링해서 그린다.
    let latestProjectTree: TreeNode[] = [];
    const activeStatuses = new Set<StatusBucket>(STATUS_ORDER);

    function onTreeNodeSelect(node: TreeNode): void {
        if (node.format === "GROUP") return; // GROUP은 컨테이너일 뿐, 탭으로 열지 않는다
        logInfo(`트리 선택: ${node.name} (${node.path})`);
        void tabs.open(node);
    }

    function renderFilteredTree(): void {
        renderTree(treeBody, filterTreeByStatus(latestProjectTree, activeStatuses), onTreeNodeSelect);
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

    document.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => {
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

    document.querySelector<HTMLElement>('[data-role="new-group"]')!.addEventListener("click", () => {
        openGroupEditor(() => void refreshTreeAndTimestamp());
    });

    logInfo("앱 초기화 완료");
}

renderProjectPickerScreen(app, (root) => startExplorer(root));

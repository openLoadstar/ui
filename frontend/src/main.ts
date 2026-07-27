import "./style.css";
import { mockTree, renderTree, type TreeNode } from "./tree";
import { TabManager } from "./tabs";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div id="layout">
    <div id="menubar">
      <span class="menu-item" data-action="new-wp">파일</span>
      <span class="menu-item" data-action="edit">편집</span>
      <span class="menu-item" data-action="view">보기</span>
    </div>
    <div id="toolbar">
      <button class="tb-btn" data-action="new-wp">+ WP</button>
      <button class="tb-btn" data-action="new-dwp">+ DWP</button>
      <button class="tb-btn" data-action="new-group">+ GROUP</button>
      <button class="tb-btn" data-action="reindex">⟳ 재색인</button>
    </div>
    <div id="main">
      <div id="tree-panel"></div>
      <div id="content-panel">
        <div id="tab-bar"></div>
        <div id="tab-content"></div>
      </div>
    </div>
  </div>
`;

const treePanel = document.querySelector<HTMLDivElement>("#tree-panel")!;
const tabBar = document.querySelector<HTMLDivElement>("#tab-bar")!;
const tabContent = document.querySelector<HTMLDivElement>("#tab-content")!;

const tabs = new TabManager(tabBar, tabContent);

renderTree(treePanel, mockTree, (node: TreeNode) => {
    if (node.format === "GROUP") return; // GROUP은 컨테이너일 뿐, 탭으로 열지 않는다
    tabs.open(node.name);
});

document.querySelectorAll<HTMLElement>("[data-action]").forEach((el) => {
    el.addEventListener("click", () => {
        const action = el.dataset.action;
        console.log(`[TODO] action not yet implemented: ${action}`);
    });
});

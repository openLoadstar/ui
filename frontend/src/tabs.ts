// 우측 탭 영역 관리 — 탭 열기/닫기/전환 + 보기·편집 모드 + 저장.

import { parseElementFilename, type ElementFormat, type TreeNode } from "./tree";
import {
    readProjectFile,
    writeProjectFile,
    readExternalFile,
    deleteProjectFile,
    createElement,
    gitFileHistory,
    gitFileAtCommit,
} from "./fs";
import { renderMarkdown, renderPlainText, renderHtmlFile } from "./viewer";
import { renderGroupInfo } from "./groupInfoView";
import { validateContent } from "./validate";
import { logInfo, logError } from "./log";
import { FindBar, type FindTarget } from "./find";
import { fillHistorySelect, WORKING_TREE } from "./historySelect";
import type { main } from "../wailsjs/go/models";
import {
    parseFlow,
    setNodeRef,
    extractDiagram,
    addNode,
    deleteNode,
    setNodeLabel,
    renameNodeId,
    nextNodeId,
    setEdgeLabel,
    insertOnEdge,
    deleteEdge,
    addEdge,
    edgeLabelOf,
} from "./flowFile";
import { markFlowNodes, flowNodeIdFromEvent, renderFlowPanel } from "./flowView";

// FLOW 탭에만 "diagram"(그림 편집)이 추가된다 — 그림에서 노드를 고르고
// 요소를 연결하는 모드. 원문 편집은 여전히 "edit"(textarea)다.
type Mode = "view" | "edit" | "diagram";

interface Tab {
    id: string;
    title: string;
    path: string;
    format: ElementFormat | "EXTERNAL";
    /** 탐색(파일 메뉴)으로 프로젝트 밖에서 불러온 파일인지 — 읽기 전용으로만 다룬다. */
    external: boolean;
    content: string;
    mode: Mode;
    dirty: boolean;
    /** 파일을 읽지 못해 오류 메시지를 대신 담고 있는 탭인지 */
    loadFailed: boolean;
    /**
     * "+ WP"/"+ DWP"로 막 생성해서 연 탭인지 — true인 동안은 닫기(×)가 일반적인
     * "저장 안 한 변경사항" 확인 대신 "삭제하고 닫을까요?" 확인을 띄운다.
     * 저장을 한 번이라도 하면 일반 탭과 동일하게 취급하도록 false로 내린다.
     */
    pendingCreation: boolean;
    /**
     * git 이력(`[WP][2.0][2026.09.10]파일 이력 뷰어.md`). 탭을 처음 그릴 때
     * 지연 로드한다 — 조회가 탭 렌더를 막지 않도록.
     */
    history: main.GitHistory | null;
    historyLoading: boolean;
    /** null이면 작업 트리의 현재 내용, 아니면 그 커밋 시점을 보고 있다는 뜻. */
    viewingHash: string | null;
    /** viewingHash가 가리키는 시점의 원문. content(현재 내용)는 그대로 보존한다. */
    historyContent: string;
    /** FLOW 탭의 그림 편집 모드에서 지금 선택된 노드 id. */
    selectedFlowNodeId: string | null;
    /**
     * 그림 편집 되돌리기 — 편집 직전 내용을 쌓아둔다. textarea와 달리 구조 편집엔
     * 브라우저 기본 undo가 없어서 직접 들고 있어야 한다.
     */
    flowUndo: string[];
}

const NL = String.fromCharCode(10);

/** 그림 편집 되돌리기 깊이 — 더 필요하면 늘리면 되지만, 저장 전 텍스트 모드가 최종 안전망이다. */
const FLOW_UNDO_LIMIT = 30;

function fileNameOf(path: string): string {
    return path.split(/[\\/]/).pop() ?? path;
}

export class TabManager {
    private tabs: Tab[] = [];
    private activeId: string | null = null;
    private tabScrollEl: HTMLElement;
    /** 지금 열려 있는 그림 편집 화면을 다시 그리는 함수(되돌리기에서 재사용). */
    private flowRefresh: ((redraw: boolean) => Promise<void>) | null = null;
    /** 찾기 바는 탭마다 새로 만들지 않고 하나를 재사용한다(find.ts 주석 참조). */
    private findBar = new FindBar();
    private prevBtn: HTMLButtonElement;
    private nextBtn: HTMLButtonElement;

    constructor(
        private tabBarEl: HTMLElement,
        private contentEl: HTMLElement,
        /** 파일이 생기거나 사라져 좌측 트리를 새로고침해야 한다는 신호. */
        private onTreeChanged?: () => void,
    ) {
        // 탭이 넘칠 때 네이티브 스크롤바(항상 탭 줄 바로 아래에 붙어 어색한 위치) 대신
        // 좌우 버튼으로 넘긴다. 트랙패드/휠 스크롤은 계속 되게 두고, 스크롤바만 숨긴다.
        this.tabBarEl.innerHTML = `
            <button class="tab-scroll-btn" data-role="tab-scroll-prev" aria-label="이전 탭">‹</button>
            <div class="tab-scroll"></div>
            <button class="tab-scroll-btn" data-role="tab-scroll-next" aria-label="다음 탭">›</button>
        `;
        this.tabScrollEl = this.tabBarEl.querySelector<HTMLElement>(".tab-scroll")!;
        this.prevBtn = this.tabBarEl.querySelector<HTMLButtonElement>('[data-role="tab-scroll-prev"]')!;
        this.nextBtn = this.tabBarEl.querySelector<HTMLButtonElement>('[data-role="tab-scroll-next"]')!;

        this.prevBtn.addEventListener("click", () => this.scrollTabs(-1));
        this.nextBtn.addEventListener("click", () => this.scrollTabs(1));
        this.tabScrollEl.addEventListener("scroll", () => this.updateScrollButtons());
        window.addEventListener("resize", () => this.updateScrollButtons());
    }

    private scrollTabs(direction: 1 | -1): void {
        const amount = Math.round(this.tabScrollEl.clientWidth * 0.8) * direction;
        this.tabScrollEl.scrollBy({ left: amount }); // 즉시 이동 — 버튼 활성/비활성 상태를 애니메이션 타이밍과 무관하게 정확히 유지
        this.updateScrollButtons();
    }

    private updateScrollButtons(): void {
        const el = this.tabScrollEl;
        const overflowing = el.scrollWidth > el.clientWidth + 1;
        this.tabBarEl.classList.toggle("tab-bar--overflowing", overflowing);
        this.prevBtn.disabled = el.scrollLeft <= 0;
        this.nextBtn.disabled = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    }

    /**
     * opts.pendingCreation: 방금 "+ WP"/"+ DWP"로 만든 파일을 여는 경우 true로
     * 넘긴다 — 편집 모드로 바로 열리고, 닫기(×)가 삭제 확인으로 바뀐다.
     */
    async open(node: TreeNode, opts?: { pendingCreation?: boolean }): Promise<void> {
        const existing = this.tabs.find((t) => t.path === node.path);
        if (existing) {
            this.activeId = existing.id;
            logInfo(`탭 활성화: ${node.name} (${node.path})`);
            await this.renderActive();
            return;
        }

        let content: string;
        let loadFailed = false;
        try {
            content = await readProjectFile(node.path);
            logInfo(`파일 읽기 성공: ${node.path} (${content.length}자)`);
        } catch (err) {
            logError(`파일 읽기 실패: ${node.path}`, err);
            const detail = err instanceof Error ? err.message : String(err);
            content = `⚠️ 파일을 읽지 못했습니다.\n\n- 경로: ${node.path}\n- 오류: ${detail}`;
            loadFailed = true;
        }

        const pendingCreation = opts?.pendingCreation ?? false;
        const tab: Tab = {
            id: crypto.randomUUID(),
            title: node.name,
            path: node.path,
            format: node.format,
            external: false,
            content,
            mode: pendingCreation ? "edit" : "view",
            dirty: false,
            loadFailed,
            pendingCreation,
            history: null,
            historyLoading: false,
            viewingHash: null,
            historyContent: "",
            selectedFlowNodeId: null,
            flowUndo: [],
        };
        this.tabs.push(tab);
        this.activeId = tab.id;
        await this.renderActive();
    }

    /** 탐색(파일 > 탐색)으로 프로젝트 밖 파일을 절대 경로로 연다. 읽기 전용. */
    async openExternal(absPath: string): Promise<void> {
        const existing = this.tabs.find((t) => t.external && t.path === absPath);
        if (existing) {
            this.activeId = existing.id;
            logInfo(`탭 활성화: ${absPath}`);
            await this.renderActive();
            return;
        }

        let content: string;
        let loadFailed = false;
        try {
            content = await readExternalFile(absPath);
            logInfo(`외부 파일 읽기 성공: ${absPath} (${content.length}자)`);
        } catch (err) {
            logError(`외부 파일 읽기 실패: ${absPath}`, err);
            const detail = err instanceof Error ? err.message : String(err);
            content = `⚠️ 파일을 읽지 못했습니다.\n\n- 경로: ${absPath}\n- 오류: ${detail}`;
            loadFailed = true;
        }

        const tab: Tab = {
            id: crypto.randomUUID(),
            title: fileNameOf(absPath),
            path: absPath,
            format: "EXTERNAL",
            external: true,
            content,
            mode: "view",
            pendingCreation: false,
            dirty: false,
            loadFailed,
            history: null,
            historyLoading: false,
            viewingHash: null,
            historyContent: "",
            selectedFlowNodeId: null,
            flowUndo: [],
        };
        this.tabs.push(tab);
        this.activeId = tab.id;
        await this.renderActive();
    }

    /**
     * 열려 있는 모든 탭을 디스크에서 다시 읽는다(외부에서 파일이 바뀐 경우 대응).
     * 저장 안 한 변경사항(dirty)이 있는 탭은 덮어쓰지 않고 건너뛴다.
     */
    async refreshAll(): Promise<number> {
        let refreshed = 0;
        for (const tab of this.tabs) {
            if (tab.dirty) continue;
            try {
                tab.content = tab.external ? await readExternalFile(tab.path) : await readProjectFile(tab.path);
                tab.loadFailed = false;
                refreshed++;
            } catch (err) {
                logError(`새로고침 실패: ${tab.path}`, err);
            }
        }
        await this.renderActive();
        return refreshed;
    }

    async close(id: string): Promise<void> {
        const idx = this.tabs.findIndex((t) => t.id === id);
        if (idx === -1) return;
        const tab = this.tabs[idx];

        if (tab.pendingCreation) {
            if (!confirm(`"${tab.title}"는 방금 생성한 파일입니다. 삭제하고 닫을까요?`)) return;
            try {
                await deleteProjectFile(tab.path);
                logInfo(`생성 취소 — 삭제됨: ${tab.path}`);
            } catch (err) {
                logError(`삭제 실패: ${tab.path}`, err);
                alert(`삭제 실패: ${err instanceof Error ? err.message : String(err)}`);
                return;
            }
            this.removeTab(idx, id);
            await this.renderActive();
            this.onTreeChanged?.();
            return;
        }

        if (tab.dirty && !confirm(`"${tab.title}"에 저장하지 않은 변경사항이 있습니다. 닫을까요?`)) {
            return;
        }
        this.removeTab(idx, id);
        await this.renderActive();
    }

    /**
     * path로 열려 있는 탭이 있으면 확인 없이 바로 닫는다 — 트리에서 그 항목을
     * 이름변경/삭제했을 때 정리용. 그대로 두면 옛 경로를 가리키는 탭에서
     * 저장을 눌러 파일이 의도치 않게 되살아날 수 있다.
     */
    async closeByPath(path: string): Promise<void> {
        const idx = this.tabs.findIndex((t) => t.path === path);
        if (idx === -1) return;
        this.removeTab(idx, this.tabs[idx].id);
        await this.renderActive();
    }

    /** 탭 배열에서 idx를 제거하고, 그게 활성 탭이었다면 옆 탭으로 활성 상태를 옮긴다. */
    private removeTab(idx: number, id: string): void {
        this.tabs.splice(idx, 1);
        if (this.activeId === id) {
            const fallback = this.tabs[idx] ?? this.tabs[idx - 1];
            this.activeId = fallback ? fallback.id : null;
        }
    }

    async activate(id: string): Promise<void> {
        this.activeId = id;
        await this.renderActive();
    }

    private activeTab(): Tab | undefined {
        return this.tabs.find((t) => t.id === this.activeId);
    }

    private toggleMode(): void {
        const tab = this.activeTab();
        if (!tab || tab.external || tab.format === "GROUP" || tab.viewingHash !== null) return;
        tab.mode = tab.mode === "view" ? "edit" : "view";
        void this.renderActive();
    }

    private setMode(mode: Mode): void {
        const tab = this.activeTab();
        if (!tab || tab.mode === mode) return;
        tab.mode = mode;
        void this.renderActive();
    }

    private async save(): Promise<void> {
        const tab = this.activeTab();
        if (!tab || tab.external || tab.format === "GROUP" || tab.viewingHash !== null) return;

        const result = validateContent(tab.format as ElementFormat, tab.content);
        if (!result.valid) {
            const proceed = confirm(
                `${tab.format} 형식 검사에서 문제가 발견됐습니다:\n\n- ${result.issues.join("\n- ")}\n\n그래도 저장할까요?`,
            );
            if (!proceed) return;
        }

        try {
            await writeProjectFile(tab.path, tab.content);
            logInfo(`파일 저장 성공: ${tab.path}`);
        } catch (err) {
            logError(`파일 저장 실패: ${tab.path}`, err);
            alert(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }

        tab.dirty = false;
        tab.mode = "view";
        tab.history = null; // 저장으로 dirty 여부가 바뀐다 — 다음 렌더에서 다시 조회
        tab.pendingCreation = false; // 한 번이라도 저장했으면 더 이상 "실수로 만든 빈 파일"이 아니다
        await this.renderActive();
    }

    private renderTabBar(): void {
        this.tabScrollEl.innerHTML = "";
        let activeEl: HTMLElement | null = null;
        for (const tab of this.tabs) {
            const el = document.createElement("div");
            el.className = "tab" + (tab.id === this.activeId ? " tab--active" : "");
            const dirtyMark = tab.dirty ? '<span class="tab-dirty">●</span>' : "";
            const errorMark = tab.loadFailed ? '<span class="tab-error">⚠</span>' : "";
            el.innerHTML = `${errorMark}<span class="tab-title"></span>${dirtyMark}<span class="tab-close">×</span>`;
            el.querySelector(".tab-title")!.textContent = tab.title;
            el.querySelector<HTMLElement>(".tab-title")!.addEventListener("click", () => void this.activate(tab.id));
            el.querySelector<HTMLElement>(".tab-close")!.addEventListener("click", () => void this.close(tab.id));
            this.tabScrollEl.appendChild(el);
            if (tab.id === this.activeId) activeEl = el;
        }
        this.updateScrollButtons();
        activeEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    private async renderActive(): Promise<void> {
        this.renderTabBar();
        this.flowRefresh = null; // 이전 그림 편집 화면의 DOM을 붙잡고 있지 않도록

        const tab = this.activeTab();
        if (!tab) {
            this.findBar.close();
            this.contentEl.innerHTML = `<div class="viewer-empty">좌측 트리에서 항목을 선택하세요</div>`;
            return;
        }

        const isGroup = tab.format === "GROUP";
        const isFlow = tab.format === "FLOW";
        const viewingHistory = tab.viewingHash !== null;
        // 이력은 프로젝트 안의 파일에만 붙인다 — 외부 탐색 파일(절대경로)은
        // 어느 저장소에 속하는지 보장할 수 없다.
        const historyControl = tab.external ? "" : `<select class="history-select" data-role="history"></select>`;
        const editControls = viewingHistory
            ? '<span class="viewer-external-badge">과거 버전 (읽기 전용)</span>'
            : isGroup
              ? "" // 그룹 편집기가 멤버십 수정을 전담 — 이 탭은 정보 표시 전용
              : tab.external
                ? '<span class="viewer-external-badge">읽기 전용 (탐색됨)</span>'
                : isFlow
                  ? `<div class="mode-switch">
                       <button class="tb-btn" data-mode="view">👁 보기</button>
                       <button class="tb-btn" data-mode="diagram">✎ 그림 편집</button>
                       <button class="tb-btn" data-mode="edit">&lt;/&gt; 텍스트 편집</button>
                     </div>
                     <button class="tb-btn" data-role="save" ${tab.mode === "view" ? "disabled" : ""}>저장</button>`
                  : `<button class="tb-btn" data-role="toggle-mode"></button>
                 <button class="tb-btn" data-role="save" ${tab.mode === "view" ? "disabled" : ""}>저장</button>`;

        this.contentEl.innerHTML = `
            <div class="viewer-toolbar">
                <span class="viewer-path"></span>
                <span class="viewer-toolbar-spacer"></span>
                ${historyControl}
                ${editControls}
            </div>
            <div class="viewer-body"></div>
        `;
        this.contentEl.querySelector(".viewer-path")!.textContent = tab.path;

        const historySelect = this.contentEl.querySelector<HTMLSelectElement>('[data-role="history"]');
        if (historySelect) {
            fillHistorySelect(historySelect, tab.history, tab.viewingHash);
            historySelect.addEventListener("change", () => void this.selectVersion(tab, historySelect.value));
            void this.ensureHistoryLoaded(tab);
        }

        if (!tab.external && !isGroup && !viewingHistory) {
            if (isFlow) {
                for (const btn of Array.from(this.contentEl.querySelectorAll<HTMLButtonElement>("[data-mode]"))) {
                    const mode = btn.dataset.mode as Mode;
                    btn.classList.toggle("tb-btn--primary", tab.mode === mode);
                    btn.addEventListener("click", () => this.setMode(mode));
                }
            } else {
                const toggleBtn = this.contentEl.querySelector<HTMLButtonElement>('[data-role="toggle-mode"]')!;
                toggleBtn.textContent = tab.mode === "view" ? "✎ 편집" : "👁 미리보기";
                toggleBtn.addEventListener("click", () => this.toggleMode());
            }

            this.contentEl
                .querySelector<HTMLElement>('[data-role="save"]')!
                .addEventListener("click", () => void this.save());
        }

        const body = this.contentEl.querySelector<HTMLElement>(".viewer-body")!;
        // 과거 버전은 파일로 존재하지 않는 문자열이라 GROUP 정보 뷰(멤버 파일 존재
        // 확인이 필요)에 태우지 않고 md로만 렌더한다.
        const displayed = viewingHistory ? tab.historyContent : tab.content;
        if (isGroup && !viewingHistory) {
            try {
                await renderGroupInfo(body, tab.content, tab.path, (target) => void this.open(target));
            } catch (err) {
                logError(`GROUP 정보 렌더링 실패: ${tab.path}`, err);
                body.innerHTML = `<div class="viewer-empty">⚠️ GROUP 정보를 표시하는 중 오류가 발생했습니다. 콘솔/로그를 확인하세요.</div>`;
            }
        } else if (isFlow && tab.mode === "diagram" && !viewingHistory) {
            await this.renderFlowEditor(body, tab);
        } else if (tab.mode === "edit" && !viewingHistory) {
            body.innerHTML = `<textarea class="editor-textarea" spellcheck="false"></textarea>`;
            const textarea = body.querySelector<HTMLTextAreaElement>(".editor-textarea")!;
            textarea.value = tab.content;
            textarea.addEventListener("input", () => {
                tab.content = textarea.value;
                if (!tab.dirty) {
                    tab.dirty = true;
                    this.renderTabBar();
                }
            });
        } else {
            // OTHER는 확장자가 자유(`02.ELEMENT_FORMAT.md` §1)라 .md가 아닐 수 있다 —
            // csv/json 등을 마크다운 렌더러에 태우면 문법이 오인식돼 원문이 깨진다.
            const lowerPath = tab.path.toLowerCase();
            const isHtml = lowerPath.endsWith(".html") || lowerPath.endsWith(".htm");
            // .md-viewer는 본문 가독성을 위해 max-width로 줄 길이를 제한한다 — html은
            // 그 폭 제한 없이 창 전체를 쓰도록 별도 컨테이너(.html-viewer)를 쓴다.
            body.innerHTML = isHtml ? `<div class="html-viewer"></div>` : `<div class="md-viewer"></div>`;
            const viewerEl = body.querySelector<HTMLElement>(isHtml ? ".html-viewer" : ".md-viewer")!;
            try {
                if (lowerPath.endsWith(".md")) {
                    await renderMarkdown(viewerEl, displayed);
                    if (isFlow) this.bindFlowNavigation(viewerEl, displayed);
                } else if (isHtml) {
                    renderHtmlFile(viewerEl, displayed);
                } else {
                    renderPlainText(viewerEl, displayed);
                }
            } catch (err) {
                logError(`렌더링 실패: ${tab.path}`, err);
                viewerEl.innerHTML = `<div class="viewer-empty">⚠️ 렌더링 중 오류가 발생했습니다. 콘솔/로그를 확인하세요.</div>`;
            }
        }

        // 탭 내용이 통째로 다시 그려졌으므로, 열려 있던 찾기 바를 새 DOM에 다시 붙인다.
        this.findBar.attach(this.contentEl, this.findTarget());
    }

    /**
     * 보기 모드의 FLOW 그림 — 참조가 걸린 노드를 누르면 그 요소를 탭으로 연다.
     * (`[WP][2.0][2026.09.17]흐름(FLOW) 요소.md` 1단계)
     */
    private bindFlowNavigation(viewerEl: HTMLElement, raw: string): void {
        const doc = parseFlow(raw);
        markFlowNodes(viewerEl, doc, null);
        viewerEl.addEventListener("click", (e) => {
            const id = flowNodeIdFromEvent(e);
            const ref = id ? (doc.nodes.find((n) => n.id === id)?.ref ?? null) : null;
            if (ref) void this.openByFilename(ref);
        });
    }

    /** 그림 편집 모드 — 왼쪽은 그림, 오른쪽은 선택 노드 속성 패널. */
    private async renderFlowEditor(body: HTMLElement, tab: Tab): Promise<void> {
        body.innerHTML = `
            <div class="flow-editor">
                <div class="flow-canvas md-viewer"></div>
                <div class="flow-panel"></div>
            </div>
        `;
        const canvas = body.querySelector<HTMLElement>(".flow-canvas")!;
        const panel = body.querySelector<HTMLElement>(".flow-panel")!;

        // 연결(REFERENCES)만 바뀔 때는 그림을 다시 그리지 않는다 — 그림 모양이
        // 그대로라 선택·스크롤을 유지하는 편이 낫다. 구조가 바뀌면 다시 그린다.
        // 노드를 막 만든 직후 한 번만 라벨 입력칸에 포커스를 준다.
        let focusLabelOnce = false;
        const refresh = async (redraw: boolean): Promise<void> => {
            if (redraw) await this.drawFlowCanvas(canvas, tab);
            const doc = parseFlow(tab.content);
            markFlowNodes(canvas, doc, tab.selectedFlowNodeId);
            const focusLabel = focusLabelOnce;
            focusLabelOnce = false;
            // 간선 라벨은 노드 모델에 없다 — 화면에 뿌릴 값만 원문에서 읽어 넘긴다.
            const edgeLabels = new Map(doc.edges.map((e) => [e.line, edgeLabelOf(tab.content, e.line)]));
            renderFlowPanel(panel, {
                doc,
                focusLabel,
                edgeLabels,
                selected: doc.nodes.find((n) => n.id === tab.selectedFlowNodeId) ?? null,
                onOpenRef: (filename) => void this.openByFilename(filename),
                onLink: (id, filename) => {
                    this.applyFlowEdit(tab, setNodeRef(tab.content, id, filename));
                    void refresh(false);
                },
                onLabel: (id, shape, label) => {
                    this.applyFlowEdit(tab, setNodeLabel(tab.content, id, shape, label));
                    void refresh(true);
                },
                onRename: (oldId, newId) => {
                    this.applyFlowEdit(tab, renameNodeId(tab.content, oldId, newId));
                    tab.selectedFlowNodeId = newId;
                    void refresh(true);
                },
                onAdd: (anchorId, position, shape, label) => {
                    // 갈래가 여럿인 노드에 끼워 넣으면 그 갈래가 **전부** 새 노드를
                    // 거치게 된다 — 분기 조건 라벨도 새 노드 뒤로 옮겨가 의미가 바뀐다.
                    // 특정 갈래 하나만 고르는 건 간선 편집(E3)의 몫이라, 여기선 먼저 알린다.
                    const branching = doc.edges.filter((e) => (position === "after" ? e.from : e.to) === anchorId);
                    if (branching.length > 1) {
                        const dir = position === "after" ? "나가는" : "들어오는";
                        if (!confirm(`이 노드에서 ${dir} 화살표가 ${branching.length}개입니다. 모두 새 노드를 거치게 되고, 화살표에 붙은 조건 라벨도 함께 옮겨갑니다. 계속할까요?`)) return;
                    }
                    const id = nextNodeId(doc, shape);
                    this.applyFlowEdit(tab, addNode(tab.content, { anchorId, position, id, shape, label }));
                    tab.selectedFlowNodeId = id; // 방금 만든 노드를 이어서 다루게 된다
                    focusLabelOnce = true; // 임시 라벨이 들어갔을 수 있으니 바로 고쳐 쓰게
                    void refresh(true);
                },
                onEdgeLabel: (line, label) => {
                    this.applyFlowEdit(tab, setEdgeLabel(tab.content, line, label));
                    void refresh(true);
                },
                onEdgeInsert: (line) => {
                    const id = nextNodeId(doc, "step");
                    this.applyFlowEdit(tab, insertOnEdge(tab.content, line, { id, shape: "step", label: "" }));
                    tab.selectedFlowNodeId = id;
                    focusLabelOnce = true;
                    void refresh(true);
                },
                onEdgeDelete: (line) => {
                    const edge = doc.edges.find((e) => e.line === line);
                    const nameOf = (id: string) => doc.nodes.find((n) => n.id === id)?.label || id;
                    const what = edge ? `${nameOf(edge.from)} → ${nameOf(edge.to)}` : "이 화살표";
                    if (!confirm(`"${what}" 화살표를 끊을까요? 이 연결로만 이어져 있던 노드는 그림에서 떨어져 나옵니다.`)) return;
                    this.applyFlowEdit(tab, deleteEdge(tab.content, line));
                    void refresh(true);
                },
                onAddEdge: (fromId, targetId, label) => {
                    if (targetId) {
                        this.applyFlowEdit(tab, addEdge(tab.content, fromId, { existingId: targetId }, label));
                    } else {
                        const id = nextNodeId(doc, "step");
                        this.applyFlowEdit(tab, addEdge(tab.content, fromId, { id, shape: "step", label: "" }, label));
                        tab.selectedFlowNodeId = id;
                        focusLabelOnce = true;
                    }
                    void refresh(true);
                },
                onExtract: (id) => void this.extractToFlow(tab, id, refresh),
                onDelete: (id) => {
                    const node = doc.nodes.find((n) => n.id === id);
                    const hasLabeledEdge = doc.edges.some((e) => e.from === id || e.to === id);
                    const warn = hasLabeledEdge
                        ? `"${node?.label || id}" 노드를 지우고 앞뒤를 이어 붙입니다. 화살표에 붙은 조건 라벨은 사라집니다.`
                        : `"${node?.label || id}" 노드를 지울까요?`;
                    if (!confirm(warn)) return;
                    this.applyFlowEdit(tab, deleteNode(tab.content, id));
                    tab.selectedFlowNodeId = null;
                    void refresh(true);
                },
            });
        };
        this.flowRefresh = refresh;

        canvas.addEventListener("click", (e) => {
            tab.selectedFlowNodeId = flowNodeIdFromEvent(e); // 빈 곳을 누르면 선택 해제
            void refresh(false);
        });
        await refresh(true);
    }

    /**
     * 선택 노드를 새 FLOW 파일로 빼낸다 — 그 자리는 하위 흐름(`[[ ]]`) 도형이 되고
     * `REFERENCES`가 새 파일을 가리킨다. 한 단계가 커졌을 때 흐름을 쪼개는 통로다.
     */
    private async extractToFlow(tab: Tab, id: string, refresh: (redraw: boolean) => Promise<void>): Promise<void> {
        const doc = parseFlow(tab.content);
        const node = doc.nodes.find((n) => n.id === id);
        if (!node) return;
        if (node.ref && !confirm(`이 노드는 이미 "${node.ref}"에 연결돼 있습니다. 새 FLOW로 바꿀까요?`)) return;

        const name = prompt("새 FLOW 이름:", node.label || id);
        if (name === null) return;
        const trimmed = name.trim();
        if (!trimmed) return;

        let path: string;
        try {
            path = await createElement("FLOW", trimmed);
        } catch (err) {
            logError("FLOW 생성 실패", err);
            alert(`생성 실패: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        const filename = path.split("/").pop()!;

        // 스캐폴딩 대신 빼낸 맥락(SUMMARY·PARENT·첫 단계)을 채워 넣는다.
        const body = [
            "### IDENTITY",
            `- SUMMARY: ${node.label || trimmed}`,
            "",
            "### CONNECTIONS",
            `- PARENT: ${fileNameOf(tab.path)}`,
            "- REFERENCE: []",
            "",
            "### DIAGRAM",
            "```mermaid",
            "flowchart LR",
            `    begin((시작)) --> s1[${node.label || trimmed}]`,
            "    s1 --> done((끝))",
            "```",
            "",
            "### REFERENCES",
            "",
            "### ISSUE",
            "",
        ].join(NL);
        try {
            await writeProjectFile(path, body);
        } catch (err) {
            logError(`FLOW 초기 내용 저장 실패: ${path}`, err);
        }

        // 원래 그림에서는 그 노드를 하위 흐름 도형으로 바꾸고 새 파일을 가리키게 한다.
        let next = setNodeLabel(tab.content, id, "subflow", node.label);
        next = setNodeRef(next, id, filename);
        this.applyFlowEdit(tab, next);
        await refresh(true);
        this.onTreeChanged?.();
        logInfo(`노드를 새 FLOW로 빼냄: ${id} → ${path}`);
        await this.openByFilename(filename);
    }

    /** DIAGRAM의 mermaid만 떼어 캔버스에 다시 그린다. */
    private async drawFlowCanvas(canvas: HTMLElement, tab: Tab): Promise<void> {
        const diagram = extractDiagram(tab.content);
        if (diagram === null) {
            canvas.innerHTML = `<div class="viewer-empty">⚠️ DIAGRAM 섹션에서 mermaid 코드블록을 찾지 못했습니다. 텍스트 편집으로 확인하세요.</div>`;
            return;
        }
        try {
            await renderMarkdown(canvas, "```mermaid" + NL + diagram + NL + "```");
        } catch (err) {
            logError(`흐름도 렌더링 실패: ${tab.path}`, err);
            canvas.innerHTML = `<div class="viewer-empty">⚠️ 흐름도를 그리는 중 오류가 발생했습니다. 텍스트 편집으로 확인하세요.</div>`;
        }
    }

    /** 그림 편집 한 번 = 되돌리기 한 칸. 내용이 그대로면 아무 일도 하지 않는다. */
    private applyFlowEdit(tab: Tab, next: string): void {
        if (next === tab.content) return;
        tab.flowUndo.push(tab.content);
        if (tab.flowUndo.length > FLOW_UNDO_LIMIT) tab.flowUndo.shift();
        tab.content = next;
        if (!tab.dirty) {
            tab.dirty = true;
            this.renderTabBar();
        }
    }

    /** Ctrl+Z — 그림 편집 모드에서만. 되돌릴 게 있으면 true. */
    undoFlowEdit(): boolean {
        const tab = this.activeTab();
        if (!tab || tab.mode !== "diagram" || tab.flowUndo.length === 0) return false;
        tab.content = tab.flowUndo.pop()!;
        void this.flowRefresh?.(true);
        return true;
    }

    /**
     * 요소 파일명으로 탭을 연다 — FORMAT 접두어로 폴더를 판단한다
     * (`02.ELEMENT_FORMAT.md` §4, 패턴에 안 맞으면 OTHER).
     */
    private async openByFilename(filename: string): Promise<void> {
        const { format, name } = parseElementFilename(filename);
        await this.open({ name, format, path: `.loadstar/${format}/${filename}` });
    }

    /** 현재 탭 화면에서 찾기 대상(보기 모드 본문 / 편집 모드 textarea)을 집어낸다. */
    private findTarget(): FindTarget {
        const body = this.contentEl.querySelector<HTMLElement>(".viewer-body") ?? this.contentEl;
        return { body, textarea: body.querySelector<HTMLTextAreaElement>(".editor-textarea") };
    }

    /**
     * Ctrl+F, 그리고 검색 뷰에서 파일을 열었을 때의 진입점.
     * hitIndex는 "이 파일의 몇 번째 일치로 갈지"(0-based).
     */
    openFind(query?: string, hitIndex?: number): void {
        if (!this.activeTab()) return;
        this.findBar.open(this.contentEl, this.findTarget(), query, hitIndex);
    }

    /** F3 / Shift+F3 — 찾기 바가 열려 있을 때만 다음/이전 일치로 이동한다. */
    findNext(direction: 1 | -1): void {
        if (this.findBar.isOpen()) this.findBar.step(direction, true);
    }

    /** 열려 있는 탭이 있는지 — "편집 > 찾기" 메뉴 항목 활성/비활성 판단용. */
    hasActiveTab(): boolean {
        return this.activeTab() !== undefined;
    }

    /** 찾기 바가 열려 있는지 — Esc 처리(main.ts)에서 참조. */
    isFindOpen(): boolean {
        return this.findBar.isOpen();
    }

    closeFind(): void {
        this.findBar.close();
    }

    /** 이력을 지연 로드하고, 그 사이 탭이 바뀌지 않았으면 콤보박스만 갱신한다. */
    private async ensureHistoryLoaded(tab: Tab): Promise<void> {
        if (tab.history || tab.historyLoading || tab.external) return;
        tab.historyLoading = true;
        try {
            tab.history = await gitFileHistory(tab.path);
        } catch (err) {
            logError(`이력 조회 실패: ${tab.path}`, err);
            const detail = err instanceof Error ? err.message : String(err);
            tab.history = { available: false, reason: detail, dirty: false, commits: [] } as unknown as main.GitHistory;
        } finally {
            tab.historyLoading = false;
        }
        if (this.activeId !== tab.id) return; // 조회 중 사용자가 다른 탭으로 옮김 — 화면은 건드리지 않는다
        const select = this.contentEl.querySelector<HTMLSelectElement>('[data-role="history"]');
        if (select) fillHistorySelect(select, tab.history, tab.viewingHash);
    }

    /** 콤보박스에서 버전을 고른 순간. 빈 값이면 작업 트리의 현재 내용으로 돌아온다. */
    private async selectVersion(tab: Tab, hash: string): Promise<void> {
        if (hash === WORKING_TREE) {
            tab.viewingHash = null;
            tab.historyContent = "";
            await this.renderActive();
            return;
        }
        const commit = tab.history?.commits.find((c) => c.hash === hash);
        if (!commit) return;
        try {
            // commit.path는 "그 커밋 시점의" 경로 — 리네임 이전 커밋도 이 값으로 읽힌다.
            tab.historyContent = await gitFileAtCommit(commit.path, commit.hash);
            logInfo(`과거 버전 표시: ${tab.path} @ ${commit.short}`);
        } catch (err) {
            logError(`과거 버전 조회 실패: ${tab.path} @ ${hash}`, err);
            alert(`과거 버전을 읽지 못했습니다: ${err instanceof Error ? err.message : String(err)}`);
            await this.renderActive(); // 콤보박스를 실제 상태(현재 보고 있는 버전)로 되돌린다
            return;
        }
        tab.viewingHash = hash;
        tab.mode = "view"; // 편집 중이었어도 과거 버전은 읽기 전용 — 편집 내용은 tab.content에 그대로 남는다
        await this.renderActive();
    }
}

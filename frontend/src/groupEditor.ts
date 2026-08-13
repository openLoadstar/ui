// 그룹 편집기 — 대화상자로 GROUP 계층을 만들고, 각 GROUP의 ITEMS(WP/DWP/OTHER)를
// 목록 UI로 추가/삭제한다. appendix/GROUP.md 참조.
//
// 구조 추출기가 아직 없어서, GROUP 목록/계층은 매번 대화상자를 열 때 .loadstar/GROUP/
// 아래 파일을 전부 읽어 ITEMS를 파싱해 즉석에서 구성한다(listFormatFiles + groupFile.ts).

import { listFormatFiles, readProjectFile, writeProjectFile, deleteProjectFile } from "./fs";
import { parseElementFilename, formatIcon, type ElementFormat } from "./tree";
import { parseGroupItems, setGroupItems } from "./groupFile";
import { logError, logInfo } from "./log";
import { makeDraggable, makeResizable } from "./dialogChrome";
import { loadAllGroups, buildGroupTree, basename, type GroupNode } from "./groupIndex";

function formatDateYYYYMMDD(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function openGroupEditor(onChanged?: () => void): void {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="group-editor-box">
            <div class="modal-header">
                <span class="modal-title">그룹 편집기</span>
                <span class="modal-close">×</span>
            </div>
            <div class="group-editor-body">
                <div class="group-editor-tree-panel">
                    <div class="group-editor-tree-header">
                        <button class="tb-btn" data-role="add-group">+ GROUP</button>
                    </div>
                    <div class="group-editor-tree-body"></div>
                </div>
                <div class="group-editor-members-panel">
                    <div class="group-editor-members-header">
                        <span class="group-editor-members-title">GROUP을 선택하세요</span>
                        <button class="tb-btn" data-role="add-member" disabled>+ 추가</button>
                    </div>
                    <div class="group-editor-members-body"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const box = overlay.querySelector<HTMLElement>(".group-editor-box")!;
    const header = overlay.querySelector<HTMLElement>(".modal-header")!;
    makeDraggable(box, header);
    makeResizable(box, { minWidth: 560, minHeight: 360 });

    // 대화상자는 화면 안 버튼(×)으로만 닫힌다 — 바깥 클릭·Escape로는 안 닫음(의도적).
    const close = () => overlay.remove();
    overlay.querySelector(".modal-close")!.addEventListener("click", close);

    const treeBody = overlay.querySelector<HTMLElement>(".group-editor-tree-body")!;
    const membersTitle = overlay.querySelector<HTMLElement>(".group-editor-members-title")!;
    const membersBody = overlay.querySelector<HTMLElement>(".group-editor-members-body")!;
    const addMemberBtn = overlay.querySelector<HTMLButtonElement>('[data-role="add-member"]')!;

    let allGroups: GroupNode[] = [];
    let selectedPath: string | null = null;

    function selectedNode(): GroupNode | null {
        return allGroups.find((g) => g.path === selectedPath) ?? null;
    }

    async function reload(): Promise<void> {
        allGroups = await loadAllGroups();
        if (selectedPath && !allGroups.some((g) => g.path === selectedPath)) {
            selectedPath = null;
        }
        renderTreePanel();
        renderMembersPanel();
        onChanged?.();
    }

    function select(node: GroupNode): void {
        selectedPath = node.path;
        renderTreePanel();
        renderMembersPanel();
    }

    function selectRoot(): void {
        selectedPath = null;
        renderTreePanel();
        renderMembersPanel();
    }

    function renderTreePanel(): void {
        treeBody.innerHTML = "";

        const rootRow = document.createElement("div");
        rootRow.className = "group-tree-row group-tree-row--root" + (selectedPath === null ? " group-tree-row--selected" : "");
        rootRow.innerHTML = `<span class="tree-icon">${"\u{1F3E0}"}</span><span class="tree-label">루트</span>`;
        rootRow.addEventListener("click", selectRoot);
        treeBody.appendChild(rootRow);

        const roots = buildGroupTree(allGroups);
        if (roots.length > 0) {
            treeBody.appendChild(renderGroupList(roots, true));
        }
    }

    function renderGroupList(nodes: GroupNode[], nested: boolean): HTMLElement {
        const ul = document.createElement("ul");
        ul.className = "group-tree-list" + (nested ? " group-tree-list--nested" : "");
        for (const node of nodes) {
            const li = document.createElement("li");
            const row = document.createElement("div");
            row.className = "group-tree-row" + (selectedPath === node.path ? " group-tree-row--selected" : "");
            row.innerHTML = `<span class="tree-icon">${formatIcon.GROUP}</span><span class="tree-label"></span><span class="group-delete" title="이 GROUP 삭제">\u{1F5D1}</span>`;
            row.querySelector(".tree-label")!.textContent = node.name;
            row.addEventListener("click", () => select(node));
            row.querySelector(".group-delete")!.addEventListener("click", (e) => {
                e.stopPropagation();
                void deleteGroup(node);
            });
            li.appendChild(row);
            if (node.children.length > 0) {
                li.appendChild(renderGroupList(node.children, true));
            }
            ul.appendChild(li);
        }
        return ul;
    }

    async function deleteGroup(node: GroupNode): Promise<void> {
        if (node.children.length > 0) {
            alert(`"${node.name}"에는 하위 GROUP이 있어 삭제할 수 없습니다. 하위 GROUP을 먼저 삭제하거나 다른 곳으로 옮기세요.`);
            return;
        }
        if (!confirm(`"${node.name}" GROUP을 삭제할까요?\n\n파일이 실제로 삭제되며 되돌릴 수 없습니다. 소속돼 있던 WP/DWP/OTHER 파일 자체는 지워지지 않습니다.`)) {
            return;
        }
        try {
            await deleteProjectFile(node.path);
            // 이 GROUP을 하위로 등록해뒀던 다른 GROUP들의 ITEMS에서도 참조를 제거한다.
            for (const g of allGroups) {
                if (g.path === node.path || !g.items.includes(node.filename)) continue;
                const raw = await readProjectFile(g.path);
                const items = parseGroupItems(raw).filter((f) => f !== node.filename);
                await writeProjectFile(g.path, setGroupItems(raw, items));
            }
            logInfo(`GROUP 삭제: ${node.filename}`);
        } catch (err) {
            logError(`GROUP 삭제 실패: ${node.filename}`, err);
            alert(`삭제 실패: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        if (selectedPath === node.path) selectedPath = null;
        await reload();
    }

    function renderMembersPanel(): void {
        const selected = selectedNode();
        if (!selected) {
            membersTitle.textContent = "루트";
            addMemberBtn.disabled = true;
            membersBody.innerHTML = `<div class="modal-empty">루트입니다. "+ GROUP"으로 최상위 GROUP을 만들 수 있습니다.</div>`;
            return;
        }
        membersTitle.textContent = selected.name;
        addMemberBtn.disabled = false;

        const groupFilenames = new Set(allGroups.map((g) => g.filename));
        const memberFilenames = selected.items.filter((f) => !groupFilenames.has(f));

        membersBody.innerHTML = "";
        if (memberFilenames.length === 0) {
            membersBody.innerHTML = `<div class="modal-empty">아직 소속된 WP/DWP/OTHER가 없습니다.</div>`;
            return;
        }
        const list = document.createElement("ul");
        list.className = "member-list";
        for (const filename of memberFilenames) {
            const { format, name } = parseElementFilename(filename);
            const li = document.createElement("li");
            li.className = "member-row";
            li.innerHTML = `<span class="tree-icon">${formatIcon[format]}</span><span class="member-name"></span><span class="member-remove" title="이 그룹에서 제거">×</span>`;
            li.querySelector(".member-name")!.textContent = name;
            li.querySelector(".member-remove")!.addEventListener("click", () => void removeMember(filename));
            list.appendChild(li);
        }
        membersBody.appendChild(list);
    }

    async function removeMember(filename: string): Promise<void> {
        const selected = selectedNode();
        if (!selected) return;
        try {
            const raw = await readProjectFile(selected.path);
            const items = parseGroupItems(raw).filter((f) => f !== filename);
            await writeProjectFile(selected.path, setGroupItems(raw, items));
            logInfo(`GROUP 멤버 제거: ${filename} ← ${selected.name}`);
        } catch (err) {
            logError(`멤버 제거 실패: ${filename}`, err);
            alert(`제거 실패: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        await reload();
    }

    async function addMembers(filenames: string[]): Promise<void> {
        const selected = selectedNode();
        if (!selected || filenames.length === 0) return;
        try {
            const raw = await readProjectFile(selected.path);
            const items = [...parseGroupItems(raw), ...filenames];
            await writeProjectFile(selected.path, setGroupItems(raw, items));
            logInfo(`GROUP 멤버 추가: ${filenames.join(", ")} → ${selected.name}`);
        } catch (err) {
            logError("멤버 추가 실패", err);
            alert(`추가 실패: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        await reload();
    }

    async function openAddMemberPicker(): Promise<void> {
        const selected = selectedNode();
        if (!selected) return;

        const [wp, dwp, other] = await Promise.all([
            listFormatFiles("WP"),
            listFormatFiles("DWP"),
            listFormatFiles("OTHER"),
        ]);
        const currentItems = new Set(selected.items);
        const candidates = [...wp, ...dwp, ...other]
            .map(basename)
            .filter((filename) => !currentItems.has(filename))
            .map((filename) => ({ filename, ...parseElementFilename(filename) }));

        membersBody.innerHTML = "";

        if (candidates.length === 0) {
            membersBody.innerHTML = `<div class="modal-empty">추가할 수 있는 WP/DWP/OTHER가 없습니다.</div>`;
        } else {
            const list = document.createElement("ul");
            list.className = "add-picker-list";
            const checkboxes: HTMLInputElement[] = [];
            for (const c of candidates) {
                const li = document.createElement("li");
                li.className = "add-picker-row";
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.value = c.filename;
                li.innerHTML = `<span class="tree-icon">${formatIcon[c.format as ElementFormat]}</span><span class="member-name"></span>`;
                li.querySelector(".member-name")!.textContent = c.name;
                li.prepend(checkbox);
                checkboxes.push(checkbox);
                list.appendChild(li);
            }
            membersBody.appendChild(list);

            const actions = document.createElement("div");
            actions.className = "add-picker-actions";
            actions.innerHTML = `<button class="tb-btn" data-role="confirm-add">선택 항목 추가</button><button class="tb-btn" data-role="cancel-add">취소</button>`;
            membersBody.appendChild(actions);

            actions.querySelector('[data-role="confirm-add"]')!.addEventListener("click", () => {
                const picked = checkboxes.filter((c) => c.checked).map((c) => c.value);
                void addMembers(picked);
            });
            actions.querySelector('[data-role="cancel-add"]')!.addEventListener("click", () => {
                renderMembersPanel();
            });
            return;
        }

        const actions = document.createElement("div");
        actions.className = "add-picker-actions";
        actions.innerHTML = `<button class="tb-btn" data-role="cancel-add">닫기</button>`;
        membersBody.appendChild(actions);
        actions.querySelector('[data-role="cancel-add"]')!.addEventListener("click", () => {
            renderMembersPanel();
        });
    }

    addMemberBtn.addEventListener("click", () => void openAddMemberPicker());

    async function createGroup(name: string, parent: GroupNode | null): Promise<void> {
        const trimmed = name.trim();
        if (!trimmed) return;
        const date = formatDateYYYYMMDD(new Date());
        const filename = `[GROUP][2.0][${date}]${trimmed}.md`;
        if (allGroups.some((g) => g.filename === filename)) {
            alert(`이미 같은 이름의 GROUP이 있습니다: ${filename}`);
            return;
        }
        const path = `.loadstar/GROUP/${filename}`;
        const content = `### IDENTITY\n- SUMMARY: ${trimmed}\n\n### CONNECTIONS\n- ITEMS: []\n`;
        try {
            await writeProjectFile(path, content);
            if (parent) {
                const raw = await readProjectFile(parent.path);
                const items = [...parseGroupItems(raw), filename];
                await writeProjectFile(parent.path, setGroupItems(raw, items));
            }
            logInfo(`GROUP 생성: ${filename}`);
        } catch (err) {
            logError(`GROUP 생성 실패: ${filename}`, err);
            alert(`GROUP 생성 실패: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
        await reload();
        selectedPath = path;
        renderTreePanel();
        renderMembersPanel();
    }

    overlay.querySelector<HTMLElement>('[data-role="add-group"]')!.addEventListener("click", () => {
        const parent = selectedNode();
        const name = prompt(parent ? `"${parent.name}" 하위에 만들 GROUP 이름:` : "최상위 GROUP 이름:");
        if (name === null) return; // 취소
        void createGroup(name, parent);
    });

    void reload();
}

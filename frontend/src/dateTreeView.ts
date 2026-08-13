// 두 번째 ViewMode 구현체 — "날짜별 보기". GROUP 계층은 아예 안 쓰고
// WP/DWP/GROUP/OTHER 전체를 mtime 기준 평면 목록(최신 → 과거)으로 보여준다.
// GROUP을 트리 구조로 유지하면 날짜 정렬 자체가 무의미해진다는 판단(사용자 결정) —
// 그래서 GROUP 파일도 다른 요소와 동일하게 평면 목록의 항목 하나로만 나타난다.
//
// 데이터 소스는 SQLite index.db가 아니라 파일 mtime 실시간 스캔이다
// (app.go:ListAllFilesWithModTime) — 재색인을 안 돌려도 항상 최신 상태를
// 보여주기 위해, 기존 GROUP 트리 뷰와 신선도 모델을 맞췄다.

import { listAllFilesWithModTime } from "./fs";
import { parseElementFilename, type TreeNode } from "./tree";
import type { ViewMode } from "./viewMode";
import { openDatePicker } from "./datePicker";

function basename(path: string): string {
    return path.split("/").pop() ?? path;
}

async function buildDateNodes(): Promise<TreeNode[]> {
    const files = await listAllFilesWithModTime();
    const nodes: TreeNode[] = files.map((f) => {
        const { format, name } = parseElementFilename(basename(f.path));
        return { name, format, path: f.path, mtime: f.modTime };
    });
    nodes.sort((a, b) => (b.mtime ?? "").localeCompare(a.mtime ?? "")); // 최신 → 과거
    return nodes;
}

export const dateTreeView: ViewMode = {
    id: "date-tree",
    label: "날짜별 보기",

    buildNodes: buildDateNodes,

    renderFilterPanel(container, nodes, onFilterChange) {
        let from = ""; // "YYYY-MM-DD" — 비어있으면 하한 없음
        let to = ""; // 비어있으면 상한 없음

        function apply(): void {
            onFilterChange(
                nodes.filter((n) => {
                    if (!n.mtime) return true;
                    const day = n.mtime.slice(0, 10); // ISO 앞 10자리 == "YYYY-MM-DD", 문자열 비교로 충분
                    if (from && day < from) return false;
                    if (to && day > to) return false;
                    return true;
                }),
            );
        }

        container.innerHTML = `
            <span class="date-filter-item">시작 <button type="button" class="tb-btn date-filter-trigger" data-role="from"></button></span>
            <span class="date-filter-item">종료 <button type="button" class="tb-btn date-filter-trigger" data-role="to"></button></span>
            <button class="tb-btn" data-role="reset">초기화</button>
        `;
        const fromBtn = container.querySelector<HTMLButtonElement>('[data-role="from"]')!;
        const toBtn = container.querySelector<HTMLButtonElement>('[data-role="to"]')!;

        function updateTriggerLabels(): void {
            fromBtn.textContent = from || "전체";
            toBtn.textContent = to || "전체";
        }

        fromBtn.addEventListener("click", () => {
            openDatePicker(fromBtn, {
                value: from,
                onSelect: (iso) => {
                    from = iso;
                    updateTriggerLabels();
                    apply();
                },
                onClear: () => {
                    from = "";
                    updateTriggerLabels();
                    apply();
                },
            });
        });
        toBtn.addEventListener("click", () => {
            openDatePicker(toBtn, {
                value: to,
                onSelect: (iso) => {
                    to = iso;
                    updateTriggerLabels();
                    apply();
                },
                onClear: () => {
                    to = "";
                    updateTriggerLabels();
                    apply();
                },
            });
        });
        container.querySelector('[data-role="reset"]')!.addEventListener("click", () => {
            from = "";
            to = "";
            updateTriggerLabels();
            apply();
        });

        updateTriggerLabels();
        apply(); // 초기 렌더 — 범위 없음(전체 표시) 상태 그대로 반영
    },
};

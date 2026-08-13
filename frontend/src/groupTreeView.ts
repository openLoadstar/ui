// 첫 ViewMode 구현체 — 지금까지의 "GROUP 계층 트리 + STATUS 필터"를 그대로 옮긴 것.
// 동작은 리팩토링 전과 동일해야 한다. `[WP][2.0][2026.08.13]뷰 전환 아키텍처.md` 참조.

import { buildProjectTree } from "./projectTree";
import { filterTreeByStatus } from "./tree";
import { STATUS_ORDER, STATUS_LABELS, STATUS_COLORS, type StatusBucket } from "./wpStatus";
import type { ViewMode } from "./viewMode";

export const groupTreeView: ViewMode = {
    id: "group-tree",
    label: "디렉토리(GROUP) 구조",

    buildNodes: buildProjectTree,

    renderFilterPanel(container, nodes, onFilterChange) {
        const activeStatuses = new Set<StatusBucket>(STATUS_ORDER);

        function apply(): void {
            onFilterChange(filterTreeByStatus(nodes, activeStatuses));
        }

        container.innerHTML = STATUS_ORDER.map(
            (status) => `
      <label class="status-filter-item" data-status="${status}">
        <input type="checkbox" checked />
        <span class="status-dot" style="background:${STATUS_COLORS[status]}"></span>
        ${STATUS_LABELS[status]}
      </label>`,
        ).join("");

        container.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                const status = checkbox.closest<HTMLElement>("[data-status]")!.dataset.status as StatusBucket;
                if (checkbox.checked) activeStatuses.add(status);
                else activeStatuses.delete(status);
                apply();
            });
        });

        apply(); // 초기 렌더 — 전체 선택 상태 그대로 반영
    },
};

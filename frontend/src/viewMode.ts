// 좌측 트리 + 우상단 필터 패널을 한 쌍으로 묶어 교체 가능하게 하는 인터페이스.
// `[WP][2.0][2026.08.13]뷰 전환 아키텍처.md` 참조.
//
// 필터 변경 시 buildNodes()를 다시 부르지 않는다 — 뷰 진입/"⟳ 업데이트" 시점에
// 전체 데이터를 한 번 확정해두고, renderFilterPanel이 그 데이터 위에서 클라이언트
// 사이드로만 걸러낸다(위 WP COMMENT의 동기화 이슈 유예 결정). 그래서 필터 변경
// 자체는 비동기 I/O를 안 타고, 응답 순서가 뒤바뀔 일도 없다.

import type { TreeNode } from "./tree";

export interface ViewMode {
    id: string;
    label: string;

    /** 이 뷰의 좌측 트리 전체 데이터를 가져온다(필터 적용 전, 매번 새로 조회). */
    buildNodes(): Promise<TreeNode[]>;

    /**
     * 우상단 필터 패널을 container에 그린다. nodes는 buildNodes()가 방금 반환한 전체 데이터.
     * 필터 상태가 바뀔 때마다 onFilterChange(그 상태로 걸러진 nodes)를 호출해야 하고,
     * 최초 마운트 시에도 한 번 호출해서 초기 필터 상태(보통 "전체 표시")를 반영해야 한다.
     * 연속 입력(검색어 등)이 있는 필터는 구현체가 알아서 디바운스한다.
     */
    renderFilterPanel(container: HTMLElement, nodes: TreeNode[], onFilterChange: (filtered: TreeNode[]) => void): void;
}

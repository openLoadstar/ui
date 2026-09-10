// 세 번째 ViewMode 구현체 — "검색"(`[WP][2.0][2026.09.10]검색.md` G2).
// 좌측 트리를 "검색 결과 목록"이라는 관점으로 바꿔 쓴다: 파일 노드(일치 수 배지)
// 아래에 라인 히트 노드가 붙고, 히트를 클릭하면 그 파일이 열리면서 같은 키워드가
// 화면에서 하이라이트된다(main.ts가 selectionQuery를 읽어 TabManager로 넘긴다).
//
// 이 뷰는 필터(검색어)가 바뀔 때마다 Go를 다시 호출한다 — "필터는 재조회하지
// 않는다"(`[WP][2.0][2026.08.13]뷰 전환 아키텍처.md` COMMENT)의 첫 예외다.
// 같은 COMMENT가 예고한 대로 디바운스로 호출을 줄이고, 응답 순서가 뒤바뀌어
// 오래된 결과가 최신 결과를 덮어쓰는 것은 요청 시퀀스 번호로 막는다.

import { searchInFiles } from "./fs";
import { parseElementFilename, type TreeNode } from "./tree";
import type { ViewMode } from "./viewMode";
import { logError } from "./log";
import type { main } from "../wailsjs/go/models";

const DEBOUNCE_MS = 300;
/**
 * 자동(입력 중) 검색을 시작하는 최소 글자 수. 한 글자 질의는 거의 모든 파일이
 * 걸려 결과 트리가 수백~수천 행이 되고, 그걸 타자마다 다시 그리게 된다.
 * "검색" 버튼이나 Enter로 명시적으로 실행하면 한 글자도 그대로 검색한다.
 */
const AUTO_SEARCH_MIN_LEN = 2;

// 뷰를 나갔다 돌아와도(필터 패널이 다시 마운트돼도) 마지막 검색 상태를 유지한다.
let lastQuery = "";
let caseSensitive = false;
let lastResults: TreeNode[] = [];
let lastSummary = "";
let requestSeq = 0;

function basename(path: string): string {
    return path.split("/").pop() ?? path;
}

function toNodes(results: main.SearchFileResult[]): TreeNode[] {
    return results.map((r) => {
        const { format, name } = parseElementFilename(basename(r.path));
        return {
            name,
            format,
            path: r.path,
            hits: r.count,
            children: r.hits.map((h) => ({
                name: h.text,
                format,
                path: r.path,
                hitIndex: h.index,
                hitLine: h.line,
            })),
        };
    });
}

function summarize(results: main.SearchFileResult[]): string {
    if (results.length === 0) return "결과 없음";
    const total = results.reduce((sum, r) => sum + r.count, 0);
    return `${results.length}개 파일 · ${total}건`;
}

/** Ctrl+Shift+F — 검색 뷰로 전환한 뒤 입력창에 포커스를 준다(main.ts에서 호출). */
export function focusSearchInput(): void {
    const input = document.querySelector<HTMLInputElement>("#view-filter-panel .search-input");
    input?.focus();
    input?.select();
}

export const searchView: ViewMode = {
    id: "search",
    label: "검색",

    // 검색은 검색어 없이는 볼 데이터가 없다 — 실제 조회는 필터 패널이 한다.
    // "⟳ 업데이트"로 이 뷰에 다시 들어와도 마지막 검색어가 그대로 다시 실행된다.
    async buildNodes(): Promise<TreeNode[]> {
        return [];
    },

    renderFilterPanel(container, _nodes, onFilterChange) {
        container.innerHTML = `
            <input class="search-input" type="text" placeholder="전체 파일 검색 (Ctrl+Shift+F)" spellcheck="false" />
            <button class="tb-btn" data-role="run">검색</button>
            <button class="tb-btn find-btn--toggle" data-role="case" title="대소문자 구분">Aa</button>
            <span class="search-summary"></span>
        `;
        const input = container.querySelector<HTMLInputElement>(".search-input")!;
        const runBtn = container.querySelector<HTMLButtonElement>('[data-role="run"]')!;
        const caseBtn = container.querySelector<HTMLButtonElement>('[data-role="case"]')!;
        const summaryEl = container.querySelector<HTMLElement>(".search-summary")!;

        input.value = lastQuery;
        caseBtn.classList.toggle("find-btn--active", caseSensitive);
        summaryEl.textContent = lastSummary;

        async function run(query: string): Promise<void> {
            lastQuery = query;
            const seq = ++requestSeq;
            if (query.trim() === "") {
                lastResults = [];
                lastSummary = "";
                summaryEl.textContent = "";
                onFilterChange([]);
                return;
            }
            summaryEl.textContent = "검색 중…";
            let results: main.SearchFileResult[] = [];
            try {
                results = await searchInFiles(query, caseSensitive);
            } catch (err) {
                logError(`검색 실패: ${query}`, err);
                if (seq === requestSeq) summaryEl.textContent = "검색 실패";
                return;
            }
            // 뒤늦게 도착한 예전 요청의 결과는 버린다 — 최신 요청만 화면에 반영.
            if (seq !== requestSeq) return;
            lastResults = toNodes(results);
            lastSummary = summarize(results);
            summaryEl.textContent = lastSummary;
            onFilterChange(lastResults);
        }

        let timer: ReturnType<typeof setTimeout> | null = null;
        function schedule(query: string): void {
            if (timer) clearTimeout(timer);
            // 지웠을 때(빈 문자열)는 결과를 즉시 비워야 하므로 하한을 적용하지 않는다.
            if (query !== "" && query.trim().length < AUTO_SEARCH_MIN_LEN) return;
            timer = setTimeout(() => void run(query), DEBOUNCE_MS);
        }

        /** 버튼/Enter — 디바운스도 글자 수 하한도 건너뛰고 지금 바로 검색한다. */
        function runNow(): void {
            if (timer) clearTimeout(timer);
            void run(input.value);
        }

        input.addEventListener("input", (e) => {
            // 한글 등 IME 조합 중에는 자모 단위로 input이 튀어나온다 — 조합이
            // 끝나기 전에는 검색하지 않는다(compositionend에서 한 번만 건다).
            if ((e as InputEvent).isComposing) return;
            schedule(input.value);
        });
        input.addEventListener("compositionend", () => schedule(input.value));
        input.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            if (e.isComposing) return; // 조합 확정용 Enter — 검색 실행이 아니다
            runNow();
        });
        runBtn.addEventListener("click", () => runNow());
        caseBtn.addEventListener("click", () => {
            caseSensitive = !caseSensitive;
            caseBtn.classList.toggle("find-btn--active", caseSensitive);
            void run(input.value);
        });

        // 마운트 직후 한 번은 반드시 onFilterChange를 호출해야 한다(ViewMode 계약).
        // 마지막 검색 결과가 있으면 그대로 되살리고, 없으면 빈 목록으로 시작한다.
        onFilterChange(lastResults);
    },

    selectionQuery(): string {
        return lastQuery;
    },
};

// 화면 내 키워드 찾기(Ctrl+F) — `[WP][2.0][2026.09.10]검색.md` G1.
//
// 보기 모드는 렌더링된 DOM의 텍스트 노드를 <mark class="find-hit">로 감싸
// 반전 색으로 표시한다. 편집 모드(textarea)는 DOM에 마크를 넣을 수 없어
// 현재 일치만 selection으로 표시한다(개수/이동은 동일하게 동작).

export interface FindTarget {
    /** 하이라이트 대상 — 보기 모드의 렌더 결과 컨테이너. */
    body: HTMLElement;
    /** 편집 모드일 때의 textarea. 있으면 selection 기반으로 동작한다. */
    textarea: HTMLTextAreaElement | null;
}

/** 하이라이트를 걷어내고 쪼개진 텍스트 노드를 다시 합친다. */
export function clearHighlights(root: HTMLElement): void {
    const marks = Array.from(root.querySelectorAll<HTMLElement>("mark.find-hit"));
    for (const mark of marks) {
        mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
    }
    if (marks.length > 0) root.normalize(); // 인접 텍스트 노드 병합 — 다음 검색이 경계를 넘어 매칭되도록
}

function isSkippable(node: Text): boolean {
    for (let el = node.parentElement; el; el = el.parentElement) {
        // mermaid가 그린 SVG 안에 <mark>를 넣으면 다이어그램이 깨진다.
        if (el instanceof SVGElement) return true;
        const tag = el.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "IFRAME") return true;
    }
    return false;
}

/** root 안의 query 일치를 전부 <mark>로 감싸고, 그 mark 목록을 문서 순서로 돌려준다. */
function highlightAll(root: HTMLElement, query: string, caseSensitive: boolean): HTMLElement[] {
    clearHighlights(root);
    if (!query) return [];

    const needle = caseSensitive ? query : query.toLowerCase();
    // 순회 중 DOM을 바꾸면 TreeWalker가 흐트러진다 — 대상 노드를 먼저 모아둔다.
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n as Text;
        if (text.data.length === 0 || isSkippable(text)) continue;
        const haystack = caseSensitive ? text.data : text.data.toLowerCase();
        if (haystack.includes(needle)) textNodes.push(text);
    }

    const marks: HTMLElement[] = [];
    for (const node of textNodes) {
        const data = node.data;
        const haystack = caseSensitive ? data : data.toLowerCase();
        const fragment = document.createDocumentFragment();
        let pos = 0;
        for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, pos)) {
            if (i > pos) fragment.appendChild(document.createTextNode(data.slice(pos, i)));
            const mark = document.createElement("mark");
            mark.className = "find-hit";
            mark.textContent = data.slice(i, i + needle.length);
            fragment.appendChild(mark);
            marks.push(mark);
            pos = i + needle.length;
        }
        if (pos < data.length) fragment.appendChild(document.createTextNode(data.slice(pos)));
        node.replaceWith(fragment);
    }
    return marks;
}

/** textarea 값에서 일치 오프셋 목록을 구한다(편집 모드용). */
function findOffsets(value: string, query: string, caseSensitive: boolean): number[] {
    if (!query) return [];
    const haystack = caseSensitive ? value : value.toLowerCase();
    const needle = caseSensitive ? query : query.toLowerCase();
    const offsets: number[] = [];
    for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
        offsets.push(i);
    }
    return offsets;
}

/**
 * textarea를 offset이 화면 중앙에 오도록 스크롤한다.
 *
 * 브라우저 기본 동작(focus 시 캐럿을 보이게 스크롤)은 일치를 화면 가장자리에
 * 딱 붙여놔서 찾기 바에 가리기 쉽다. 줄 번호 × 줄 높이로 계산하는 방법은
 * textarea가 자동 줄바꿈(pre-wrap 기본값)을 하기 때문에 어긋난다 — 그래서
 * 같은 폭/폰트를 가진 임시 mirror 요소에 offset까지의 텍스트를 넣어
 * 실제 렌더 높이를 재는 방식으로 구한다.
 */
function scrollTextareaToOffset(textarea: HTMLTextAreaElement, offset: number): void {
    const cs = getComputedStyle(textarea);
    const mirror = document.createElement("div");
    const copied = [
        "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
        "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
        "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
        "boxSizing", "tabSize", "width",
    ] as const;
    for (const prop of copied) mirror.style[prop] = cs[prop];
    mirror.style.position = "absolute";
    mirror.style.top = "-9999px";
    mirror.style.left = "-9999px";
    mirror.style.height = "auto";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.overflowWrap = "break-word";
    mirror.textContent = textarea.value.slice(0, offset);
    // 마지막 줄이 비어 있어도 높이를 잃지 않도록 눈에 안 보이는 표식을 붙인다.
    const marker = document.createElement("span");
    marker.textContent = "|";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const top = marker.offsetTop;
    mirror.remove();
    textarea.scrollTop = Math.max(0, top - textarea.clientHeight / 2);
}

/**
 * 탭 콘텐츠 위에 떠 있는 찾기 바. TabManager가 하나만 만들어 재사용한다 —
 * 탭 내용은 재렌더될 때마다 innerHTML이 통째로 갈리므로, 바 element 자체는
 * 여기서 들고 있다가 attach()로 다시 붙인다.
 */
export class FindBar {
    private el: HTMLElement;
    private input: HTMLInputElement;
    private countEl: HTMLElement;
    private caseBtn: HTMLButtonElement;
    private opened = false;
    private query = "";
    private caseSensitive = false;
    private marks: HTMLElement[] = [];
    private offsets: number[] = []; // 편집 모드용
    private current = -1;
    private target: FindTarget | null = null;

    constructor() {
        this.el = document.createElement("div");
        this.el.className = "find-bar";
        this.el.innerHTML = `
            <input class="find-input" type="text" placeholder="찾기" spellcheck="false" />
            <span class="find-count">0/0</span>
            <button class="find-btn" data-role="prev" title="이전 (Shift+Enter)">▲</button>
            <button class="find-btn" data-role="next" title="다음 (Enter)">▼</button>
            <button class="find-btn find-btn--toggle" data-role="case" title="대소문자 구분">Aa</button>
            <button class="find-btn" data-role="close" title="닫기 (Esc)">×</button>
        `;
        this.input = this.el.querySelector<HTMLInputElement>(".find-input")!;
        this.countEl = this.el.querySelector<HTMLElement>(".find-count")!;
        this.caseBtn = this.el.querySelector<HTMLButtonElement>('[data-role="case"]')!;

        this.input.addEventListener("input", () => this.run(this.input.value));
        this.input.addEventListener("keydown", (e) => {
            // 한글 조합을 확정하려고 누른 Enter는 "다음 일치로 이동"이 아니다.
            if (e.isComposing) return;
            if (e.key === "Enter") {
                e.preventDefault();
                this.step(e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape") {
                e.preventDefault();
                this.close();
            }
        });
        this.el.querySelector('[data-role="next"]')!.addEventListener("click", () => this.step(1, true));
        this.el.querySelector('[data-role="prev"]')!.addEventListener("click", () => this.step(-1, true));
        this.caseBtn.addEventListener("click", () => {
            this.caseSensitive = !this.caseSensitive;
            this.caseBtn.classList.toggle("find-btn--active", this.caseSensitive);
            this.run(this.query);
        });
        this.el.querySelector('[data-role="close"]')!.addEventListener("click", () => this.close());
    }

    isOpen(): boolean {
        return this.opened;
    }

    /**
     * 탭 내용이 다시 렌더된 뒤 호출한다. 열려 있으면 새 DOM에 바를 다시 붙이고
     * 하이라이트를 재적용한다(닫혀 있으면 아무 일도 하지 않는다).
     */
    attach(container: HTMLElement, target: FindTarget): void {
        this.target = target;
        if (!this.opened) return;
        container.appendChild(this.el);
        this.run(this.query, Math.max(this.current, 0));
    }

    /** Ctrl+F / 검색 뷰에서 진입. hitIndex를 주면 그 순번의 일치로 바로 이동한다. */
    open(container: HTMLElement, target: FindTarget, query?: string, hitIndex?: number): void {
        this.target = target;
        this.opened = true;
        container.appendChild(this.el);
        if (query !== undefined && query !== "") this.query = query;
        this.input.value = this.query;
        this.run(this.query, hitIndex ?? 0);
        this.input.focus();
        this.input.select();
    }

    close(): void {
        this.opened = false;
        if (this.target) clearHighlights(this.target.body);
        this.marks = [];
        this.offsets = [];
        this.current = -1;
        this.el.remove();
    }

    /** 현재 검색어 — 탭을 바꿔도 같은 키워드로 이어서 찾도록 TabManager가 참조한다. */
    currentQuery(): string {
        return this.query;
    }

    private run(query: string, desiredIndex = 0): void {
        this.query = query;
        if (this.input.value !== query) this.input.value = query;
        if (!this.target) return;

        if (this.target.textarea) {
            // 편집 모드 — textarea 안에는 <mark>를 넣을 수 없어 selection으로 대체한다.
            clearHighlights(this.target.body);
            this.marks = [];
            this.offsets = findOffsets(this.target.textarea.value, query, this.caseSensitive);
        } else {
            this.offsets = [];
            this.marks = highlightAll(this.target.body, query, this.caseSensitive);
        }

        const total = this.total();
        // 원문(raw) 기준 히트 순번이 렌더 결과의 일치 수보다 클 수 있다
        // (`[WP][2.0][2026.09.10]검색.md` ISSUE) — 마지막 일치로 clamp한다.
        this.current = total === 0 ? -1 : Math.min(Math.max(desiredIndex, 0), total - 1);
        this.reveal();
        this.updateCount();
    }

    private total(): number {
        return this.target?.textarea ? this.offsets.length : this.marks.length;
    }

    /**
     * 다음/이전 일치로 이동(F3 / Shift+F3, Enter / Shift+Enter).
     *
     * focusTarget: 편집 모드에서 textarea로 포커스를 옮길지. textarea는 포커스가
     * 없으면 선택 영역 색이 거의 보이지 않아서, ▲▼ 버튼·F3처럼 "이동" 의도가
     * 분명한 조작에서만 포커스를 넘겨 반전색이 제대로 보이게 한다. 검색어
     * 입력 중(Enter)에는 넘기지 않는다 — 이어서 친 글자가 문서에 들어가버린다.
     */
    step(direction: 1 | -1, focusTarget = false): void {
        const total = this.total();
        if (total === 0) return;
        this.current = (this.current + direction + total) % total; // 끝에서 반대쪽으로 순환
        this.reveal(focusTarget);
        this.updateCount();
    }

    private reveal(focusTarget = false): void {
        if (this.current < 0) return;
        const textarea = this.target?.textarea;
        if (textarea) {
            const start = this.offsets[this.current];
            if (focusTarget) textarea.focus(); // 포커스가 있어야 선택 영역이 accent 색으로 또렷하게 보인다
            textarea.setSelectionRange(start, start + this.query.length);
            scrollTextareaToOffset(textarea, start); // focus가 유발한 기본 스크롤을 덮어써 중앙에 맞춘다
            return;
        }
        this.marks.forEach((m, i) => m.classList.toggle("find-hit--current", i === this.current));
        this.marks[this.current]?.scrollIntoView({ block: "center", inline: "nearest" });
    }

    private updateCount(): void {
        const total = this.total();
        this.countEl.textContent = total === 0 ? "0/0" : `${this.current + 1}/${total}`;
        this.countEl.classList.toggle("find-count--empty", !!this.query && total === 0);
    }
}

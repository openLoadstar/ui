// md → HTML 렌더링 + Mermaid 다이어그램 표시.
//
// 다이어그램 렌더링 로직은 직접 구현하지 않고 mermaid.js를 그대로 활용한다
// (탐색기 셸/md Mermaid 뷰어 WP GOAL 참조).

import MarkdownIt from "markdown-it";
import mermaid from "mermaid";

const md: MarkdownIt = new MarkdownIt({ html: false, linkify: true, breaks: false });
// ".md"가 실제 ccTLD(몰도바)라서 linkify의 fuzzy 도메인 감지가 "이름.md" 같은 파일명을
// http://이름.md 링크로 오인식한다. 명시적 스킴(https://...) 링크만 자동 인식하도록 끈다.
md.linkify.set({ fuzzyLink: false, fuzzyEmail: false });

// ```mermaid 코드블록을 <pre class="mermaid">로 감싸는 렌더러 규칙.
const defaultFenceRenderer = md.renderer.rules.fence!.bind(md.renderer.rules);
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info.trim().toLowerCase();
    if (lang === "mermaid") {
        return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>`;
    }
    return defaultFenceRenderer(tokens, idx, options, env, self);
};

let mermaidInitialized = false;
function ensureMermaidInitialized(): void {
    if (mermaidInitialized) return;
    mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
    mermaidInitialized = true;
}

/**
 * OTHER의 비-markdown 텍스트 파일(csv/json/txt 등)을 원문 그대로 보여준다.
 * markdown-it을 안 태우는 이유: 콤마·파이프·언더스코어 같은 CSV/코드 특유의
 * 문자가 마크다운 문법(표, 강조 등)으로 오인식돼 원문이 깨져 보인다.
 */
export function renderPlainText(container: HTMLElement, raw: string): void {
    container.innerHTML = `<pre>${md.utils.escapeHtml(raw)}</pre>`;
}

/**
 * OTHER의 자기완결형 html 파일(인라인 CSS/JS만 쓰고 외부 리소스를 상대경로로
 * 참조하지 않는 것)을 iframe으로 그대로 렌더링한다. 뷰어 전용 — 수정 기능은
 * 필요 없다는 요구사항이라 tabs.ts의 edit 모드(범용 textarea)는 그대로 두고
 * 건드리지 않았다.
 *
 * `srcdoc`을 쓰는 이유: `src="file://..."`는 웹뷰의 크로스 오리진 정책에 걸릴
 * 수 있는 반면, `srcdoc`은 완전히 격리된 문서를 그 자리에서 그려서 문제가 없다.
 * 대신 기준 경로가 없어 상대경로 리소스(`<img src="./x.png">` 등)는 못 불러온다
 * — 지금 OTHER에 있는 html들은 전부 인라인이라 해당 없음.
 *
 * sandbox="allow-scripts"만 준다: 문서 내 인터랙션(예: 비용 계산기 입력창)은
 * 동작해야 하지만, 부모 앱 네비게이션·팝업·스토리지 접근 등은 막아둔다.
 */
export function renderHtmlFile(container: HTMLElement, raw: string): void {
    container.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.className = "html-file-frame";
    iframe.sandbox.add("allow-scripts");
    iframe.srcdoc = raw;
    container.appendChild(iframe);
}

/** raw md 텍스트를 container에 렌더링하고, 포함된 mermaid 블록을 다이어그램으로 표시한다. */
export async function renderMarkdown(container: HTMLElement, raw: string): Promise<void> {
    ensureMermaidInitialized();
    container.innerHTML = md.render(raw);

    const mermaidNodes = container.querySelectorAll<HTMLElement>("pre.mermaid");
    if (mermaidNodes.length === 0) return;

    try {
        await mermaid.run({ nodes: mermaidNodes });
    } catch (err) {
        // 문법 오류가 있는 다이어그램만 개별적으로 에러 표시하고, 나머지 렌더링은 유지한다.
        console.error("Mermaid render error:", err);
    }
}

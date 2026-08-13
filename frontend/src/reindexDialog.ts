// 툴바 "⟳ 재색인" 버튼 — 구조 추출기(extractor.go:Reindex)를 수동 실행해
// .loadstar/.cache/index.db를 재생성한다. renameDialog.ts/deleteDialog.ts와
// 같은 modal chrome을 쓰되, 이건 입력이 아니라 확인 → 진행 → 결과 세 단계를
// 거치는 상태 전환형 대화상자라 본문(.modal-body)을 통째로 갈아끼운다.
//
// 진행 표시는 불확정 스피너로 충분하다고 판단했다 — 실측상 이 정도 규모
// 프로젝트에서 재색인은 1초 미만이라, 파일 단위 실제 진행률(%)을 보여주려면
// Go 쪽에 Wails 이벤트를 새로 심어야 하는데 그 비용 대비 체감 이득이 적다.

import { makeDraggable, makeResizable } from "./dialogChrome";
import type { main } from "../wailsjs/go/models";

export interface ReindexDialogOptions {
    onReindex: () => Promise<main.ReindexStats>;
}

export function openReindexDialog(opts: ReindexDialogOptions): void {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="reindex-dialog-box">
            <div class="modal-header">
                <span class="modal-title">재색인</span>
                <span class="modal-close">×</span>
            </div>
            <div class="modal-body"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    const box = overlay.querySelector<HTMLElement>(".reindex-dialog-box")!;
    const header = overlay.querySelector<HTMLElement>(".modal-header")!;
    const closeIcon = overlay.querySelector<HTMLElement>(".modal-close")!;
    const body = overlay.querySelector<HTMLElement>(".modal-body")!;
    makeDraggable(box, header);
    makeResizable(box, { minWidth: 340, minHeight: 180 });

    // 대화상자는 화면 안 버튼으로만 닫힌다(바깥 클릭·Escape 안 됨, 의도적) —
    // 진행 중에는 그 버튼(×)마저 숨겨서 작업 도중 닫히지 않게 한다.
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        overlay.remove();
    };
    closeIcon.addEventListener("click", close);

    function renderConfirm(): void {
        closeIcon.style.visibility = "visible";
        body.innerHTML = `
            <p class="reindex-message">WP/DWP/GROUP/OTHER 파일을 분석해서 index.db에 갱신합니다.</p>
            <div class="modal-footer">
                <button class="tb-btn" data-role="cancel">취소</button>
                <button class="tb-btn tb-btn--primary" data-role="confirm">확인</button>
            </div>
        `;
        body.querySelector('[data-role="cancel"]')!.addEventListener("click", close);
        body.querySelector('[data-role="confirm"]')!.addEventListener("click", () => void runReindex());
    }

    function renderProgress(): void {
        closeIcon.style.visibility = "hidden";
        body.innerHTML = `
            <div class="reindex-progress">
                <div class="reindex-spinner"></div>
                <p>처리 중...</p>
            </div>
        `;
    }

    function renderResult(stats: main.ReindexStats): void {
        closeIcon.style.visibility = "visible";
        const brokenPart = stats.BrokenEdges > 0 ? ` (깨진 참조 ${stats.BrokenEdges}개 포함)` : "";
        body.innerHTML = `
            <p class="reindex-result">재색인 완료 — 노드 ${stats.Nodes}개, 엣지 ${stats.Edges}개${brokenPart}</p>
            <div class="modal-footer">
                <button class="tb-btn tb-btn--primary" data-role="close">확인</button>
            </div>
        `;
        body.querySelector('[data-role="close"]')!.addEventListener("click", close);
    }

    function renderError(message: string): void {
        closeIcon.style.visibility = "visible";
        body.innerHTML = `
            <p class="reindex-result reindex-result--error">재색인 실패: ${escapeHtml(message)}</p>
            <div class="modal-footer">
                <button class="tb-btn" data-role="close">닫기</button>
            </div>
        `;
        body.querySelector('[data-role="close"]')!.addEventListener("click", close);
    }

    async function runReindex(): Promise<void> {
        renderProgress();
        try {
            const stats = await opts.onReindex();
            renderResult(stats);
        } catch (err) {
            renderError(err instanceof Error ? err.message : String(err));
        }
    }

    renderConfirm();
}

function escapeHtml(s: string): string {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
}

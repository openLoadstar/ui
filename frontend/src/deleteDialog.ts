// 트리 우클릭 > 삭제 확인 대화상자. renameDialog.ts와 같은 이유로 브라우저 기본
// confirm()을 앱 스타일 모달로 교체한다 — 다만 이건 입력 없이 위험 액션 확인만
// 하면 되니 renameDialog보다 단순하다.
//
// "삭제"라고 부르지만 실제로는 파일을 지우지 않는다 — 확장자 뒤에 ".del"을
// 덧붙여 목록에서만 안 보이게 한다(WP.GOAL: 대부분 설계 문서라 진짜 삭제는
// 탐색기에서 직접 하는 게 안전). ListFormatFiles가 ".del" 접미사 파일을
// 항상 걸러내므로 파일 탐색기에서 도로 이름을 되돌리면 그대로 복구된다.

import { makeDraggable, makeResizable } from "./dialogChrome";

export interface DeleteDialogOptions {
    /** 트리에 표시되는 이름(확장자 제외 — WP/DWP 등) */
    displayName: string;
    format: string;
    onDelete: () => Promise<void>;
}

export function openDeleteDialog(opts: DeleteDialogOptions): void {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="delete-dialog-box">
            <div class="modal-header">
                <span class="modal-title">삭제</span>
                <span class="modal-close">×</span>
            </div>
            <div class="modal-body">
                <p class="delete-message">
                    <strong>"${escapeHtml(opts.displayName)}"</strong>(${escapeHtml(opts.format)})을 삭제할까요?
                </p>
                <p class="rename-hint">
                    실제로 파일을 지우지 않고 확장자 뒤에 <code>.del</code>을 붙여 목록에서만 숨깁니다.
                    완전히 삭제하려면 탐색기에서 직접 지워주세요 — 반대로 되돌리려면 탐색기에서
                    <code>.del</code>만 떼어내면 복구됩니다.
                    이 파일을 참조하는 다른 WP의 CONNECTIONS는 자동으로 정리되지 않습니다
                    (검증 도구가 나중에 깨진 참조로 감지). 소속 GROUP의 ITEMS는 일부러 그대로
                    둡니다 — 나중에 복구하면 소속도 같이 돌아오도록.
                </p>
                <div class="delete-error" hidden></div>
                <div class="modal-footer">
                    <button class="tb-btn" data-role="cancel">취소</button>
                    <button class="tb-btn tb-btn--danger" data-role="confirm">삭제</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const box = overlay.querySelector<HTMLElement>(".delete-dialog-box")!;
    const header = overlay.querySelector<HTMLElement>(".modal-header")!;
    makeDraggable(box, header);
    makeResizable(box, { minWidth: 340, minHeight: 240 });

    // 대화상자는 화면 안 버튼(×/취소/삭제)으로만 닫힌다 — 바깥 클릭·Escape로는 안 닫음(의도적,
    // 위험한 액션이라 실수로 닫히는 것보다야 명시적으로 취소하게 하는 쪽이 안전).
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        overlay.remove();
    };
    overlay.querySelector(".modal-close")!.addEventListener("click", close);
    overlay.querySelector('[data-role="cancel"]')!.addEventListener("click", close);

    const confirmBtn = overlay.querySelector<HTMLButtonElement>('[data-role="confirm"]')!;
    const errorEl = overlay.querySelector<HTMLElement>(".delete-error")!;

    confirmBtn.addEventListener("click", () => {
        void (async () => {
            confirmBtn.disabled = true;
            confirmBtn.textContent = "삭제 중...";
            try {
                await opts.onDelete();
                close();
            } catch (err) {
                errorEl.textContent = `삭제 실패: ${err instanceof Error ? err.message : String(err)}`;
                errorEl.hidden = false;
                confirmBtn.disabled = false;
                confirmBtn.textContent = "삭제";
            }
        })();
    });

}

function escapeHtml(s: string): string {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
}

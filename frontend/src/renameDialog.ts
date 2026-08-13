// 트리 우클릭 > 이름변경 대화상자. 기존엔 브라우저 기본 prompt()/confirm()/alert()를
// 이어붙여 썼는데, 앱 다크 테마와 안 어울리는 네이티브 팝업이라 browseModal.ts /
// otherFilterSettings.ts와 같은 modal chrome으로 교체한다.
//
// 실제 이름변경 로직(경로 조합, RenameFile 호출, GROUP 멤버십 갱신)은 main.ts에
// 그대로 둔다 — 거기서만 접근 가능한 클로저(tabs, refreshTreeAndTimestamp 등)에
// 얽혀 있어서, 이 모듈은 "새 이름을 입력받는 UI"만 맡고 실행은 콜백에 위임한다.

import { makeDraggable, makeResizable } from "./dialogChrome";

export interface RenameDialogOptions {
    /** 현재 파일명(확장자 포함, 예: "[GROUP][2.0][2026.08.11]이름.md") */
    currentFilename: string;
    /** 다이얼로그에 보여줄 표시 이름(트리에 뜨는 이름 — FORMAT/VER/DATE 접두어 제외) */
    currentDisplayName: string;
    /**
     * 새 이름(트리 표시 이름 기준)을 받아 실제 파일명으로 바꿔본다.
     * 접두어 패턴에 안 맞으면(OTHER 등 구조화 이름이 아닌 파일) null.
     */
    resolveNewFilename: (newDisplayName: string) => string | null;
    /** 실행 콜백 — 성공하면 정상 반환, 실패하면 reject(에러 메시지가 다이얼로그에 표시됨). */
    onRename: (newFilename: string, newDisplayName: string) => Promise<void>;
}

export function openRenameDialog(opts: RenameDialogOptions): void {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="rename-dialog-box">
            <div class="modal-header">
                <span class="modal-title">이름 변경</span>
                <span class="modal-close">×</span>
            </div>
            <div class="modal-body">
                <input type="text" class="rename-input" />
                <div class="rename-error" hidden></div>
                <p class="rename-hint">
                    이 파일을 참조하는 다른 WP의 CONNECTIONS는 자동으로 갱신되지 않습니다
                    (검증 도구가 나중에 깨진 참조로 감지). 소속 GROUP은 자동으로 갱신됩니다.
                </p>
                <div class="modal-footer">
                    <button class="tb-btn" data-role="cancel">취소</button>
                    <button class="tb-btn tb-btn--primary" data-role="confirm">이름 변경</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const box = overlay.querySelector<HTMLElement>(".rename-dialog-box")!;
    const header = overlay.querySelector<HTMLElement>(".modal-header")!;
    makeDraggable(box, header);
    makeResizable(box, { minWidth: 340, minHeight: 220 });

    const input = overlay.querySelector<HTMLInputElement>(".rename-input")!;
    const errorEl = overlay.querySelector<HTMLElement>(".rename-error")!;
    const confirmBtn = overlay.querySelector<HTMLButtonElement>('[data-role="confirm"]')!;

    input.value = opts.currentDisplayName;

    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        overlay.remove();
    };
    // 대화상자는 화면 안 버튼(×/취소/이름변경)으로만 닫힌다 — 바깥 클릭·Escape로는 안 닫음(의도적).
    overlay.querySelector(".modal-close")!.addEventListener("click", close);
    overlay.querySelector('[data-role="cancel"]')!.addEventListener("click", close);

    function showError(message: string): void {
        errorEl.textContent = message;
        errorEl.hidden = false;
    }
    function clearError(): void {
        errorEl.hidden = true;
        errorEl.textContent = "";
    }

    async function submit(): Promise<void> {
        const trimmed = input.value.trim();
        clearError();

        if (!trimmed) {
            showError("이름을 입력하세요.");
            return;
        }
        if (trimmed === opts.currentDisplayName) {
            close(); // 바뀐 게 없으면 조용히 닫는다(기존 prompt() 동작과 동일)
            return;
        }
        const newFilename = opts.resolveNewFilename(trimmed);
        if (!newFilename) {
            showError("파일명 형식을 해석할 수 없어 이름을 바꿀 수 없습니다.");
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = "변경 중...";
        try {
            await opts.onRename(newFilename, trimmed);
            close();
        } catch (err) {
            showError(`이름 변경 실패: ${err instanceof Error ? err.message : String(err)}`);
            confirmBtn.disabled = false;
            confirmBtn.textContent = "이름 변경";
        }
    }

    confirmBtn.addEventListener("click", () => void submit());
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void submit();
    });

    input.focus();
    input.select();
}

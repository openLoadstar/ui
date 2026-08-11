// OTHER 파일 확장자 필터 설정 — 전역(프로젝트 무관) 설정이다.
//
// OTHER는 `[FORMAT][VER][DATE]이름.md` 명명 규칙이 면제되는 유일한 FORMAT이라
// (`02.ELEMENT_FORMAT.md` §1) csv/json/pptx 등 어떤 확장자든 들어올 수 있다.
// 전부 무조건 트리에 보여주면 바이너리 파일(pptx 등)까지 미리보기가 깨진 채로
// 섞이므로, 사용자가 "어떤 확장자를 보여줄지"를 직접 고르게 한다.
// 목록은 기본 프리셋 + 현재 프로젝트의 .loadstar/OTHER/에 실제로 있는 확장자를
// 합쳐서 보여준다 — 프리셋에 없는 확장자(예: .pptx)도 실제로 파일이 있으면
// 토글로 나타난다.

import { getOtherExtensions, setOtherExtensions, listOtherFileExtensions } from "./fs";
import { logError } from "./log";
import { makeDraggable, makeResizable } from "./dialogChrome";

// 원문 그대로 <pre>에 표시하면 깨지지 않는 안전한 텍스트 계열 — 체크리스트에
// 항상 후보로 보여준다. 실제 적용 여부는 저장된 설정(GetOtherExtensions)이 결정.
const KNOWN_TEXT_EXTENSIONS = [".md", ".txt", ".json", ".csv", ".yaml", ".yml", ".log", ".xml", ".html", ".sql"];

export function openOtherFilterSettings(onChanged?: () => void): void {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="other-filter-box">
            <div class="modal-header">
                <span class="modal-title">OTHER 파일 확장자 설정</span>
                <span class="modal-close">×</span>
            </div>
            <div class="modal-body">
                <div class="modal-section-label">표시할 확장자 (전역 설정 — 모든 프로젝트에 적용)</div>
                <div class="ext-filter-list"></div>
                <div class="ext-filter-add">
                    <input type="text" class="ext-filter-add-input" placeholder="예: pdf 또는 .pdf" />
                    <button class="tb-btn" data-role="add-ext">+ 추가</button>
                </div>
                <div class="modal-footer">
                    <button class="tb-btn" data-role="cancel">취소</button>
                    <button class="tb-btn tb-btn--primary" data-role="save">저장</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const box = overlay.querySelector<HTMLElement>(".other-filter-box")!;
    const header = overlay.querySelector<HTMLElement>(".modal-header")!;
    makeDraggable(box, header);
    makeResizable(box, { minWidth: 380, minHeight: 320 });

    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
    });
    overlay.querySelector(".modal-close")!.addEventListener("click", close);
    overlay.querySelector('[data-role="cancel"]')!.addEventListener("click", close);

    const listEl = overlay.querySelector<HTMLElement>(".ext-filter-list")!;
    const addInput = overlay.querySelector<HTMLInputElement>(".ext-filter-add-input")!;

    // 체크 상태는 로컬에서만 들고 있다가 "저장"을 눌러야 반영한다(취소 시 무시).
    const checkedExts = new Set<string>();
    const knownExts: string[] = [];

    function normalizeExt(raw: string): string {
        const trimmed = raw.trim().toLowerCase();
        if (!trimmed) return "";
        return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
    }

    function renderList(): void {
        const sorted = [...knownExts].sort();
        listEl.innerHTML = sorted
            .map(
                (ext) => `
        <label class="ext-filter-item" data-ext="${ext}">
          <input type="checkbox" ${checkedExts.has(ext) ? "checked" : ""} />
          <span class="ext-filter-code">${ext}</span>
        </label>`,
            )
            .join("");

        listEl.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                const ext = checkbox.closest<HTMLElement>("[data-ext]")!.dataset.ext!;
                if (checkbox.checked) checkedExts.add(ext);
                else checkedExts.delete(ext);
            });
        });
    }

    function addKnownExt(ext: string): void {
        if (!ext || knownExts.includes(ext)) return;
        knownExts.push(ext);
    }

    overlay.querySelector('[data-role="add-ext"]')!.addEventListener("click", () => {
        const ext = normalizeExt(addInput.value);
        if (!ext) return;
        addKnownExt(ext);
        checkedExts.add(ext);
        addInput.value = "";
        renderList();
    });
    addInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") overlay.querySelector<HTMLButtonElement>('[data-role="add-ext"]')!.click();
    });

    overlay.querySelector('[data-role="save"]')!.addEventListener("click", () => {
        void (async () => {
            try {
                await setOtherExtensions([...checkedExts]);
                close();
                onChanged?.();
            } catch (err) {
                logError("확장자 설정 저장 실패", err);
            }
        })();
    });

    void (async () => {
        try {
            const [saved, foundInProject] = await Promise.all([getOtherExtensions(), listOtherFileExtensions()]);
            for (const ext of KNOWN_TEXT_EXTENSIONS) addKnownExt(ext);
            for (const ext of foundInProject) addKnownExt(ext);
            for (const ext of saved) {
                addKnownExt(ext); // 저장된 값이 프리셋/발견 목록에 없어도(과거 설정) 후보에 포함
                checkedExts.add(ext);
            }
            renderList();
        } catch (err) {
            logError("확장자 설정 불러오기 실패", err);
            listEl.innerHTML = `<div class="modal-empty">⚠️ 설정을 불러오지 못했습니다.</div>`;
        }
    })();
}

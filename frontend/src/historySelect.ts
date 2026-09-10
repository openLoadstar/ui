// 뷰어 툴바의 버전 콤보박스 — `[WP][2.0][2026.09.10]파일 이력 뷰어.md`.
//
// 옵션 값은 커밋 해시, 빈 문자열은 "현재(작업 트리)"를 뜻한다.
// 이력 조회 자체는 TabManager가 지연 로드하고, 여기서는 그 결과를 select에
// 채워 넣는 표시 책임만 진다.

import type { main } from "../wailsjs/go/models";

/** "현재(작업 트리)" 옵션의 value — 커밋 해시와 겹치지 않도록 빈 문자열을 쓴다. */
export const WORKING_TREE = "";

function shortDate(iso: string): string {
    // "2026-08-13T15:56:42+09:00" → "2026-08-13". Date로 파싱하면 로컬 타임존
    // 변환이 끼어들어 커밋 날짜가 하루 밀려 보일 수 있어 문자열을 그대로 자른다.
    return iso.slice(0, 10);
}

function shorten(text: string, max: number): string {
    return text.length <= max ? text : text.slice(0, max) + "…";
}

export function commitLabel(c: main.GitCommit): string {
    return `${shortDate(c.date)}  ${c.short}  ${shorten(c.subject, 40)}`;
}

/**
 * select를 이력으로 채운다. history가 없으면(로딩 중/불가) 안내 문구 하나만
 * 넣고 비활성화한다 — git이 없는 환경에서도 툴바 배치가 흔들리지 않게
 * 콤보박스 자리는 그대로 둔다.
 */
export function fillHistorySelect(
    select: HTMLSelectElement,
    history: main.GitHistory | null,
    viewingHash: string | null,
): void {
    if (!history) {
        select.innerHTML = `<option>이력 확인 중…</option>`;
        select.disabled = true;
        select.title = "";
        return;
    }
    if (!history.available) {
        select.innerHTML = `<option>이력 없음</option>`;
        select.disabled = true;
        select.title = history.reason;
        return;
    }

    const currentLabel = history.dirty ? "현재 (저장 안 된 변경 있음)" : "현재";
    const options = [`<option value="">${currentLabel}</option>`];
    for (const c of history.commits) {
        const opt = document.createElement("option");
        opt.value = c.hash;
        opt.textContent = commitLabel(c);
        opt.title = `${c.subject}\n${c.author} · ${c.date}`;
        options.push(opt.outerHTML);
    }
    select.innerHTML = options.join("");
    select.disabled = false;
    select.value = viewingHash ?? WORKING_TREE;
    select.title = `커밋 ${history.commits.length}개`;
}

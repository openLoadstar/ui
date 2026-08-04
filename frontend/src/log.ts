// 통합 로깅 — 항상 콘솔에 남기고, Wails 런타임 안에서는 Go 쪽 로그 파일
// (loadstar-debug.log)에도 전달한다. 패키징된 앱은 콘솔이 안 보이는 경우가
// 많아서, 실패를 확인할 수 있는 유일한 창구가 이 로그 파일이 될 수 있다.

import { LogFrontendError } from "../wailsjs/go/main/App";

function isWailsRuntimeAvailable(): boolean {
    return typeof window !== "undefined" && !!(window as unknown as { go?: unknown }).go;
}

export function logInfo(message: string): void {
    console.log(`[loadstar] ${message}`);
}

export function logError(message: string, err?: unknown): void {
    const detail = err instanceof Error ? err.message : err !== undefined ? String(err) : "";
    const full = detail ? `${message}: ${detail}` : message;
    console.error(`[loadstar] ${full}`);
    if (isWailsRuntimeAvailable()) {
        LogFrontendError(full).catch(() => {
            // 로그 전달 자체가 실패해도 무시 — 이미 콘솔에는 남겼다.
        });
    }
}

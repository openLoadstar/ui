// WP STATUS 필터/색상 매핑. `appendix/WP.md`의 STATUS 코드(S_IDL/S_PRG/S_STB/S_ERR/S_REV/S_OOS) 중
// S_ERR은 별도 버킷을 두지 않고 검토(S_REV)와 동일하게 취급한다(운영상 오류도 결국 검토 대상이므로).

export type StatusBucket = "S_IDL" | "S_PRG" | "S_STB" | "S_REV" | "S_OOS";

export const STATUS_ORDER: StatusBucket[] = ["S_IDL", "S_PRG", "S_STB", "S_REV", "S_OOS"];

export const STATUS_LABELS: Record<StatusBucket, string> = {
    S_IDL: "대기",
    S_PRG: "진행중",
    S_STB: "종료",
    S_REV: "검토",
    S_OOS: "제외",
};

export const STATUS_COLORS: Record<StatusBucket, string> = {
    S_IDL: "var(--status-idl)",
    S_PRG: "var(--accent)",
    S_STB: "var(--status-stb)",
    S_REV: "var(--danger)",
    S_OOS: "var(--status-oos)",
};

const STATUS_LINE = /^##\s*\[STATUS]\s*(\S+)/m;

/** WP raw content에서 STATUS를 읽어 필터/색상용 버킷으로 정규화한다. 헤더가 없거나 알 수 없는 코드면 null. */
export function parseWpStatusBucket(raw: string): StatusBucket | null {
    const m = raw.match(STATUS_LINE);
    if (!m) return null;
    const code = m[1] === "S_ERR" ? "S_REV" : m[1];
    return (STATUS_ORDER as string[]).includes(code) ? (code as StatusBucket) : null;
}

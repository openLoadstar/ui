// GROUP 파일의 CONNECTIONS.ITEMS 필드를 가볍게 파싱/직렬화한다.
//
// appendix/GROUP.md의 실제 관행(WP의 CHILDREN과 동일): 빈 목록은
// "- ITEMS: []", 있으면 "- ITEMS:\n  - 항목1\n  - 항목2" 형태.
// 정식 파서를 대체하지 않는다 — 이 형태를 벗어난 손편집 파일은 빈 목록으로
// 취급하고, 저장 시 항상 이 정규 형태로 다시 쓴다.

const CONNECTIONS_HEADER = /^###\s*CONNECTIONS/;
const ITEMS_HEADER = /^-\s*ITEMS:\s*(\[\])?\s*$/;
const ITEMS_ROW = /^\s{2,}-\s+(.+?)\s*$/;

function findConnectionsRange(lines: string[]): { start: number; end: number } | null {
    const start = lines.findIndex((l) => CONNECTIONS_HEADER.test(l));
    if (start === -1) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (/^###\s/.test(lines[i])) {
            end = i;
            break;
        }
    }
    return { start, end };
}

function findItemsRange(lines: string[], connStart: number, connEnd: number): { headerIdx: number; end: number } | null {
    for (let i = connStart + 1; i < connEnd; i++) {
        if (ITEMS_HEADER.test(lines[i])) {
            let end = i + 1;
            while (end < connEnd && (ITEMS_ROW.test(lines[end]) || lines[end].trim() === "")) {
                end++;
            }
            return { headerIdx: i, end };
        }
    }
    return null;
}

/** GROUP 파일 원문에서 ITEMS 파일명 리스트를 뽑아낸다. */
export function parseGroupItems(raw: string): string[] {
    const lines = raw.split(/\r?\n/);
    const conn = findConnectionsRange(lines);
    if (!conn) return [];
    const items = findItemsRange(lines, conn.start, conn.end);
    if (!items) return [];
    if (ITEMS_HEADER.exec(lines[items.headerIdx])?.[1]) return []; // "- ITEMS: []"
    const result: string[] = [];
    for (let i = items.headerIdx + 1; i < items.end; i++) {
        const m = lines[i].match(ITEMS_ROW);
        if (m) result.push(m[1]);
    }
    return result;
}

function serializeItemsBlock(items: string[]): string {
    if (items.length === 0) return "- ITEMS: []";
    return "- ITEMS:\n" + items.map((i) => `  - ${i}`).join("\n");
}

/** GROUP 파일 원문의 ITEMS 필드를 새 목록으로 교체한 새 원문을 돌려준다. */
export function setGroupItems(raw: string, items: string[]): string {
    const lines = raw.split(/\r?\n/);
    const newBlock = serializeItemsBlock(items);
    const conn = findConnectionsRange(lines);

    if (!conn) {
        const sep = raw.endsWith("\n") ? "" : "\n";
        return `${raw}${sep}\n### CONNECTIONS\n${newBlock}\n`;
    }

    const itemsRange = findItemsRange(lines, conn.start, conn.end);
    if (!itemsRange) {
        lines.splice(conn.start + 1, 0, newBlock);
    } else {
        lines.splice(itemsRange.headerIdx, itemsRange.end - itemsRange.headerIdx, newBlock);
    }
    return lines.join("\n");
}

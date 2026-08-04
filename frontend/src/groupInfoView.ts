// GROUP 탭의 보기 전용 렌더러 — 이름 + ITEMS를 사람이 읽기 좋은 링크 목록으로
// 보여준다. 멤버십 수정은 그룹 편집기가 전담하므로 여기선 정보 표시 + 다른
// 탭으로 내비게이션 + (AI에게 붙여넣기 위한) 텍스트 복사만 담당한다.

import { parseGroupItems, parseSummary } from "./groupFile";
import { parseElementFilename, formatIcon, type ElementFormat } from "./tree";
import { listFormatFiles } from "./fs";
import { logError } from "./log";

export interface GroupMemberLink {
    filename: string;
    name: string;
    format: ElementFormat;
    /** project-relative 경로. 실제 파일이 없으면(깨진 참조) null. */
    path: string | null;
}

async function resolveMembers(items: string[]): Promise<GroupMemberLink[]> {
    const formatsNeeded = [...new Set(items.map((f) => parseElementFilename(f).format))];
    const pathsByFormat = new Map<ElementFormat, Set<string>>();
    await Promise.all(
        formatsNeeded.map(async (format) => {
            pathsByFormat.set(format, new Set(await listFormatFiles(format)));
        }),
    );
    return items.map((filename) => {
        const { format, name } = parseElementFilename(filename);
        const candidate = `.loadstar/${format}/${filename}`;
        const exists = pathsByFormat.get(format)?.has(candidate) ?? false;
        return { filename, name, format, path: exists ? candidate : null };
    });
}

function formatForCopy(groupName: string, groupPath: string, members: GroupMemberLink[]): string {
    const lines = [`GROUP: ${groupName} (${groupPath})`, ""];
    for (const m of members) {
        lines.push(`- ${m.filename}${m.path ? "" : " (파일 없음)"}`);
    }
    return lines.join("\n");
}

export async function renderGroupInfo(
    container: HTMLElement,
    raw: string,
    groupPath: string,
    onOpenMember: (target: { name: string; format: ElementFormat; path: string }) => void,
): Promise<void> {
    const groupName = parseSummary(raw) || "(SUMMARY 없음)";
    const items = parseGroupItems(raw);

    let members: GroupMemberLink[] = [];
    try {
        members = await resolveMembers(items);
    } catch (err) {
        logError("GROUP 멤버 조회 실패", err);
    }

    container.innerHTML = `
        <div class="group-info">
            <div class="group-info-header">
                <span class="group-info-title"></span>
                <button class="tb-btn" data-role="copy-group-info">복사</button>
            </div>
            <ul class="group-info-list"></ul>
        </div>
    `;
    container.querySelector(".group-info-title")!.textContent = groupName;

    const list = container.querySelector<HTMLUListElement>(".group-info-list")!;
    if (members.length === 0) {
        list.innerHTML = `<li class="group-info-empty">이 GROUP에는 아직 멤버가 없습니다.</li>`;
    } else {
        for (const m of members) {
            const li = document.createElement("li");
            li.className = "group-info-item" + (m.path ? "" : " group-info-item--broken");
            li.innerHTML = `<span class="tree-icon">${formatIcon[m.format]}</span><span class="group-info-name"></span>`;
            li.querySelector(".group-info-name")!.textContent = m.path ? m.name : `${m.name} (파일 없음)`;
            if (m.path) {
                const target = { name: m.name, format: m.format, path: m.path };
                li.addEventListener("click", () => onOpenMember(target));
            }
            list.appendChild(li);
        }
    }

    container.querySelector('[data-role="copy-group-info"]')!.addEventListener("click", () => {
        void navigator.clipboard.writeText(formatForCopy(groupName, groupPath, members));
    });
}

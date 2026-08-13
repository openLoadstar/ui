// 캘린더 팝오버 날짜 선택기 — 날짜별 보기(dateTreeView.ts) 시작/종료 필터용.
// 네이티브 <input type="date">의 팝업 캘린더는 다크 테마를 못 따라가서
// (CSS로 내부를 못 건드림) 앱 스타일에 맞춘 커스텀 팝오버로 대체한다.
//
// 모달 대화상자(rename/delete 등)와 달리 이건 "바깥 클릭으로 닫히는" 트리
// 우클릭 메뉴(main.ts:openTreeContextMenu)와 같은 부류(일시적 팝오버)로 취급한다
// — 위험한 확정 액션이 아니라 값 하나 고르는 UI라 실수로 안 닫히게 막을 이유가 없다.

export interface DatePickerOptions {
    /** "YYYY-MM-DD" 또는 빈 문자열(선택 없음 — 이번 달을 기본으로 연다). */
    value: string;
    onSelect: (isoDate: string) => void;
    onClear: () => void;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 내부 선택(날짜 클릭/지우기/오늘)으로 닫힐 때도 이 리스너를 같이 떼어내야 한다 —
// 안 그러면 "바깥 클릭" 리스너가 다음 트리거 클릭까지 살아남아서, 방금 새로 연
// 팝오버를 그 클릭 자체가 "바깥 클릭"으로 오인해 바로 지워버린다.
let outsideClickHandler: (() => void) | null = null;

export function openDatePicker(anchor: HTMLElement, opts: DatePickerOptions): void {
    closeDatePicker();

    const initial = opts.value ? new Date(`${opts.value}T00:00:00`) : new Date();
    let viewYear = initial.getFullYear();
    let viewMonth = initial.getMonth(); // 0-based

    const popover = document.createElement("div");
    popover.className = "date-picker-popover";
    document.body.appendChild(popover);

    const rect = anchor.getBoundingClientRect();
    popover.style.left = `${rect.left}px`;
    popover.style.top = `${rect.bottom + 4}px`;

    function render(): void {
        const firstWeekday = new Date(viewYear, viewMonth, 1).getDay(); // 0=일요일
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const todayIso = formatIso(new Date());

        let cells = "";
        for (let i = 0; i < firstWeekday; i++) {
            cells += `<span class="date-picker-cell date-picker-cell--empty"></span>`;
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const iso = formatIso(new Date(viewYear, viewMonth, day));
            const cls = ["date-picker-cell"];
            if (iso === opts.value) cls.push("date-picker-cell--selected");
            if (iso === todayIso) cls.push("date-picker-cell--today");
            cells += `<button type="button" class="${cls.join(" ")}" data-date="${iso}">${day}</button>`;
        }

        popover.innerHTML = `
            <div class="date-picker-header">
                <button type="button" class="date-picker-nav" data-role="prev">‹</button>
                <span class="date-picker-month">${viewYear}년 ${viewMonth + 1}월</span>
                <button type="button" class="date-picker-nav" data-role="next">›</button>
            </div>
            <div class="date-picker-weekdays">${WEEKDAY_LABELS.map((d) => `<span>${d}</span>`).join("")}</div>
            <div class="date-picker-grid">${cells}</div>
            <div class="date-picker-footer">
                <button type="button" class="tb-btn" data-role="clear">지우기</button>
                <button type="button" class="tb-btn" data-role="today">오늘</button>
            </div>
        `;

        // 팝오버 안의 클릭이 document까지 버블링되면(아래 once 리스너) 렌더 직후 바로
        // 닫혀버린다 — 달 이동/날짜 선택 등 내부 조작은 전부 버블링을 막아야 한다.
        popover.querySelector('[data-role="prev"]')!.addEventListener("click", (e) => {
            e.stopPropagation();
            viewMonth--;
            if (viewMonth < 0) {
                viewMonth = 11;
                viewYear--;
            }
            render();
        });
        popover.querySelector('[data-role="next"]')!.addEventListener("click", (e) => {
            e.stopPropagation();
            viewMonth++;
            if (viewMonth > 11) {
                viewMonth = 0;
                viewYear++;
            }
            render();
        });
        popover.querySelectorAll<HTMLButtonElement>(".date-picker-cell[data-date]").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                opts.onSelect(btn.dataset.date!);
                closeDatePicker();
            });
        });
        popover.querySelector('[data-role="clear"]')!.addEventListener("click", (e) => {
            e.stopPropagation();
            opts.onClear();
            closeDatePicker();
        });
        popover.querySelector('[data-role="today"]')!.addEventListener("click", (e) => {
            e.stopPropagation();
            opts.onSelect(formatIso(new Date()));
            closeDatePicker();
        });
    }

    render();

    // 트리 우클릭 메뉴(main.ts)와 동일한 패턴 — 지금 이 클릭이 document까지
    // 버블링돼서 바로 닫히지 않도록 다음 tick에 바깥 클릭 리스너를 등록한다.
    outsideClickHandler = () => closeDatePicker();
    setTimeout(() => document.addEventListener("click", outsideClickHandler!), 0);
}

function closeDatePicker(): void {
    document.querySelector(".date-picker-popover")?.remove();
    if (outsideClickHandler) {
        document.removeEventListener("click", outsideClickHandler);
        outsideClickHandler = null;
    }
}

function formatIso(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

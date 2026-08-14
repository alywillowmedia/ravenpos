export type SchedulePrintRange = 'week' | 'two_weeks' | 'month';

export interface SchedulePrintShift {
    employeeId: string;
    employeeName: string;
    date: string;
    startTime: string;
    endTime: string;
    timeOffImpact?: 'partial' | 'full';
}

export interface SchedulePrintPeriod {
    start: Date;
    end: Date;
    days: Date[];
    label: string;
    rowCount: number;
}

function addDays(base: Date, days: number) {
    const next = new Date(base);
    next.setDate(next.getDate() + days);
    return next;
}

function startOfWeekMonday(date: Date) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const weekday = next.getDay();
    next.setDate(next.getDate() + (weekday === 0 ? -6 : 1 - weekday));
    return next;
}

export function schedulePrintDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getSchedulePrintPeriod(range: SchedulePrintRange, anchor: Date): SchedulePrintPeriod {
    if (range === 'month') {
        const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
        const leadingBlankCount = (monthStart.getDay() + 6) % 7;
        const calendarStart = addDays(monthStart, -leadingBlankCount);
        const dayCount = Math.ceil((leadingBlankCount + monthEnd.getDate()) / 7) * 7;
        const days = Array.from({ length: dayCount }, (_, index) => addDays(calendarStart, index));

        return {
            start: monthStart,
            end: monthEnd,
            days,
            label: monthStart.toLocaleDateString([], { month: 'long', year: 'numeric' }),
            rowCount: dayCount / 7,
        };
    }

    const start = startOfWeekMonday(anchor);
    const dayCount = range === 'two_weeks' ? 14 : 7;
    const end = addDays(start, dayCount - 1);
    const days = Array.from({ length: dayCount }, (_, index) => addDays(start, index));
    const dateOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

    return {
        start,
        end,
        days,
        label: `${start.toLocaleDateString([], dateOptions)} – ${end.toLocaleDateString([], dateOptions)}`,
        rowCount: range === 'two_weeks' ? 2 : 1,
    };
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatTime(time: string) {
    const [hours = '0', minutes = '0'] = time.split(':');
    const date = new Date(2000, 0, 1, Number.parseInt(hours, 10), Number.parseInt(minutes, 10));
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function buildEmployeeSchedulePrintHtml({
    period,
    range,
    shifts,
}: {
    period: SchedulePrintPeriod;
    range: SchedulePrintRange;
    shifts: SchedulePrintShift[];
}) {
    const shiftsByDate = new Map<string, SchedulePrintShift[]>();
    for (const shift of shifts) {
        const current = shiftsByDate.get(shift.date) || [];
        current.push(shift);
        shiftsByDate.set(shift.date, current);
    }
    for (const dayShifts of shiftsByDate.values()) {
        dayShifts.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.employeeName.localeCompare(b.employeeName));
    }

    const isMonth = range === 'month';
    const totalHours = shifts.reduce((sum, shift) => {
        const [startHour, startMinute] = shift.startTime.split(':').map(Number);
        const [endHour, endMinute] = shift.endTime.split(':').map(Number);
        return sum + Math.max(0, endHour * 60 + endMinute - startHour * 60 - startMinute) / 60;
    }, 0);
    const teamCount = new Set(shifts.map((shift) => shift.employeeId)).size;

    const cells = period.days.map((day) => {
        const dateKey = schedulePrintDateKey(day);
        const outsideMonth = isMonth && (day < period.start || day > period.end);
        const dayShifts = outsideMonth ? [] : (shiftsByDate.get(dateKey) || []);
        const shiftMarkup = outsideMonth
            ? ''
            : dayShifts.length === 0
                ? '<div class="empty">No shifts</div>'
            : dayShifts.map((shift) => `
                <div class="shift${shift.timeOffImpact ? ` time-off ${shift.timeOffImpact}` : ''}">
                    <span class="name">${escapeHtml(shift.employeeName)}</span>
                    <span class="time">${escapeHtml(formatTime(shift.startTime))}–${escapeHtml(formatTime(shift.endTime))}</span>
                    ${shift.timeOffImpact ? `<span class="off-label">${shift.timeOffImpact === 'full' ? 'APPROVED TIME OFF' : 'PARTIAL TIME OFF'}</span>` : ''}
                </div>`).join('');

        return `
            <section class="day${outsideMonth ? ' outside' : ''}">
                <div class="day-heading">
                    <strong>${escapeHtml(day.toLocaleDateString([], { weekday: 'short' }))}</strong>
                    <span>${escapeHtml(day.toLocaleDateString([], { month: 'short', day: 'numeric' }))}</span>
                </div>
                <div class="shifts">${shiftMarkup}</div>
            </section>`;
    }).join('');

    return `<!doctype html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Employee Schedule — ${escapeHtml(period.label)}</title>
    <style>
        @page { size: letter landscape; margin: 0.28in; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; color: #171717; font-family: Inter, Arial, sans-serif; }
        body { width: 10.44in; height: 7.94in; overflow: hidden; }
        header { height: .62in; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 8px; }
        h1 { margin: 0; font-size: 21px; line-height: 1.1; }
        .range { margin-top: 4px; font-size: 11px; color: #555; }
        .summary { text-align: right; font-size: 9px; line-height: 1.45; color: #444; }
        .weekdays { height: .24in; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); align-items: end; }
        .weekdays div { padding: 0 5px 3px; font-size: 8px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #555; }
        .calendar { height: 7.08in; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: repeat(${period.rowCount}, minmax(0, 1fr)); border-top: 1px solid #777; border-left: 1px solid #777; }
        .day { min-width: 0; min-height: 0; overflow: hidden; border-right: 1px solid #777; border-bottom: 1px solid #777; padding: ${isMonth ? '3px' : '6px'}; }
        .day.outside { background: #f3f3f3; color: #999; }
        .day-heading { display: flex; justify-content: space-between; gap: 4px; padding-bottom: ${isMonth ? '2px' : '5px'}; border-bottom: 1px solid #ddd; font-size: ${isMonth ? '7px' : '10px'}; }
        .shifts { display: flex; flex-direction: column; gap: ${isMonth ? '1px' : '4px'}; padding-top: ${isMonth ? '2px' : '5px'}; }
        .shift { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px; align-items: baseline; font-size: ${isMonth ? '6.5px' : range === 'two_weeks' ? '8px' : '10px'}; line-height: 1.16; }
        .name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 700; }
        .time { white-space: nowrap; color: #444; }
        .time-off.full .name, .time-off.full .time { text-decoration: line-through; color: #777; }
        .time-off.partial .name, .time-off.partial .time { color: #7c2d12; }
        .off-label { grid-column: 1 / -1; color: #9f1239; font-size: 5.5px; font-weight: 800; letter-spacing: .05em; }
        .empty { padding-top: 3px; color: #aaa; font-size: ${isMonth ? '6px' : '9px'}; font-style: italic; }
        @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style>
</head>
<body>
    <header>
        <div><h1>Employee Schedule</h1><div class="range">${escapeHtml(period.label)}</div></div>
        <div class="summary">${shifts.length} shifts<br>${totalHours.toFixed(1)} scheduled hours<br>${teamCount} team members</div>
    </header>
    <div class="weekdays">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => `<div>${day}</div>`).join('')}</div>
    <main class="calendar">${cells}</main>
</body>
</html>`;
}

export function openEmployeeSchedulePrintWindow(html: string, targetWindow?: Window | null) {
    const printWindow = targetWindow || window.open('', '_blank', 'width=1100,height=850');
    if (!printWindow) return false;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
    };
    return true;
}

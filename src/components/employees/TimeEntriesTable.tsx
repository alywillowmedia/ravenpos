// Time Entries Table - Shows employee time clock history
// Includes edit button for admin time management

import { useState, useEffect } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
    formatTime,
    formatShortDate,
    formatDecimalHours,
    getSundaySaturdayWeekDateRange,
    getLastTwoFullWeeksDateRange,
} from '../../lib/timeCalculations';
import type { TimeEntry } from '../../types/employee';

interface TimeEntriesTableProps {
    entries: TimeEntry[];
    isLoading?: boolean;
    onDateRangeChange?: (start: Date, end: Date) => void;
    onEditEntry?: (entry: TimeEntry) => void;
}

type DateFilter = 'this_week' | 'last_week' | 'this_month' | 'last_2_full_weeks' | 'custom' | 'all';

function toLocalDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDateInput(value: string, endOfDay = false): Date {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    if (endOfDay) {
        parsed.setHours(23, 59, 59, 999);
    } else {
        parsed.setHours(0, 0, 0, 0);
    }
    return parsed;
}

export function TimeEntriesTable({ entries, isLoading, onDateRangeChange, onEditEntry }: TimeEntriesTableProps) {
    const [filter, setFilter] = useState<DateFilter>('this_week');
    const [customStart, setCustomStart] = useState(() => toLocalDateInput(new Date()));
    const [customEnd, setCustomEnd] = useState(() => toLocalDateInput(new Date()));

    useEffect(() => {
        if (!onDateRangeChange) return;

        const now = new Date();
        let start: Date;
        let end: Date;

        switch (filter) {
            case 'this_week': {
                const range = getSundaySaturdayWeekDateRange(now);
                start = range.start;
                end = range.end;
                break;
            }
            case 'last_week': {
                const thisWeek = getSundaySaturdayWeekDateRange(now);
                const lastWeekDate = new Date(thisWeek.start);
                lastWeekDate.setDate(lastWeekDate.getDate() - 1);
                const range = getSundaySaturdayWeekDateRange(lastWeekDate);
                start = range.start;
                end = range.end;
                break;
            }
            case 'this_month': {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;
            }
            case 'last_2_full_weeks': {
                const range = getLastTwoFullWeeksDateRange(now);
                start = range.start;
                end = range.end;
                break;
            }
            case 'custom': {
                if (!customStart || !customEnd) return;
                start = parseLocalDateInput(customStart);
                end = parseLocalDateInput(customEnd, true);
                if (start > end) return;
                break;
            }
            case 'all':
            default:
                start = new Date(2020, 0, 1);
                end = new Date(2099, 11, 31);
                break;
        }

        onDateRangeChange(start, end);
    }, [filter, onDateRangeChange, customStart, customEnd]);

    const totalHours = entries.reduce((sum, e) => sum + (e.total_hours || 0), 0);

    return (
        <div>
            {/* Filter Buttons */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2 flex-wrap">
                    {(['this_week', 'last_week', 'this_month', 'last_2_full_weeks', 'custom', 'all'] as DateFilter[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)]'
                                }`}
                        >
                            {f === 'this_week' && 'This Week'}
                            {f === 'last_week' && 'Last Week'}
                            {f === 'this_month' && 'This Month'}
                            {f === 'last_2_full_weeks' && 'Last 2 Full Weeks'}
                            {f === 'custom' && 'Custom Range'}
                            {f === 'all' && 'All Time'}
                        </button>
                    ))}
                </div>
                <div className="text-sm">
                    Total: <span className="font-bold text-[var(--color-primary)]">{formatDecimalHours(totalHours)}</span>
                </div>
            </div>

            {filter === 'custom' && (
                <div className="mb-4 flex items-end gap-3 flex-wrap">
                    <label className="text-sm">
                        <span className="block text-[var(--color-muted)] mb-1">From</span>
                        <input
                            type="date"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white"
                            max={customEnd || undefined}
                        />
                    </label>
                    <label className="text-sm">
                        <span className="block text-[var(--color-muted)] mb-1">To</span>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white"
                            min={customStart || undefined}
                        />
                    </label>
                </div>
            )}

            {/* Table */}
            <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                <table className="w-full">
                    <thead className="bg-[var(--color-surface)]">
                        <tr>
                            <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Date</th>
                            <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Clock In</th>
                            <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Clock Out</th>
                            <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Hours</th>
                            <th className="text-center px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Lunch</th>
                            <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Notes</th>
                            {onEditEntry && (
                                <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Actions</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={onEditEntry ? 7 : 6} className="px-4 py-8 text-center text-[var(--color-muted)]">
                                    Loading...
                                </td>
                            </tr>
                        ) : entries.length === 0 ? (
                            <tr>
                                <td colSpan={onEditEntry ? 7 : 6} className="px-4 py-8 text-center text-[var(--color-muted)]">
                                    No time entries found
                                </td>
                            </tr>
                        ) : (
                            entries.map((entry) => (
                                <tr key={entry.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]">
                                    <td className="px-4 py-3 text-sm">
                                        {formatShortDate(entry.clock_in)}
                                        {entry.edited_at && (
                                            <span title="Edited by admin" className="ml-1 text-xs text-[var(--color-warning)]">✏️</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm font-mono">
                                        {formatTime(entry.clock_in)}
                                    </td>
                                    <td className="px-4 py-3 text-sm font-mono">
                                        {entry.clock_out ? (
                                            formatTime(entry.clock_out)
                                        ) : (
                                            <Badge variant="success">Active</Badge>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm font-medium text-right">
                                        {entry.total_hours ? formatDecimalHours(entry.total_hours) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-center text-[var(--color-muted)]">
                                        {entry.lunch_break_minutes ? `${entry.lunch_break_minutes}m` : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-[var(--color-muted)]">
                                        {entry.notes || '-'}
                                    </td>
                                    {onEditEntry && (
                                        <td className="px-4 py-3 text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => onEditEntry(entry)}
                                            >
                                                Edit
                                            </Button>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Time Entries Table - Shows employee time clock history

import { useState, useEffect } from 'react';
import { Badge } from '../ui/Badge';
import { formatTime, formatShortDate, formatDuration, getWeekDateRange } from '../../lib/timeCalculations';
import type { TimeEntry } from '../../types/employee';

interface TimeEntriesTableProps {
    entries: TimeEntry[];
    isLoading?: boolean;
    onDateRangeChange?: (start: Date, end: Date) => void;
}

type DateFilter = 'this_week' | 'last_week' | 'this_month' | 'all';

export function TimeEntriesTable({ entries, isLoading, onDateRangeChange }: TimeEntriesTableProps) {
    const [filter, setFilter] = useState<DateFilter>('this_week');

    useEffect(() => {
        if (!onDateRangeChange) return;

        const now = new Date();
        let start: Date;
        let end: Date;

        switch (filter) {
            case 'this_week': {
                const range = getWeekDateRange(now);
                start = range.start;
                end = range.end;
                break;
            }
            case 'last_week': {
                const lastWeek = new Date(now);
                lastWeek.setDate(lastWeek.getDate() - 7);
                const range = getWeekDateRange(lastWeek);
                start = range.start;
                end = range.end;
                break;
            }
            case 'this_month': {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;
            }
            case 'all':
            default:
                start = new Date(2020, 0, 1);
                end = new Date(2099, 11, 31);
                break;
        }

        onDateRangeChange(start, end);
    }, [filter, onDateRangeChange]);

    const totalHours = entries.reduce((sum, e) => sum + (e.total_hours || 0), 0);

    return (
        <div>
            {/* Filter Buttons */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2">
                    {(['this_week', 'last_week', 'this_month', 'all'] as DateFilter[]).map((f) => (
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
                            {f === 'all' && 'All Time'}
                        </button>
                    ))}
                </div>
                <div className="text-sm">
                    Total: <span className="font-bold text-[var(--color-primary)]">{formatDuration(totalHours)}</span>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                <table className="w-full">
                    <thead className="bg-[var(--color-surface)]">
                        <tr>
                            <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Date</th>
                            <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Clock In</th>
                            <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Clock Out</th>
                            <th className="text-right px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Hours</th>
                            <th className="text-left px-4 py-3 text-sm font-medium text-[var(--color-muted)]">Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted)]">
                                    Loading...
                                </td>
                            </tr>
                        ) : entries.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted)]">
                                    No time entries found
                                </td>
                            </tr>
                        ) : (
                            entries.map((entry) => (
                                <tr key={entry.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]">
                                    <td className="px-4 py-3 text-sm">
                                        {formatShortDate(entry.clock_in)}
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
                                        {entry.total_hours ? formatDuration(entry.total_hours) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-[var(--color-muted)]">
                                        {entry.notes || '-'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

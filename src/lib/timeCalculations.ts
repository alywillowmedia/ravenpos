// Time calculation utilities for employee time tracking

/**
 * Calculate hours between two dates as a decimal
 */
export function calculateHours(clockIn: Date, clockOut: Date): number {
    const diffMs = clockOut.getTime() - clockIn.getTime();
    const hours = diffMs / (1000 * 60 * 60);
    return Math.round(hours * 100) / 100; // Round to 2 decimal places
}

/**
 * Format hours as "Xh Ym" string
 */
export function formatDuration(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
}

/**
 * Format duration from start time to now
 */
export function formatDurationFromStart(startTime: string | Date): string {
    const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
    const now = new Date();
    const hours = calculateHours(start, now);
    return formatDuration(hours);
}

/**
 * Get Monday-Sunday date range for a given date's week
 */
export function getWeekDateRange(date: Date = new Date()): { start: Date; end: Date } {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday

    const start = new Date(d.setDate(diff));
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
}

/**
 * Get start of today
 */
export function getStartOfDay(date: Date = new Date()): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Get end of today
 */
export function getEndOfDay(date: Date = new Date()): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

/**
 * Format time as "9:15 AM"
 */
export function formatTime(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

/**
 * Format date as "Jan 15, 2026"
 */
export function formatDate(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

/**
 * Format date as "1/15/26"
 */
export function formatShortDate(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit'
    });
}

interface TimeEntry {
    total_hours: number | null;
}

/**
 * Sum total hours from time entries
 */
export function getTotalHoursForPeriod(entries: TimeEntry[]): number {
    return entries.reduce((sum, entry) => sum + (entry.total_hours || 0), 0);
}

/**
 * Check if a date is today
 */
export function isToday(date: string | Date): boolean {
    const d = typeof date === 'string' ? new Date(date) : date;
    const today = new Date();
    return d.toDateString() === today.toDateString();
}

/**
 * Get relative time string like "2 hours ago"
 */
export function getRelativeTime(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

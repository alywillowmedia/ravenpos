import { useState, useMemo, useEffect, type MouseEvent, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Input } from './Input';

export interface Column<T> {
    key: string;
    header: string;
    width?: string;
    minWidth?: string;
    sortable?: boolean;
    render?: (item: T, meta?: { visibleIndex: number; visibleKeys: string[] }) => ReactNode;
}

export interface TableProps<T> {
    data: T[];
    columns: Column<T>[];
    keyExtractor: (item: T) => string;
    searchable?: boolean;
    searchPlaceholder?: string;
    searchKeys?: string[];
    onRowClick?: (
        item: T,
        event: MouseEvent<HTMLTableRowElement>,
        meta: { visibleIndex: number; visibleKeys: string[] }
    ) => void;
    emptyMessage?: string;
    className?: string;
    isLoading?: boolean;
    paginated?: boolean;
    defaultPageSize?: number;
    pageSizeOptions?: number[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Table<T extends Record<string, any>>({
    data,
    columns,
    keyExtractor,
    searchable = false,
    searchPlaceholder = 'Search...',
    searchKeys = [],
    onRowClick,
    emptyMessage = 'No data found',
    className,
    isLoading = false,
    paginated = false,
    defaultPageSize = 50,
    pageSizeOptions = [25, 50, 100],
}: TableProps<T>) {
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(defaultPageSize);

    // Filter data based on search
    const filteredData = useMemo(() => {
        if (!search || searchKeys.length === 0) return data;

        const query = search.toLowerCase();
        return data.filter((item) =>
            searchKeys.some((key) => {
                const value = getNestedValue(item, key);
                return String(value).toLowerCase().includes(query);
            })
        );
    }, [data, search, searchKeys]);

    // Sort data
    const sortedData = useMemo(() => {
        if (!sortKey) return filteredData;

        return [...filteredData].sort((a, b) => {
            const aVal = getNestedValue(a, sortKey);
            const bVal = getNestedValue(b, sortKey);

            if (aVal === bVal) return 0;
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;

            const comparison = aVal < bVal ? -1 : 1;
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [filteredData, sortKey, sortDirection]);

    const totalRows = sortedData.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

    useEffect(() => {
        setCurrentPage(1);
    }, [search, sortKey, sortDirection, data.length, pageSize]);

    useEffect(() => {
        setPageSize(defaultPageSize);
    }, [defaultPageSize]);

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);

    const pagedData = useMemo(() => {
        if (!paginated) return sortedData;
        const pageStart = (currentPage - 1) * pageSize;
        return sortedData.slice(pageStart, pageStart + pageSize);
    }, [currentPage, pageSize, paginated, sortedData]);

    const pageStartIndex = paginated ? (currentPage - 1) * pageSize : 0;

    const visibleKeys = useMemo(
        () => pagedData.map((item) => keyExtractor(item)),
        [keyExtractor, pagedData]
    );

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    if (isLoading) {
        return (
            <div className={cn('rounded-xl border border-[var(--color-border)] overflow-hidden', className)}>
                {searchable && (
                    <div className="p-4 border-b border-[var(--color-border)]">
                        <div className="h-10 bg-[var(--color-surface)] rounded-lg animate-pulse" />
                    </div>
                )}
                <div className="p-8 text-center">
                    <div className="inline-block w-6 h-6 border-2 border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <div className={cn('rounded-xl border border-[var(--color-border)] overflow-hidden', className)}>
            {searchable && (
                <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                    <Input
                        type="search"
                        placeholder={searchPlaceholder}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        inputSize="sm"
                        leftIcon={<SearchIcon />}
                    />
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    style={{ width: col.width, minWidth: col.minWidth }}
                                    className={cn(
                                        'px-4 py-3 text-left text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider',
                                        col.sortable && 'cursor-pointer hover:text-[var(--color-foreground)] select-none'
                                    )}
                                    onClick={() => col.sortable && handleSort(col.key)}
                                >
                                    <div className="flex items-center gap-1">
                                        {col.header}
                                        {col.sortable && sortKey === col.key && (
                                            <span className="text-[var(--color-primary)]">
                                                {sortDirection === 'asc' ? '↑' : '↓'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                        {pagedData.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-4 py-12 text-center text-[var(--color-muted)]"
                                >
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            pagedData.map((item, visibleIndex) => {
                                return (
                                <tr
                                    key={keyExtractor(item)}
                                    onClick={(event) =>
                                        onRowClick?.(item, event, { visibleIndex: pageStartIndex + visibleIndex, visibleKeys })
                                    }
                                    className={cn(
                                        'bg-white',
                                        onRowClick && 'cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors'
                                    )}
                                >
                                    {columns.map((col) => (
                                        <td
                                            key={col.key}
                                            style={{ width: col.width, minWidth: col.minWidth }}
                                            className="px-4 py-3 text-sm text-[var(--color-foreground)]"
                                        >
                                            {col.render
                                                ? col.render(item, { visibleIndex, visibleKeys })
                                                : String(getNestedValue(item, col.key) ?? '')}
                                        </td>
                                    ))}
                                </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            {paginated && totalRows > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                    <div className="text-xs text-[var(--color-muted)]">
                        Showing {pageStartIndex + 1}-{Math.min(pageStartIndex + pageSize, totalRows)} of {totalRows}
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-[var(--color-muted)] flex items-center gap-2">
                            Rows
                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="px-2 py-1 rounded border border-[var(--color-border)] bg-white text-xs"
                            >
                                {pageSizeOptions.map((size) => (
                                    <option key={size} value={size}>
                                        {size}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 text-xs rounded border border-[var(--color-border)] bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Previous
                            </button>
                            <span className="text-xs text-[var(--color-muted)]">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 text-xs rounded border border-[var(--color-border)] bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper to access nested object properties
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNestedValue(obj: Record<string, any>, path: string): unknown {
    return path.split('.').reduce((acc: unknown, part) => {
        if (acc && typeof acc === 'object' && part in acc) {
            return (acc as Record<string, unknown>)[part];
        }
        return undefined;
    }, obj);
}

function SearchIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M7.333 12.667A5.333 5.333 0 1 0 7.333 2a5.333 5.333 0 0 0 0 10.667ZM14 14l-2.9-2.9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

import { Button } from '../ui/Button';

interface BulkEditToolbarProps {
    selectedCount: number;
    totalCount: number;
    hasChanges: boolean;
    isEditing: boolean;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onEditSelected: () => void;
    onSaveChanges: () => void;
    onCancel: () => void;
    isSaving?: boolean;
}

export function BulkEditToolbar({
    selectedCount,
    totalCount,
    hasChanges,
    isEditing,
    onSelectAll,
    onDeselectAll,
    onEditSelected,
    onSaveChanges,
    onCancel,
    isSaving = false,
}: BulkEditToolbarProps) {
    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slideUp">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl px-6 py-4 flex items-center gap-4">
                {/* Selection info */}
                <div className="flex items-center gap-2 pr-4 border-r border-[var(--color-border)]">
                    <CheckboxIcon />
                    <span className="text-sm font-medium text-[var(--color-foreground)]">
                        {selectedCount} of {totalCount} selected
                    </span>
                </div>

                {/* Selection controls */}
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onSelectAll}
                        disabled={selectedCount === totalCount}
                    >
                        Select All
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onDeselectAll}
                        disabled={selectedCount === 0}
                    >
                        Deselect All
                    </Button>
                </div>

                {/* Divider */}
                <div className="w-px h-6 bg-[var(--color-border)]" />

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                    {!isEditing ? (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={onEditSelected}
                            disabled={selectedCount === 0}
                        >
                            <EditIcon />
                            Edit Selected ({selectedCount})
                        </Button>
                    ) : (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={onSaveChanges}
                            disabled={!hasChanges}
                            isLoading={isSaving}
                        >
                            <SaveIcon />
                            Save Changes
                        </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={onCancel}>
                        {hasChanges ? 'Discard' : 'Cancel'}
                    </Button>
                </div>

                {/* Pending changes indicator */}
                {hasChanges && (
                    <div className="flex items-center gap-2 pl-4 border-l border-[var(--color-border)]">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-xs text-amber-600 font-medium">
                            Unsaved changes
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

function CheckboxIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[var(--color-primary)]"
        >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    );
}

function EditIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
    );
}

function SaveIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
        </svg>
    );
}

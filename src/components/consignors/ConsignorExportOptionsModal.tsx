import { Button } from '../ui/Button';
import { Modal, ModalFooter } from '../ui/Modal';

export interface ConsignorExportOption<Key extends string> {
    key: Key;
    label: string;
}

export interface ConsignorExportOptionGroup<Key extends string> {
    title: string;
    options: ConsignorExportOption<Key>[];
}

interface ConsignorExportOptionsModalProps<Key extends string> {
    isOpen: boolean;
    title: string;
    description: string;
    groups: ConsignorExportOptionGroup<Key>[];
    selectedOptions: Key[];
    isExporting: boolean;
    onToggle: (key: Key) => void;
    onSelectAll: () => void;
    onClear: () => void;
    onClose: () => void;
    onExport: () => void;
}

export function ConsignorExportOptionsModal<Key extends string>({
    isOpen,
    title,
    description,
    groups,
    selectedOptions,
    isExporting,
    onToggle,
    onSelectAll,
    onClear,
    onClose,
    onExport,
}: ConsignorExportOptionsModalProps<Key>) {
    const selectedSet = new Set<string>(selectedOptions);
    const selectedCount = selectedOptions.length;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            description={description}
            size="2xl"
            showCloseButton
        >
            <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-[var(--color-muted)]">
                        {selectedCount} field{selectedCount === 1 ? '' : 's'} selected
                    </p>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={onSelectAll}>
                            Select all
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                            Clear
                        </Button>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    {groups.map((group) => (
                        <div key={group.title} className="rounded-lg border border-[var(--color-border)] p-3">
                            <h3 className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">
                                {group.title}
                            </h3>
                            <div className="space-y-2">
                                {group.options.map((option) => (
                                    <label
                                        key={option.key}
                                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-surface-hover)]"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedSet.has(option.key)}
                                            onChange={() => onToggle(option.key)}
                                            className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                                        />
                                        <span>{option.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <ModalFooter>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isExporting}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={onExport}
                        isLoading={isExporting}
                        disabled={selectedCount === 0}
                    >
                        Export CSV
                    </Button>
                </ModalFooter>
            </div>
        </Modal>
    );
}


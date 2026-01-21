import { useState, useCallback, useMemo } from 'react';
import type { ItemInput } from '../types';

export interface StagedChange {
    field: keyof ItemInput;
    originalValue: unknown;
    newValue: unknown;
}

export interface BulkEditState {
    isActive: boolean;
    selectedIds: Set<string>;
    stagedChanges: Map<string, Map<string, StagedChange>>;
}

export interface UseBulkEditReturn {
    // State
    isActive: boolean;
    selectedIds: Set<string>;
    selectedCount: number;
    hasChanges: boolean;

    // Mode controls
    toggleBulkEditMode: () => void;
    exitBulkEditMode: (force?: boolean) => boolean;

    // Selection controls
    selectItem: (id: string) => void;
    deselectItem: (id: string) => void;
    toggleSelection: (id: string) => void;
    selectAll: (ids: string[]) => void;
    deselectAll: () => void;
    isSelected: (id: string) => boolean;

    // Change management
    stageChange: (itemId: string, field: keyof ItemInput, newValue: unknown, originalValue: unknown) => void;
    getStagedChanges: (itemId: string) => Map<string, StagedChange> | undefined;
    getAllStagedChanges: () => Map<string, Map<string, StagedChange>>;
    getChangeSummary: () => Array<{
        itemId: string;
        changes: Array<{ field: string; from: unknown; to: unknown }>;
    }>;
    hasItemChanges: (itemId: string) => boolean;
    clearChanges: () => void;
    discardItemChanges: (itemId: string) => void;

    // Prepare updates for commit
    prepareUpdates: () => Array<{ id: string; changes: Partial<ItemInput> }>;
}

export function useBulkEdit(): UseBulkEditReturn {
    const [state, setState] = useState<BulkEditState>({
        isActive: false,
        selectedIds: new Set(),
        stagedChanges: new Map(),
    });

    // Derived state
    const selectedCount = state.selectedIds.size;
    const hasChanges = state.stagedChanges.size > 0;

    // Mode controls
    const toggleBulkEditMode = useCallback(() => {
        setState((prev) => ({
            ...prev,
            isActive: !prev.isActive,
            // Clear selection when exiting
            selectedIds: prev.isActive ? new Set() : prev.selectedIds,
            stagedChanges: prev.isActive ? new Map() : prev.stagedChanges,
        }));
    }, []);

    const exitBulkEditMode = useCallback((force = false): boolean => {
        if (!force && state.stagedChanges.size > 0) {
            // Return false to indicate there are unsaved changes
            return false;
        }
        setState({
            isActive: false,
            selectedIds: new Set(),
            stagedChanges: new Map(),
        });
        return true;
    }, [state.stagedChanges.size]);

    // Selection controls
    const selectItem = useCallback((id: string) => {
        setState((prev) => {
            const newSelected = new Set(prev.selectedIds);
            newSelected.add(id);
            return { ...prev, selectedIds: newSelected };
        });
    }, []);

    const deselectItem = useCallback((id: string) => {
        setState((prev) => {
            const newSelected = new Set(prev.selectedIds);
            newSelected.delete(id);
            // Also clear staged changes for this item
            const newChanges = new Map(prev.stagedChanges);
            newChanges.delete(id);
            return { ...prev, selectedIds: newSelected, stagedChanges: newChanges };
        });
    }, []);

    const toggleSelection = useCallback((id: string) => {
        setState((prev) => {
            const newSelected = new Set(prev.selectedIds);
            if (newSelected.has(id)) {
                newSelected.delete(id);
                // Also clear staged changes for this item
                const newChanges = new Map(prev.stagedChanges);
                newChanges.delete(id);
                return { ...prev, selectedIds: newSelected, stagedChanges: newChanges };
            } else {
                newSelected.add(id);
                return { ...prev, selectedIds: newSelected };
            }
        });
    }, []);

    const selectAll = useCallback((ids: string[]) => {
        setState((prev) => ({
            ...prev,
            selectedIds: new Set(ids),
        }));
    }, []);

    const deselectAll = useCallback(() => {
        setState((prev) => ({
            ...prev,
            selectedIds: new Set(),
            stagedChanges: new Map(),
        }));
    }, []);

    const isSelected = useCallback((id: string): boolean => {
        return state.selectedIds.has(id);
    }, [state.selectedIds]);

    // Change management
    const stageChange = useCallback((
        itemId: string,
        field: keyof ItemInput,
        newValue: unknown,
        originalValue: unknown
    ) => {
        setState((prev) => {
            const newChanges = new Map(prev.stagedChanges);
            const itemChanges = new Map(newChanges.get(itemId) || new Map());

            // If new value equals original, remove the change
            if (newValue === originalValue) {
                itemChanges.delete(field);
                if (itemChanges.size === 0) {
                    newChanges.delete(itemId);
                } else {
                    newChanges.set(itemId, itemChanges);
                }
            } else {
                itemChanges.set(field, { field, originalValue, newValue });
                newChanges.set(itemId, itemChanges);
            }

            return { ...prev, stagedChanges: newChanges };
        });
    }, []);

    const getStagedChanges = useCallback((itemId: string) => {
        return state.stagedChanges.get(itemId);
    }, [state.stagedChanges]);

    const getAllStagedChanges = useCallback(() => {
        return state.stagedChanges;
    }, [state.stagedChanges]);

    const getChangeSummary = useCallback(() => {
        const summary: Array<{
            itemId: string;
            changes: Array<{ field: string; from: unknown; to: unknown }>;
        }> = [];

        state.stagedChanges.forEach((itemChanges, itemId) => {
            const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
            itemChanges.forEach((change, field) => {
                changes.push({
                    field,
                    from: change.originalValue,
                    to: change.newValue,
                });
            });
            if (changes.length > 0) {
                summary.push({ itemId, changes });
            }
        });

        return summary;
    }, [state.stagedChanges]);

    const hasItemChanges = useCallback((itemId: string): boolean => {
        const changes = state.stagedChanges.get(itemId);
        return !!changes && changes.size > 0;
    }, [state.stagedChanges]);

    const clearChanges = useCallback(() => {
        setState((prev) => ({
            ...prev,
            stagedChanges: new Map(),
        }));
    }, []);

    const discardItemChanges = useCallback((itemId: string) => {
        setState((prev) => {
            const newChanges = new Map(prev.stagedChanges);
            newChanges.delete(itemId);
            return { ...prev, stagedChanges: newChanges };
        });
    }, []);

    // Prepare updates for database commit
    const prepareUpdates = useCallback(() => {
        const updates: Array<{ id: string; changes: Partial<ItemInput> }> = [];

        state.stagedChanges.forEach((itemChanges, itemId) => {
            const changes: Partial<ItemInput> = {};
            itemChanges.forEach((change) => {
                (changes as Record<string, unknown>)[change.field] = change.newValue;
            });
            if (Object.keys(changes).length > 0) {
                updates.push({ id: itemId, changes });
            }
        });

        return updates;
    }, [state.stagedChanges]);

    return useMemo(() => ({
        // State
        isActive: state.isActive,
        selectedIds: state.selectedIds,
        selectedCount,
        hasChanges,

        // Mode controls
        toggleBulkEditMode,
        exitBulkEditMode,

        // Selection controls
        selectItem,
        deselectItem,
        toggleSelection,
        selectAll,
        deselectAll,
        isSelected,

        // Change management
        stageChange,
        getStagedChanges,
        getAllStagedChanges,
        getChangeSummary,
        hasItemChanges,
        clearChanges,
        discardItemChanges,

        // Prepare updates
        prepareUpdates,
    }), [
        state.isActive,
        state.selectedIds,
        selectedCount,
        hasChanges,
        toggleBulkEditMode,
        exitBulkEditMode,
        selectItem,
        deselectItem,
        toggleSelection,
        selectAll,
        deselectAll,
        isSelected,
        stageChange,
        getStagedChanges,
        getAllStagedChanges,
        getChangeSummary,
        hasItemChanges,
        clearChanges,
        discardItemChanges,
        prepareUpdates,
    ]);
}

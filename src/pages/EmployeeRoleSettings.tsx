import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useEmployeeRoles } from '../hooks/useEmployeeRoles';
import { supabase } from '../lib/supabase';

type Notice = {
    type: 'success' | 'error';
    message: string;
} | null;

type RoleEditState = {
    name: string;
    isActive: boolean;
    sortOrder: string;
};

export function EmployeeRoleSettings() {
    const { roles, isLoading, error, fetchRoles } = useEmployeeRoles();
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleSortOrder, setNewRoleSortOrder] = useState('100');
    const [isAdding, setIsAdding] = useState(false);
    const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice>(null);
    const [editState, setEditState] = useState<Record<string, RoleEditState>>({});

    const roleNamesLower = useMemo(
        () => new Set(roles.map((role) => role.name.trim().toLowerCase())),
        [roles]
    );

    useEffect(() => {
        const next: Record<string, RoleEditState> = {};
        roles.forEach((role) => {
            next[role.id] = {
                name: role.name,
                isActive: role.is_active,
                sortOrder: String(role.sort_order),
            };
        });
        setEditState(next);
    }, [roles]);

    const handleAddRole = async (event: FormEvent) => {
        event.preventDefault();
        setNotice(null);

        const name = newRoleName.trim();
        const parsedSortOrder = Number.parseInt(newRoleSortOrder.trim(), 10);

        if (!name) {
            setNotice({ type: 'error', message: 'Role name is required.' });
            return;
        }

        if (roleNamesLower.has(name.toLowerCase())) {
            setNotice({ type: 'error', message: 'That role already exists.' });
            return;
        }

        if (!Number.isFinite(parsedSortOrder)) {
            setNotice({ type: 'error', message: 'Sort order must be a whole number.' });
            return;
        }

        try {
            setIsAdding(true);
            const { error: insertError } = await supabase.from('employee_roles').insert({
                name,
                is_active: true,
                sort_order: parsedSortOrder,
            });

            if (insertError) throw insertError;

            setNewRoleName('');
            setNewRoleSortOrder('100');
            setNotice({ type: 'success', message: `Added role "${name}".` });
            await fetchRoles();
        } catch (err) {
            setNotice({
                type: 'error',
                message: err instanceof Error ? err.message : 'Failed to add role.',
            });
        } finally {
            setIsAdding(false);
        }
    };

    const handleSaveRole = async (roleId: string) => {
        setNotice(null);
        const current = editState[roleId];
        if (!current) return;

        const name = current.name.trim();
        const parsedSortOrder = Number.parseInt(current.sortOrder.trim(), 10);

        if (!name) {
            setNotice({ type: 'error', message: 'Role name is required.' });
            return;
        }

        if (!Number.isFinite(parsedSortOrder)) {
            setNotice({ type: 'error', message: 'Sort order must be a whole number.' });
            return;
        }

        const hasDuplicate = roles.some(
            (role) => role.id !== roleId && role.name.trim().toLowerCase() === name.toLowerCase()
        );
        if (hasDuplicate) {
            setNotice({ type: 'error', message: 'Another role already uses that name.' });
            return;
        }

        try {
            setSavingRoleId(roleId);
            const { error: updateError } = await supabase
                .from('employee_roles')
                .update({
                    name,
                    is_active: current.isActive,
                    sort_order: parsedSortOrder,
                })
                .eq('id', roleId);

            if (updateError) throw updateError;

            setNotice({ type: 'success', message: 'Role updated.' });
            await fetchRoles();
        } catch (err) {
            setNotice({
                type: 'error',
                message: err instanceof Error ? err.message : 'Failed to update role.',
            });
        } finally {
            setSavingRoleId(null);
        }
    };

    return (
        <div className="animate-fadeIn">
            <Header
                title="Employee Role Settings"
                description="Add and manage employee types used in employee records."
            />

            {notice && (
                <div
                    className={`mb-4 rounded-lg p-3 ${notice.type === 'error'
                        ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                        : 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                        }`}
                >
                    {notice.message}
                </div>
            )}

            {error && (
                <div className="mb-4 rounded-lg bg-[var(--color-danger-bg)] p-3 text-[var(--color-danger)]">
                    {error}
                </div>
            )}

            <div className="space-y-6">
                <Card variant="outlined">
                    <CardContent>
                        <h2 className="mb-4 text-lg font-semibold text-[var(--color-foreground)]">
                            Add Role
                        </h2>
                        <form
                            className="grid gap-3 sm:grid-cols-[1fr_160px_auto]"
                            onSubmit={handleAddRole}
                        >
                            <Input
                                label="Role Name"
                                placeholder="e.g. Merchandising"
                                value={newRoleName}
                                onChange={(e) => setNewRoleName(e.target.value)}
                                required
                            />
                            <Input
                                label="Sort Order"
                                inputMode="numeric"
                                placeholder="100"
                                value={newRoleSortOrder}
                                onChange={(e) => setNewRoleSortOrder(e.target.value)}
                                required
                            />
                            <div className="flex items-end">
                                <Button type="submit" className="w-full sm:w-auto" isLoading={isAdding}>
                                    Add Role
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                <Card variant="outlined" padding="none">
                    <div className="border-b border-[var(--color-border)] px-5 py-4">
                        <h2 className="text-lg font-semibold text-[var(--color-foreground)]">
                            Existing Roles
                        </h2>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <LoadingSpinner size={28} />
                        </div>
                    ) : roles.length === 0 ? (
                        <div className="px-5 py-8 text-sm text-[var(--color-muted)]">
                            No employee roles found.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                                            Role Name
                                        </th>
                                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                                            Sort Order
                                        </th>
                                        <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                                            Active
                                        </th>
                                        <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                                            Action
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {roles.map((role) => (
                                        <tr
                                            key={role.id}
                                            className="border-b border-[var(--color-border)] last:border-b-0"
                                        >
                                            <td className="px-5 py-3">
                                                <Input
                                                    inputSize="sm"
                                                    value={editState[role.id]?.name ?? role.name}
                                                    onChange={(e) =>
                                                        setEditState((prev) => ({
                                                            ...prev,
                                                            [role.id]: {
                                                                ...(prev[role.id] ?? {
                                                                    name: role.name,
                                                                    isActive: role.is_active,
                                                                    sortOrder: String(role.sort_order),
                                                                }),
                                                                name: e.target.value,
                                                            },
                                                        }))
                                                    }
                                                    aria-label={`${role.name} name`}
                                                />
                                            </td>
                                            <td className="px-5 py-3">
                                                <Input
                                                    inputSize="sm"
                                                    inputMode="numeric"
                                                    value={editState[role.id]?.sortOrder ?? String(role.sort_order)}
                                                    onChange={(e) =>
                                                        setEditState((prev) => ({
                                                            ...prev,
                                                            [role.id]: {
                                                                ...(prev[role.id] ?? {
                                                                    name: role.name,
                                                                    isActive: role.is_active,
                                                                    sortOrder: String(role.sort_order),
                                                                }),
                                                                sortOrder: e.target.value,
                                                            },
                                                        }))
                                                    }
                                                    aria-label={`${role.name} sort order`}
                                                />
                                            </td>
                                            <td className="px-5 py-3">
                                                <label className="inline-flex items-center gap-2 text-sm text-[var(--color-foreground)]">
                                                    <input
                                                        type="checkbox"
                                                        checked={editState[role.id]?.isActive ?? role.is_active}
                                                        onChange={(e) =>
                                                            setEditState((prev) => ({
                                                                ...prev,
                                                                [role.id]: {
                                                                    ...(prev[role.id] ?? {
                                                                        name: role.name,
                                                                        isActive: role.is_active,
                                                                        sortOrder: String(role.sort_order),
                                                                    }),
                                                                    isActive: e.target.checked,
                                                                },
                                                            }))
                                                        }
                                                    />
                                                    Active
                                                </label>
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSaveRole(role.id)}
                                                    isLoading={savingRoleId === role.id}
                                                >
                                                    Save
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}

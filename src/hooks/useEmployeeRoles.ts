import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { EmployeeRole } from '../types/employee';

export function useEmployeeRoles() {
    const [roles, setRoles] = useState<EmployeeRole[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRoles = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const { data, error: fetchError } = await supabase
                .from('employee_roles')
                .select('*')
                .order('sort_order', { ascending: true })
                .order('name', { ascending: true });

            if (fetchError) throw fetchError;
            setRoles((data ?? []) as EmployeeRole[]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load employee roles.');
            setRoles([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchRoles();
    }, [fetchRoles]);

    return {
        roles,
        isLoading,
        error,
        fetchRoles,
    };
}

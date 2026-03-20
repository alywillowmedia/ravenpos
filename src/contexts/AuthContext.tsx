import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'vendor' | 'employee';
export type PortalChoice = 'admin' | 'vendor' | 'employee';

export interface UserRecord {
    id: string;
    email: string;
    full_name: string | null;
    role: UserRole;
    consignor_id: string | null;
    employee_id: string | null;
    linked_employee_id?: string | null;
    created_at: string;
}

interface AuthContextValue {
    user: User | null;
    session: Session | null;
    userRecord: UserRecord | null;
    isLoading: boolean;
    isAdmin: boolean;
    isVendor: boolean;
    isEmployee: boolean;
    canAccessEmployeePortal: boolean;
    portalChoices: PortalChoice[];
    activePortal: PortalChoice | null;
    setActivePortal: (portal: PortalChoice | null) => void;
    resolveHomePath: () => string;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
    refreshUserRecord: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ACTIVE_PORTAL_STORAGE_KEY = 'ravenpos.active-portal';

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [userRecord, setUserRecord] = useState<UserRecord | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activePortal, setActivePortalState] = useState<PortalChoice | null>(null);

    // Track if we're currently fetching to prevent duplicate requests
    const fetchingRef = useRef(false);
    const lastUserIdRef = useRef<string | null>(null);
    const currentUserIdRef = useRef<string | null>(null);

    const isAnonymousUser = useCallback((authUser: User | null | undefined) => {
        if (!authUser) return false;
        if (authUser.is_anonymous) return true;
        return authUser.app_metadata?.provider === 'anonymous';
    }, []);

    // Fetch user record - doesn't block, just updates state when ready
    const fetchUserRecord = useCallback(async (userId: string) => {
        // Ignore stale fetch requests for a user that is no longer active
        if (currentUserIdRef.current !== userId) {
            return;
        }

        // Skip if already fetching for this user
        if (fetchingRef.current && lastUserIdRef.current === userId) {
            return;
        }

        fetchingRef.current = true;
        lastUserIdRef.current = userId;

        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (error) {
                console.error('Error fetching user record:', error);
                if (currentUserIdRef.current === userId) {
                    setUserRecord(null);
                }
            } else {
                if (currentUserIdRef.current === userId) {
                    setUserRecord(data as UserRecord);
                }
            }
        } catch (err) {
            console.error('Exception fetching user record:', err);
            if (currentUserIdRef.current === userId) {
                setUserRecord(null);
            }
        } finally {
            fetchingRef.current = false;
        }
    }, []);

    // Initialize auth state
    useEffect(() => {
        let mounted = true;

        // Get initial session - DON'T await user record, let it load async
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!mounted) return;

            currentUserIdRef.current = session?.user?.id ?? null;
            setSession(session);
            setUser(session?.user ?? null);
            setIsLoading(false); // Set loading false IMMEDIATELY

            // Fetch user record in background (non-blocking)
            if (session?.user && !isAnonymousUser(session.user)) {
                fetchUserRecord(session.user.id);
            } else {
                setUserRecord(null);
            }
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                if (!mounted) return;

                currentUserIdRef.current = session?.user?.id ?? null;
                setSession(session);
                setUser(session?.user ?? null);

                if (session?.user && !isAnonymousUser(session.user)) {
                    // Fetch user record in background (non-blocking)
                    fetchUserRecord(session.user.id);
                } else {
                    setUserRecord(null);
                    lastUserIdRef.current = null;
                    fetchingRef.current = false;
                }
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [fetchUserRecord, isAnonymousUser]);

    const getPortalChoices = useCallback((record: UserRecord | null): PortalChoice[] => {
        if (!record) return [];

        const choices: PortalChoice[] = [];
        if (record.role === 'admin') choices.push('admin');
        if (record.role === 'vendor') choices.push('vendor');
        if (record.role === 'employee') choices.push('employee');

        if (record.role !== 'employee' && record.linked_employee_id) {
            choices.push('employee');
        }

        return choices;
    }, []);

    const setActivePortal = useCallback((portal: PortalChoice | null) => {
        setActivePortalState(portal);
        if (!portal) {
            window.sessionStorage.removeItem(ACTIVE_PORTAL_STORAGE_KEY);
            return;
        }
        window.sessionStorage.setItem(ACTIVE_PORTAL_STORAGE_KEY, portal);
    }, []);

    useEffect(() => {
        const choices = getPortalChoices(userRecord);

        if (choices.length === 0) {
            setActivePortalState(null);
            window.sessionStorage.removeItem(ACTIVE_PORTAL_STORAGE_KEY);
            return;
        }

        const saved = window.sessionStorage.getItem(ACTIVE_PORTAL_STORAGE_KEY) as PortalChoice | null;
        if (saved && choices.includes(saved)) {
            setActivePortalState(saved);
            return;
        }

        if (choices.length === 1) {
            setActivePortalState(choices[0]);
            window.sessionStorage.setItem(ACTIVE_PORTAL_STORAGE_KEY, choices[0]);
            return;
        }

        setActivePortalState(null);
    }, [getPortalChoices, userRecord]);

    const resolveHomePath = useCallback(() => {
        const choices = getPortalChoices(userRecord);
        if (choices.length === 0) return '/login';
        if (choices.length > 1 && !activePortal) return '/portal-select';

        const portal = activePortal && choices.includes(activePortal) ? activePortal : choices[0];
        if (portal === 'admin') return '/admin';
        if (portal === 'vendor') return '/vendor';
        return '/employee-portal';
    }, [activePortal, getPortalChoices, userRecord]);

    const signIn = async (email: string, password: string) => {
        setActivePortal(null);
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return { error: error.message };
        }

        return { error: null };
    };

    const signOut = async () => {
        // Try global sign-out first so other tabs/windows can't immediately rehydrate this session.
        const { error: globalError } = await supabase.auth.signOut();
        if (globalError) {
            console.error('Global sign-out error, falling back to local sign-out:', globalError);
            const { error: localError } = await supabase.auth.signOut({ scope: 'local' });
            if (localError) {
                console.error('Local sign-out error:', localError);
            }
        }

        // Hard-clear any persisted Supabase auth tokens to prevent immediate session rehydration.
        const clearSupabaseAuthStorage = (storage: Storage) => {
            for (let i = storage.length - 1; i >= 0; i -= 1) {
                const key = storage.key(i);
                if (!key) continue;
                if (key.startsWith('sb-') && key.includes('-auth-token')) {
                    storage.removeItem(key);
                }
            }
        };
        clearSupabaseAuthStorage(window.localStorage);
        clearSupabaseAuthStorage(window.sessionStorage);

        currentUserIdRef.current = null;
        setUser(null);
        setSession(null);
        setUserRecord(null);
        setActivePortal(null);
        lastUserIdRef.current = null;
        fetchingRef.current = false;

        // Force full page reload to login with router-compatible URL.
        const isElectron = typeof window !== 'undefined' && (
            window.electronAPI?.isElectron === true || window.location.protocol === 'file:'
        );
        const loginPath = isElectron
            ? `${window.location.pathname}#/login`
            : '/login';
        window.location.replace(loginPath);
    };

    // Expose a way to manually refresh user record if needed
    const refreshUserRecord = useCallback(async () => {
        if (user?.id) {
            await fetchUserRecord(user.id);
        }
    }, [user?.id, fetchUserRecord]);

    const portalChoices = getPortalChoices(userRecord);
    const canAccessEmployeePortal = portalChoices.includes('employee');

    const value: AuthContextValue = {
        user,
        session,
        userRecord,
        isLoading,
        isAdmin: userRecord?.role === 'admin',
        isVendor: userRecord?.role === 'vendor',
        isEmployee: userRecord?.role === 'employee',
        canAccessEmployeePortal,
        portalChoices,
        activePortal,
        setActivePortal,
        resolveHomePath,
        signIn,
        signOut,
        refreshUserRecord,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

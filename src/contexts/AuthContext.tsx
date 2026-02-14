import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'vendor';

export interface UserRecord {
    id: string;
    email: string;
    full_name: string | null;
    role: UserRole;
    consignor_id: string | null;
    created_at: string;
}

interface AuthContextValue {
    user: User | null;
    session: Session | null;
    userRecord: UserRecord | null;
    isLoading: boolean;
    isAdmin: boolean;
    isVendor: boolean;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
    refreshUserRecord: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [userRecord, setUserRecord] = useState<UserRecord | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Track if we're currently fetching to prevent duplicate requests
    const fetchingRef = useRef(false);
    const lastUserIdRef = useRef<string | null>(null);
    const currentUserIdRef = useRef<string | null>(null);

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
                .single();

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
            if (session?.user) {
                fetchUserRecord(session.user.id);
            }
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                if (!mounted) return;

                currentUserIdRef.current = session?.user?.id ?? null;
                setSession(session);
                setUser(session?.user ?? null);

                if (session?.user) {
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
    }, [fetchUserRecord]);

    const signIn = async (email: string, password: string) => {
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
        // Full sign out clears local session and invalidates refresh token
        await supabase.auth.signOut();
        currentUserIdRef.current = null;
        setUser(null);
        setSession(null);
        setUserRecord(null);
        lastUserIdRef.current = null;
        fetchingRef.current = false;

        // Force full page reload to /login to ensure complete state reset
        window.location.replace('/login');
    };

    // Expose a way to manually refresh user record if needed
    const refreshUserRecord = useCallback(async () => {
        if (user?.id) {
            await fetchUserRecord(user.id);
        }
    }, [user?.id, fetchUserRecord]);

    const value: AuthContextValue = {
        user,
        session,
        userRecord,
        isLoading,
        isAdmin: userRecord?.role === 'admin',
        isVendor: userRecord?.role === 'vendor',
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

import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'vendor';

export interface UserRecord {
    id: string;
    email: string;
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

    // Fetch user record - doesn't block, just updates state when ready
    const fetchUserRecord = useCallback(async (userId: string) => {
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
                setUserRecord(null);
            } else {
                setUserRecord(data as UserRecord);
            }
        } catch (err) {
            console.error('Exception fetching user record:', err);
            setUserRecord(null);
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

                setSession(session);
                setUser(session?.user ?? null);

                if (session?.user) {
                    // Fetch user record in background (non-blocking)
                    fetchUserRecord(session.user.id);
                } else {
                    setUserRecord(null);
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
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setUserRecord(null);
        lastUserIdRef.current = null;
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

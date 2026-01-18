import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
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

    // Fetch user record from users table
    const fetchUserRecord = async (userId: string) => {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error fetching user record:', error);
            return null;
        }

        return data as UserRecord;
    };

    // Initialize auth state
    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);

            if (session?.user) {
                const record = await fetchUserRecord(session.user.id);
                setUserRecord(record);
            }

            setIsLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                setSession(session);
                setUser(session?.user ?? null);

                if (session?.user) {
                    const record = await fetchUserRecord(session.user.id);
                    setUserRecord(record);
                } else {
                    setUserRecord(null);
                }

                setIsLoading(false);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

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
    };

    const value: AuthContextValue = {
        user,
        session,
        userRecord,
        isLoading,
        isAdmin: userRecord?.role === 'admin',
        isVendor: userRecord?.role === 'vendor',
        signIn,
        signOut,
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

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const hasInvalidAnonKey =
    !supabaseAnonKey ||
    supabaseAnonKey === 'your_anon_key_here' ||
    supabaseAnonKey === 'undefined' ||
    supabaseAnonKey === 'null';

if (!supabaseUrl || hasInvalidAnonKey) {
    throw new Error(
        'Missing Supabase environment variables. Please create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
    );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
        headers: {
            apikey: supabaseAnonKey,
        },
    },
});

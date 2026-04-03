declare module 'https://esm.sh/@supabase/supabase-js@2' {
    export * from '@supabase/supabase-js'
}

declare const Deno: {
    env: {
        get(key: string): string | undefined
    }
    serve(
        handler: (request: Request) => Response | Promise<Response>
    ): void
}

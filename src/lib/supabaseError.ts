type ErrorWithDetails = {
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    code?: unknown;
};

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function formatSupabaseError(error: unknown, fallback: string): string {
    let message: string | null = null;
    let details: string | null = null;
    let hint: string | null = null;
    let code: string | null = null;

    if (error instanceof Error) {
        message = asString(error.message);
    } else if (typeof error === 'string') {
        message = asString(error);
    } else if (error && typeof error === 'object') {
        const err = error as ErrorWithDetails;
        message = asString(err.message);
        details = asString(err.details);
        hint = asString(err.hint);
        code = asString(err.code);
    }

    const friendly = toFriendlyDatabaseMessage({ code, message, details, hint });
    if (friendly) return friendly;

    if (message && details) return `${message} (${details})`;
    if (message && hint) return `${message} (Hint: ${hint})`;
    if (message) return message;
    if (details) return details;

    return fallback;
}

type FriendlyMessageInput = {
    code: string | null;
    message: string | null;
    details: string | null;
    hint: string | null;
};

function toFriendlyDatabaseMessage({ code, message, details, hint }: FriendlyMessageInput): string | null {
    const combined = `${message || ''} ${details || ''} ${hint || ''}`.toLowerCase();

    if (
        code === '23505' ||
        combined.includes('duplicate key value') ||
        combined.includes('unique constraint') ||
        combined.includes('already exists')
    ) {
        if (combined.includes('sku')) {
            return 'This SKU already exists. Please use a different SKU.';
        }
        return 'That value already exists. Please use a different one.';
    }

    if (
        code === '22001' ||
        combined.includes('value too long') ||
        combined.includes('too long for type character varying') ||
        combined.includes('character varying')
    ) {
        return 'That entry is too long. Please shorten it and try again.';
    }

    if (
        code === '23502' ||
        combined.includes('violates not-null constraint') ||
        combined.includes('null value in column')
    ) {
        return 'Please fill out all required fields.';
    }

    if (code === '22P02' || combined.includes('invalid input syntax')) {
        return 'One of the values is in the wrong format. Please check and try again.';
    }

    if (code === '42501' || combined.includes('permission denied')) {
        return 'You do not have permission to do that.';
    }

    return null;
}

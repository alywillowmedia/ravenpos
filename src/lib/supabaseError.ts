type ErrorWithDetails = {
    message?: unknown;
    details?: unknown;
    hint?: unknown;
};

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function formatSupabaseError(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return asString(error.message) ?? fallback;
    }

    if (typeof error === 'string') {
        return asString(error) ?? fallback;
    }

    if (error && typeof error === 'object') {
        const err = error as ErrorWithDetails;
        const message = asString(err.message);
        const details = asString(err.details);
        const hint = asString(err.hint);

        if (message && details) return `${message} (${details})`;
        if (message && hint) return `${message} (Hint: ${hint})`;
        if (message) return message;
        if (details) return details;
    }

    return fallback;
}

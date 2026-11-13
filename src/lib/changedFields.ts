/**
 * The fields of `current` whose value differs from `initial`.
 *
 * A form that edits one part of a record should save only what the person changed, so a
 * save from a stale screen cannot put back a value someone else changed in the meantime.
 */
export function changedFields<T extends Record<string, unknown>>(initial: T, current: T): Partial<T> {
    const changed: Partial<T> = {};
    for (const key of Object.keys(current) as Array<keyof T>) {
        if (!Object.is(initial[key], current[key])) changed[key] = current[key];
    }
    return changed;
}

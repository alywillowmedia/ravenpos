export function LegacyNote({
    items,
    payouts,
    onDownload,
}: {
    items: number;
    payouts: number;
    onDownload: () => void;
}) {
    if (items <= 0) return null;
    return (
        <p className="text-xs text-[var(--color-muted)]">
            {items} sold items sit under {payouts} older payouts that can&apos;t be matched to exact sales. They count as paid, so nothing is owed on them.{' '}
            <button
                type="button"
                onClick={onDownload}
                className="underline underline-offset-2 hover:text-[var(--color-foreground)]"
            >
                Download the list (CSV)
            </button>
        </p>
    );
}

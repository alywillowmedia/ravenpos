import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';

interface ImportResult {
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
    consignor_created: boolean;
    store_name?: string;
    consignor_name?: string;
}

interface SyncResult {
    success: boolean;
    updated: number;
    unchanged: number;
    total: number;
    details: Array<{
        sku: string;
        name: string;
        old_quantity: number;
        new_quantity: number;
    }>;
    errors: string[];
}

export function ShopifySync() {
    const [importing, setImporting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [showSyncConfirm, setShowSyncConfirm] = useState(false);
    const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null);
    const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleImportProducts() {
        setImporting(true);
        setError(null);
        setLastImportResult(null);

        try {
            const { data, error: invokeError } = await supabase.functions.invoke('import-shopify-products');

            if (invokeError) {
                throw invokeError;
            }

            if (!data.success) {
                throw new Error(data.error || 'Import failed');
            }

            setLastImportResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to import products');
        } finally {
            setImporting(false);
        }
    }

    async function handleForceSyncQuantities() {
        setSyncing(true);
        setError(null);
        setLastSyncResult(null);

        try {
            const { data, error: invokeError } = await supabase.functions.invoke('force-sync-from-shopify');

            if (invokeError) {
                throw invokeError;
            }

            if (!data.success) {
                throw new Error(data.error || 'Sync failed');
            }

            setLastSyncResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to sync quantities');
        } finally {
            setSyncing(false);
            setShowSyncConfirm(false);
        }
    }

    return (
        <div className="space-y-6">
            {/* Error Display */}
            {error && (
                <div className="p-4 bg-[var(--color-danger-bg)] border border-[var(--color-danger)] rounded-lg">
                    <p className="text-[var(--color-danger)] font-medium">Error</p>
                    <p className="text-sm text-[var(--color-danger)]">{error}</p>
                </div>
            )}

            {/* Import Products Section */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-[var(--color-foreground)] flex items-center gap-2">
                                <ShopifyIcon />
                                Import Products from Shopify
                            </h3>
                            <p className="mt-1 text-sm text-[var(--color-muted)]">
                                Fetches all products from your Shopify store and creates corresponding items in RavenPOS.
                                Existing items (matched by Shopify variant ID) will be skipped.
                            </p>
                        </div>
                        <Button
                            onClick={handleImportProducts}
                            disabled={importing}
                            variant="primary"
                        >
                            {importing ? (
                                <>
                                    <LoadingSpinner />
                                    Importing...
                                </>
                            ) : (
                                <>
                                    <DownloadIcon />
                                    Import Products
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Import Result */}
                    {lastImportResult && (
                        <div className="mt-4 p-4 bg-[var(--color-success-bg)] border border-[var(--color-success)] rounded-lg">
                            <p className="font-medium text-[var(--color-success)]">
                                ✓ Import Complete
                            </p>
                            <ul className="mt-2 text-sm text-[var(--color-foreground)] space-y-1">
                                <li>• <strong>{lastImportResult.imported}</strong> new products imported</li>
                                <li>• <strong>{lastImportResult.skipped}</strong> existing products skipped</li>
                                {lastImportResult.consignor_created && lastImportResult.consignor_name && (
                                    <li>• New consignor "{lastImportResult.consignor_name}" created</li>
                                )}
                                {lastImportResult.store_name && (
                                    <li>• Synced from {lastImportResult.store_name}.myshopify.com</li>
                                )}
                            </ul>
                            {lastImportResult.errors.length > 0 && (
                                <div className="mt-2 text-sm text-[var(--color-warning)]">
                                    <p className="font-medium">Warnings:</p>
                                    <ul className="list-disc list-inside">
                                        {lastImportResult.errors.slice(0, 5).map((err, i) => (
                                            <li key={i}>{err}</li>
                                        ))}
                                        {lastImportResult.errors.length > 5 && (
                                            <li>...and {lastImportResult.errors.length - 5} more</li>
                                        )}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Force Sync Section */}
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-[var(--color-foreground)] flex items-center gap-2">
                                <SyncIcon />
                                Force Sync Quantities
                            </h3>
                            <p className="mt-1 text-sm text-[var(--color-muted)]">
                                Updates all RavenPOS inventory quantities to match current Shopify levels.
                                <strong className="text-[var(--color-warning)]"> This will overwrite any local quantity changes.</strong>
                            </p>
                        </div>
                        <Button
                            onClick={() => setShowSyncConfirm(true)}
                            disabled={syncing}
                            variant="secondary"
                            className="border-[var(--color-warning)] text-[var(--color-warning)] hover:bg-[var(--color-warning-bg)]"
                        >
                            {syncing ? (
                                <>
                                    <LoadingSpinner />
                                    Syncing...
                                </>
                            ) : (
                                <>
                                    <SyncIcon />
                                    Force Sync
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Sync Result */}
                    {lastSyncResult && (
                        <div className="mt-4 p-4 bg-[var(--color-success-bg)] border border-[var(--color-success)] rounded-lg">
                            <p className="font-medium text-[var(--color-success)]">
                                ✓ Sync Complete
                            </p>
                            <ul className="mt-2 text-sm text-[var(--color-foreground)] space-y-1">
                                <li>• <strong>{lastSyncResult.updated}</strong> items updated</li>
                                <li>• <strong>{lastSyncResult.unchanged}</strong> items unchanged</li>
                                <li>• <strong>{lastSyncResult.total}</strong> total synced items</li>
                            </ul>
                            {lastSyncResult.details.length > 0 && (
                                <div className="mt-3">
                                    <p className="text-sm font-medium text-[var(--color-foreground)]">Changes:</p>
                                    <div className="mt-1 max-h-40 overflow-y-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-[var(--color-muted)]">
                                                    <th className="py-1">SKU</th>
                                                    <th className="py-1">Name</th>
                                                    <th className="py-1 text-right">Old</th>
                                                    <th className="py-1 text-right">New</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {lastSyncResult.details.slice(0, 10).map((detail, i) => (
                                                    <tr key={i} className="border-t border-[var(--color-border)]">
                                                        <td className="py-1 font-mono text-xs">{detail.sku}</td>
                                                        <td className="py-1 truncate max-w-[200px]">{detail.name}</td>
                                                        <td className="py-1 text-right">{detail.old_quantity}</td>
                                                        <td className="py-1 text-right font-medium">{detail.new_quantity}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {lastSyncResult.details.length > 10 && (
                                            <p className="mt-2 text-xs text-[var(--color-muted)]">
                                                ...and {lastSyncResult.details.length - 10} more changes
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Confirmation Modal */}
            {showSyncConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
                        <h2 className="text-xl font-bold text-[var(--color-foreground)] flex items-center gap-2">
                            <WarningIcon />
                            Force Sync from Shopify
                        </h2>
                        <p className="mt-3 text-[var(--color-muted)]">
                            This will update ALL RavenPOS inventory quantities to match
                            Shopify's current inventory levels. Any local quantity changes
                            will be overwritten.
                        </p>
                        <p className="mt-2 font-medium text-[var(--color-warning)]">
                            This cannot be undone.
                        </p>
                        <div className="mt-6 flex gap-3 justify-end">
                            <Button
                                variant="secondary"
                                onClick={() => setShowSyncConfirm(false)}
                                disabled={syncing}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleForceSyncQuantities}
                                disabled={syncing}
                                className="bg-[var(--color-warning)] hover:bg-[var(--color-warning-hover)]"
                            >
                                {syncing ? (
                                    <>
                                        <LoadingSpinner />
                                        Syncing...
                                    </>
                                ) : (
                                    'Yes, Sync Now'
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Icons
function ShopifyIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.337 3.415c-.073-.019-.146-.019-.22-.055-.073-.036-.146-.11-.183-.183-.036-.073-.055-.146-.055-.22 0-.183.091-.366.238-.476.146-.11.329-.165.512-.146l.549.037c.22.019.402.183.439.403l.585 4.063c.037.22-.091.439-.293.512l-1.024.329c-.183.055-.402.019-.549-.11-.146-.128-.22-.329-.183-.53l.184-3.624zM20.8 6.158l-3.587-.585-.695 3.258c-.037.183-.183.329-.366.366l-2.709.549c-.183.037-.366-.037-.476-.183-.11-.147-.128-.347-.055-.512l1.17-2.965-2.342-.366c-.183-.037-.329-.165-.402-.329l-.805-2.086c-.073-.183-.055-.402.073-.549.128-.146.329-.22.512-.183l8.13 1.244c.439.073.768.439.768.878v.914c0 .329-.183.622-.476.732l.26-.183zm-7.008 4.485l.622 3.899c.037.183-.036.366-.183.476-.146.11-.347.128-.512.055l-2.489-1.06-3.771 3.112c-.146.11-.347.128-.512.055-.165-.073-.274-.22-.293-.402l-.622-5.179 5.618-1.134c.183-.037.366.037.476.165.11.128.146.311.11.476l-.183.915 1.739.622zM4.55 10.717l-.512 4.266c-.037.183.036.366.183.476.146.11.347.128.512.055l2.159-.915 1.793 1.427c.146.11.347.128.512.055.165-.073.274-.22.293-.402l.512-4.266-5.452-.696z" />
        </svg>
    );
}

function DownloadIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
        </svg>
    );
}

function SyncIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
        </svg>
    );
}

function WarningIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
        </svg>
    );
}

function LoadingSpinner() {
    return (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    );
}

import { ArrowLeft, FileText, ReceiptText } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PayoutEquation, ReadinessBadge, TransactionLedger } from '../../components/payouts/PayoutLedgerUI';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Money } from '../../components/ui/Money';
import { Tabs } from '../../components/ui/Tabs';
import { useToast } from '../../contexts/ToastContext';
import {
    getVendorPayoutPreview,
    getVendorPayoutWorkspace,
    preparePayoutRun,
    updateVendorThreshold,
} from '../../hooks/usePayouts';
import { hasUnpaidBalance } from '../../lib/payoutLedger';
import {
    countAfterCutoff,
    draftPath,
    formatDay,
    formatPayoutDate,
    parseThrough,
    payoutsBackPath,
    statusLine,
    validateMinimum,
} from '../../lib/payoutRun';
import { formatCurrency } from '../../lib/utils';
import type { PayoutRunRow, VendorPayoutWorkspaceData } from '../../types/payouts';

type VendorTab = 'items' | 'deductions' | 'invoices' | 'history';

interface Loaded {
    key: string;
    workspace: VendorPayoutWorkspaceData;
    preview: PayoutRunRow;
}

function backTab(value: string | null): string {
    return value === 'drafts' || value === 'history' ? value : 'queue';
}

function useVendorPage(consignorId: string, through: string) {
    const [stored, setStored] = useState<Loaded | null>(null);
    const [error, setError] = useState<string | null>(null);
    const latestRequest = useRef(0);
    const key = `${consignorId}|${through}`;

    const refetch = useCallback(async (): Promise<Loaded | null> => {
        // A slow reply for an older request must never overwrite a newer one.
        const request = ++latestRequest.current;
        setError(null);
        try {
            const [workspace, preview] = await Promise.all([
                getVendorPayoutWorkspace(consignorId),
                getVendorPayoutPreview(consignorId, through),
            ]);
            if (request !== latestRequest.current) return null;
            setStored({ key, workspace, preview });
            return { key, workspace, preview };
        } catch (err) {
            if (request === latestRequest.current) {
                setError(err instanceof Error ? err.message : 'Failed to load the vendor payout page.');
            }
            return null;
        }
    }, [consignorId, key, through]);

    useEffect(() => {
        void refetch();
    }, [refetch]);

    // Figures for another vendor or date are never shown under this one.
    const loaded = stored?.key === key ? stored : null;
    return { loaded, error, refetch };
}

export function VendorPayoutWorkspace() {
    const { consignorId = '' } = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const toast = useToast();
    const today = useMemo(() => new Date(), []);
    const through = parseThrough(params.get('through'), today);
    const fromTab = backTab(params.get('tab'));
    const backPath = payoutsBackPath(through, fromTab, today);

    const { loaded, error, refetch } = useVendorPage(consignorId, through);
    const [view, setView] = useState<VendorTab>('items');
    const [isPreparing, setIsPreparing] = useState(false);
    const [minimumOpen, setMinimumOpen] = useState(false);
    const preparing = useRef(false);

    const unpaidItems = useMemo(
        () => (loaded ? loaded.workspace.sale_items.filter(hasUnpaidBalance) : []),
        [loaded],
    );

    const prepare = async () => {
        if (preparing.current) return;
        preparing.current = true;
        setIsPreparing(true);
        try {
            const [result] = await preparePayoutRun(through, [consignorId]);
            if (result?.status === 'created' && result.payout_id) {
                navigate(draftPath(result.payout_id, through));
            } else if (result?.status === 'failed') {
                toast.error('Could not prepare this payout', result.message ?? undefined);
            } else if (result?.status === 'skipped') {
                const next = await refetch();
                if (next?.preview.draft_id) navigate(draftPath(next.preview.draft_id, through));
                else toast.info('Nothing to prepare', result.message ?? undefined);
            } else {
                toast.info('Nothing to prepare', result?.message ?? undefined);
            }
        } catch (err) {
            toast.error('Could not prepare this payout', err instanceof Error ? err.message : undefined);
        } finally {
            preparing.current = false;
            setIsPreparing(false);
        }
    };

    const backLink = (
        <Link to={backPath} className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)]">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Vendor payouts
        </Link>
    );

    if (error) {
        return (
            <div>
                {backLink}
                <Card className="flex flex-col items-center gap-3 py-10 text-center">
                    <p role="alert" className="font-medium text-[var(--color-foreground)]">This vendor&apos;s payout page could not be loaded.</p>
                    <p className="text-sm text-[var(--color-muted)]">{error}</p>
                    <Button type="button" variant="secondary" onClick={() => void refetch()}>Retry</Button>
                </Card>
            </div>
        );
    }

    if (!loaded) {
        return (
            <div>
                {backLink}
                <div className="flex min-h-72 items-center justify-center"><LoadingSpinner size={30} /></div>
            </div>
        );
    }

    const { workspace, preview } = loaded;
    const { vendor } = workspace;
    const hasDraft = preview.status === 'draft' && Boolean(preview.draft_id);
    const deductions = preview.booth_rent + preview.other_deductions + preview.invoices_applied;
    // The Inactive badge already says it.
    const rawLine = statusLine(preview);
    const line = rawLine === 'Inactive' ? null : rawLine;
    const dimDay = formatDay(preview.draft_through ?? through);
    const afterCount = countAfterCutoff(unpaidItems, preview.cutoff_at);
    const requiredApplied = workspace.required_adjustments.filter((row) => row.will_apply);
    const pending = workspace.required_adjustments.filter((row) => !row.will_apply);
    const hasOverride = vendor.payout_threshold_override !== null;

    const tabs = [
        { id: 'items', label: `Unpaid items (${unpaidItems.length})` },
        { id: 'deductions', label: `Deductions (${workspace.required_adjustments.length})` },
        { id: 'invoices', label: `Invoices (${workspace.invoices.length})` },
        { id: 'history', label: `History (${workspace.payout_history.length})` },
    ];

    return (
        <div className="space-y-6">
            <div>
                {backLink}
                <Header
                    className="!mb-0"
                    title={vendor.business_name || vendor.name}
                    description={`#${vendor.consignor_number} · Pay to ${vendor.pay_to_name}${vendor.booth_location ? ` · Booth ${vendor.booth_location}` : ''}`}
                    actions={hasDraft ? (
                        <Button type="button" onClick={() => navigate(draftPath(preview.draft_id ?? '', through))}>Open draft</Button>
                    ) : (
                        <Button type="button" onClick={() => void prepare()} isLoading={isPreparing} disabled={preview.payable_before_invoices <= 0}>
                            Prepare payout
                        </Button>
                    )}
                />
            </div>

            <Card className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <ReadinessBadge status={preview.status} />
                    {line ? <span className="text-sm text-[var(--color-muted)]">{line}</span> : null}
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <Badge variant={vendor.has_w9_filled_out ? 'success' : 'warning'} size="sm">
                            {vendor.has_w9_filled_out ? 'W-9 on file' : 'W-9 missing'}
                        </Badge>
                        {!preview.is_active ? <Badge size="sm">Inactive</Badge> : null}
                    </div>
                </div>

                <PayoutEquation
                    lines={[
                        { label: 'Carried in', amount: preview.carried_in },
                        { label: 'Earned', amount: preview.earned, sign: '+' },
                        { label: 'Deductions', amount: deductions, sign: '−' },
                        { label: 'Payable', amount: preview.payable, sign: '=', strong: true },
                    ]}
                />
                <p className="text-xs text-[var(--color-muted)]">
                    {hasDraft
                        ? `These are the figures saved in the draft, through ${dimDay}.`
                        : `Earnings through ${formatDay(through)}.`}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-sm">
                    <p className="text-[var(--color-muted)]">
                        {preview.is_active
                            ? <>Minimum payout <span className="font-medium text-[var(--color-foreground)]">{formatCurrency(preview.threshold)}</span> ({hasOverride ? 'set for this vendor' : 'shop default'})</>
                            : 'No minimum payout applies to an inactive vendor.'}
                    </p>
                    {preview.is_active ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setMinimumOpen(true)}>Change</Button>
                    ) : null}
                </div>
            </Card>

            {preview.legacy_item_count > 0 ? (
                <p className="text-xs text-[var(--color-muted)]">
                    {preview.legacy_item_count} sold {preview.legacy_item_count === 1 ? 'item sits' : 'items sit'} under older payouts that can&apos;t be matched to exact sales. They count as paid, so nothing is owed on them.
                </p>
            ) : null}

            <div className="space-y-4">
                <Tabs tabs={tabs} activeTab={view} onChange={(id) => setView(id as VendorTab)} ariaLabel="Vendor payout details" />

                {view === 'items' ? (
                    <div className="space-y-3">
                        {afterCount > 0 ? (
                            <p className="text-sm text-[var(--color-muted)]">
                                {afterCount} {afterCount === 1 ? 'item' : 'items'} after {dimDay} {afterCount === 1 ? 'is' : 'are'} not in this payout.
                            </p>
                        ) : null}
                        <TransactionLedger
                            items={unpaidItems}
                            statementHref={(id) => `/admin/payouts/history/${id}`}
                            emptyMessage="No unpaid sale items."
                            dimmedAfter={preview.cutoff_at}
                        />
                    </div>
                ) : null}

                {view === 'deductions' ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                        <RowList
                            title="Will apply when affordable"
                            empty="No required deductions are currently applicable."
                            rows={requiredApplied.map((row) => ({
                                id: `${row.source_table}-${row.source_reference}`,
                                label: row.description,
                                amount: row.signed_amount,
                                meta: row.adjustment_type.replace(/_/g, ' '),
                            }))}
                        />
                        <RowList
                            title="Pending"
                            empty="No pending deductions."
                            rows={pending.map((row) => ({
                                id: `${row.source_table}-${row.source_reference}`,
                                label: row.description,
                                amount: row.signed_amount,
                                meta: row.pending_reason || 'Pending',
                            }))}
                        />
                    </div>
                ) : null}

                {view === 'invoices' ? (
                    <LinkList empty="No unpaid vendor invoices.">
                        {workspace.invoices.map((invoice) => (
                            <Link
                                key={invoice.id}
                                to={`/admin/finances/invoices/${invoice.id}`}
                                className="flex min-h-16 items-center gap-4 px-4 hover:bg-[var(--color-surface-hover)]"
                            >
                                <ReceiptText className="h-5 w-5 text-[var(--color-muted)]" aria-hidden="true" />
                                <div>
                                    <p className="font-mono text-sm">#{invoice.invoice_number}</p>
                                    <p className="text-xs text-[var(--color-muted)]">
                                        {new Date(invoice.created_at).toLocaleDateString()} · {invoice.status.replace('_', ' ')}
                                    </p>
                                </div>
                                <div className="ml-auto text-right">
                                    <Money amount={invoice.balance_due} className="text-lg font-semibold" />
                                    <p className="text-xs text-[var(--color-muted)]">of {formatCurrency(invoice.total)}</p>
                                </div>
                            </Link>
                        ))}
                    </LinkList>
                ) : null}

                {view === 'history' ? (
                    <LinkList empty="No completed payouts yet.">
                        {workspace.payout_history.map((payout) => (
                            <Link
                                key={payout.id}
                                to={`/admin/payouts/history/${payout.id}`}
                                className="flex min-h-16 items-center gap-4 px-4 hover:bg-[var(--color-surface-hover)]"
                            >
                                <FileText className="h-5 w-5 text-[var(--color-muted)]" aria-hidden="true" />
                                <div>
                                    <p className="font-mono text-sm">Payout #{payout.id.slice(0, 8).toUpperCase()}</p>
                                    <p className="text-xs text-[var(--color-muted)]">
                                        {formatPayoutDate(payout)} · {payout.items_sold} items
                                    </p>
                                </div>
                                {payout.status === 'voided' ? <Badge variant="danger" size="sm">Voided</Badge> : null}
                                {payout.historical_confidence === 'legacy_unverified' ? <Badge variant="secondary" size="sm">Legacy</Badge> : null}
                                <Money amount={payout.amount} className="ml-auto text-lg font-semibold" />
                            </Link>
                        ))}
                    </LinkList>
                ) : null}
            </div>

            <MinimumModal
                isOpen={minimumOpen}
                consignorId={consignorId}
                override={vendor.payout_threshold_override}
                current={preview.threshold}
                onClose={() => setMinimumOpen(false)}
                onSaved={() => void refetch()}
            />
        </div>
    );
}

function LinkList({ children, empty }: { children: ReactNode[]; empty: string }) {
    if (children.length === 0) {
        return <div className="rounded-xl bg-[var(--color-surface)] py-10 text-center text-sm text-[var(--color-muted)]">{empty}</div>;
    }
    return (
        <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl bg-[var(--color-card)] shadow-[var(--shadow-surface)]">
            {children}
        </div>
    );
}

function RowList({ title, rows, empty }: {
    title: string;
    rows: Array<{ id: string; label: string; amount: number; meta: string }>;
    empty: string;
}) {
    return (
        <Card padding="none" className="overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-semibold">{title}</h2>
            {rows.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-[var(--color-muted)]">{empty}</p>
            ) : (
                <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                    {rows.map((row) => (
                        <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-medium">{row.label}</p>
                                <p className="text-xs text-[var(--color-muted)]">{row.meta}</p>
                            </div>
                            <Money amount={row.amount} className="ml-auto font-medium" />
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

function MinimumModal({ isOpen, consignorId, override, current, onClose, onSaved }: {
    isOpen: boolean;
    consignorId: string;
    override: number | null;
    current: number;
    onClose: () => void;
    onSaved: () => void;
}) {
    const toast = useToast();
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState<'amount' | 'default' | null>(null);

    useEffect(() => {
        if (isOpen) {
            setValue((override ?? current).toFixed(2));
            setError(null);
        }
    }, [isOpen, override, current]);

    const save = async (amount: number | null) => {
        if (amount !== null) {
            const problem = validateMinimum(value);
            if (problem) {
                setError(problem);
                return;
            }
        }
        setSaving(amount === null ? 'default' : 'amount');
        setError(null);
        try {
            await updateVendorThreshold(consignorId, amount);
            toast.success(amount === null ? 'Using the shop default minimum' : 'Minimum payout saved');
            onSaved();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save the minimum payout.');
        } finally {
            setSaving(null);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} title="Minimum payout" size="sm">
            <Input
                label="Minimum for this vendor"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                error={error ?? undefined}
                hint="Existing drafts keep the minimum they were saved with."
            />
            <ModalFooter>
                <Button type="button" variant="ghost" onClick={onClose} disabled={saving !== null}>Cancel</Button>
                {override !== null ? (
                    <Button type="button" variant="secondary" onClick={() => void save(null)} isLoading={saving === 'default'} disabled={saving === 'amount'}>
                        Use shop default
                    </Button>
                ) : null}
                <Button type="button" onClick={() => void save(Number(value))} isLoading={saving === 'amount'} disabled={saving === 'default'}>
                    Save
                </Button>
            </ModalFooter>
        </Modal>
    );
}

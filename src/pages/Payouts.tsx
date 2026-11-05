import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { MarkPaidDialog, type MarkPaidTarget } from '../components/payouts/MarkPaidDialog';
import { PayoutSettingsModal } from '../components/payouts/PayoutSettingsModal';
import { ThroughDateButton } from '../components/payouts/ThroughDateButton';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Money } from '../components/ui/Money';
import { StatCard } from '../components/ui/StatCard';
import { Tabs } from '../components/ui/Tabs';
import { useToast } from '../contexts/ToastContext';
import {
    discardPayoutDraft,
    downloadReconciliationCsv,
    getDefaultThreshold,
    preparePayoutRun,
    usePayoutRun,
} from '../hooks/usePayouts';
import { rollsForward } from '../lib/payoutDraft';
import {
    defaultThroughDate,
    formatDay,
    localDateString,
    monthName,
    parseThrough,
    readyToPrepare,
    runTotals,
} from '../lib/payoutRun';
import type { PayoutRunRow } from '../types/payouts';
import { QueueTab } from './payouts/QueueTab';

type PayoutsTab = 'queue' | 'drafts' | 'history';

const TABS: Array<{ id: PayoutsTab; label: string }> = [
    { id: 'queue', label: 'Queue' },
    { id: 'drafts', label: 'Drafts' },
    { id: 'history', label: 'History' },
];

interface PrepareOutcome {
    created: number;
    failures: Array<{ vendor: string; message: string }>;
}

function parseTab(value: string | null): PayoutsTab {
    return value === 'drafts' || value === 'history' ? value : 'queue';
}

function payoutWord(count: number): string {
    return count === 1 ? 'payout' : 'payouts';
}

function vendorName(row: PayoutRunRow): string {
    return row.business_name || row.name;
}

function markPaidTarget(row: PayoutRunRow): MarkPaidTarget {
    return {
        payoutId: row.draft_id ?? '',
        vendorName: vendorName(row),
        payToName: row.pay_to_name,
        amount: row.paying_now,
        rollsForward: rollsForward(row.payable, row.paying_now),
        email: row.email,
        reasonRequired: row.paying_now > 0 && row.payable_before_invoices < row.threshold,
        reason: row.override_reason ?? '',
    };
}

export function Payouts() {
    const navigate = useNavigate();
    const toast = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const today = useMemo(() => new Date(), []);
    const todayString = localDateString(today);

    const through = parseThrough(searchParams.get('through'), today);
    const tab = parseTab(searchParams.get('tab'));
    const { data, error, refetch } = usePayoutRun(through);

    const [prepareOpen, setPrepareOpen] = useState(false);
    const [isPreparing, setIsPreparing] = useState(false);
    const [prepareOutcome, setPrepareOutcome] = useState<PrepareOutcome | null>(null);
    const [discardRow, setDiscardRow] = useState<PayoutRunRow | null>(null);
    const [isDiscarding, setIsDiscarding] = useState(false);
    const [markPaid, setMarkPaid] = useState<MarkPaidTarget | null>(null);
    const [threshold, setThreshold] = useState<number | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const preparingVendor = useRef(false);

    const rows = useMemo(() => data?.rows ?? [], [data]);
    const totals = useMemo(() => runTotals(rows), [rows]);
    const ready = useMemo(() => readyToPrepare(rows), [rows]);

    const updateParams = (changes: { tab?: PayoutsTab; through?: string }) => {
        const nextTab = changes.tab ?? tab;
        const nextThrough = changes.through ?? through;
        const params = new URLSearchParams();
        if (nextThrough !== defaultThroughDate(today)) params.set('through', nextThrough);
        if (nextTab !== 'queue') params.set('tab', nextTab);
        setSearchParams(params, { replace: true });
    };

    const prepareVendor = async (id: string) => {
        if (preparingVendor.current) return;
        preparingVendor.current = true;
        try {
            const [result] = await preparePayoutRun(through, [id]);
            if (result?.status === 'created' && result.payout_id) {
                navigate(`/admin/payouts/drafts/${result.payout_id}`);
            } else if (result?.status === 'failed') {
                toast.error('Could not prepare this payout', result.message ?? undefined);
            } else {
                toast.info('Nothing to prepare', result?.message ?? undefined);
            }
        } catch (err) {
            toast.error('Could not prepare this payout', err instanceof Error ? err.message : undefined);
        } finally {
            preparingVendor.current = false;
        }
    };

    const closePrepare = () => {
        if (isPreparing) return;
        setPrepareOpen(false);
        setPrepareOutcome(null);
    };

    const prepareAll = async () => {
        setIsPreparing(true);
        try {
            const results = await preparePayoutRun(through, ready.map((row) => row.consignor_id));
            const names = new Map(rows.map((row) => [row.consignor_id, vendorName(row)]));
            const failures = results
                .filter((result) => result.status === 'failed')
                .map((result) => ({
                    vendor: names.get(result.consignor_id) ?? 'Unknown vendor',
                    message: result.message ?? 'Could not prepare this payout.',
                }));
            const created = results.filter((result) => result.status === 'created').length;
            await refetch();
            if (created > 0) updateParams({ tab: 'drafts' });
            if (failures.length > 0) {
                setPrepareOutcome({ created, failures });
            } else {
                setPrepareOpen(false);
                if (created > 0) toast.success(`${created} ${created === 1 ? 'draft' : 'drafts'} prepared`);
            }
        } catch (err) {
            toast.error('Could not prepare the payouts', err instanceof Error ? err.message : undefined);
        } finally {
            setIsPreparing(false);
        }
    };

    const confirmDiscard = async () => {
        if (!discardRow?.draft_id) return;
        setIsDiscarding(true);
        try {
            await discardPayoutDraft(discardRow.draft_id);
            toast.success('Draft discarded');
            setDiscardRow(null);
            await refetch();
        } catch (err) {
            toast.error('Could not discard this draft', err instanceof Error ? err.message : undefined);
        } finally {
            setIsDiscarding(false);
        }
    };

    const downloadCsv = async () => {
        try {
            await downloadReconciliationCsv();
        } catch (err) {
            toast.error('Could not download the reconciliation CSV', err instanceof Error ? err.message : undefined);
        }
    };

    const openSettings = async () => {
        try {
            setThreshold(await getDefaultThreshold());
            setSettingsOpen(true);
        } catch (err) {
            toast.error('Could not load payout settings', err instanceof Error ? err.message : undefined);
        }
    };

    return (
        <div>
            <Header
                title="Vendor payouts"
                description="Older unpaid balances are always included. The date only sets the cutoff for new earnings."
                actions={(
                    <>
                        <ThroughDateButton
                            value={through}
                            max={todayString}
                            onChange={(date) => updateParams({ through: date })}
                        />
                        <Button type="button" variant="secondary" onClick={() => void openSettings()}>
                            Payout settings
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => void downloadCsv()}>
                            Reconciliation CSV
                        </Button>
                        <Button type="button" disabled={ready.length === 0} onClick={() => setPrepareOpen(true)}>
                            Prepare {ready.length} ready {payoutWord(ready.length)}
                        </Button>
                    </>
                )}
            />

            {error ? (
                <Card className="flex flex-col items-center gap-3 py-10 text-center">
                    <p role="alert" className="font-medium text-[var(--color-foreground)]">The payout queue could not be loaded.</p>
                    <p className="text-sm text-[var(--color-muted)]">{error}</p>
                    <Button type="button" variant="secondary" onClick={() => void refetch()}>Retry</Button>
                </Card>
            ) : !data ? (
                <div className="flex justify-center py-16">
                    <LoadingSpinner />
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            label="Ready to pay"
                            value={<Money amount={totals.ready.total} />}
                            subtext={`${totals.ready.count} ${totals.ready.count === 1 ? 'vendor' : 'vendors'}`}
                        />
                        <StatCard
                            label="Accruing"
                            value={<Money amount={totals.accruing.total} />}
                            subtext={`${totals.accruing.count} ${totals.accruing.count === 1 ? 'vendor' : 'vendors'}`}
                        />
                        <StatCard
                            label="In drafts"
                            value={<Money amount={totals.drafts.total} />}
                            subtext={`${totals.drafts.count} ${totals.drafts.count === 1 ? 'vendor' : 'vendors'}`}
                        />
                        <StatCard
                            label={`Paid in ${monthName(through)}`}
                            value={<Money amount={data.paid_in_month.total} />}
                            subtext={`${data.paid_in_month.count} ${payoutWord(data.paid_in_month.count)}`}
                        />
                    </div>

                    <Tabs
                        tabs={TABS}
                        activeTab={tab}
                        onChange={(id) => updateParams({ tab: id as PayoutsTab })}
                        ariaLabel="Vendor payout views"
                    />

                    {tab === 'queue' ? (
                        <QueueTab
                            data={data}
                            through={through}
                            onPrepareVendor={(id) => void prepareVendor(id)}
                            onDiscard={setDiscardRow}
                            onMarkPaid={(row) => setMarkPaid(markPaidTarget(row))}
                            onDownloadCsv={() => void downloadCsv()}
                        />
                    ) : tab === 'drafts' ? (
                        <EmptyState title="Drafts" description="Drafts will appear here." />
                    ) : (
                        <EmptyState title="History" description="Paid and voided payouts will appear here." />
                    )}
                </div>
            )}

            <Modal
                isOpen={prepareOpen}
                onClose={closePrepare}
                title={prepareOutcome
                    ? `${prepareOutcome.created} ${prepareOutcome.created === 1 ? 'draft' : 'drafts'} prepared`
                    : `Prepare ${ready.length} ${payoutWord(ready.length)} through ${formatDay(through)}?`}
                size="md"
            >
                {prepareOutcome ? (
                    <div className="space-y-3">
                        <p className="text-sm text-[var(--color-muted)]">
                            {prepareOutcome.failures.length} could not be prepared. The drafts that were created are kept.
                        </p>
                        <ul className="space-y-2 text-sm">
                            {prepareOutcome.failures.map((failure) => (
                                <li key={`${failure.vendor}-${failure.message}`}>
                                    <span className="font-medium text-[var(--color-foreground)]">{failure.vendor}</span>
                                    <span className="text-[var(--color-muted)]"> · {failure.message}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <p className="text-sm text-[var(--color-muted)]">
                        This creates a draft for each vendor, <Money amount={totals.ready.total} /> in total. Nothing is paid yet.
                    </p>
                )}
                <ModalFooter>
                    {prepareOutcome ? (
                        <Button type="button" onClick={closePrepare}>Close</Button>
                    ) : (
                        <>
                            <Button type="button" variant="ghost" onClick={closePrepare} disabled={isPreparing}>Cancel</Button>
                            <Button type="button" onClick={() => void prepareAll()} isLoading={isPreparing}>
                                Prepare {ready.length} {payoutWord(ready.length)}
                            </Button>
                        </>
                    )}
                </ModalFooter>
            </Modal>

            <Modal
                isOpen={discardRow !== null}
                onClose={isDiscarding ? () => {} : () => setDiscardRow(null)}
                title={`Discard this draft for ${discardRow ? vendorName(discardRow) : ''}?`}
                size="sm"
            >
                <p className="text-sm text-[var(--color-muted)]">
                    Nothing has been paid. Sales and deductions go back to the queue.
                </p>
                <ModalFooter>
                    <Button type="button" variant="ghost" onClick={() => setDiscardRow(null)} disabled={isDiscarding}>Cancel</Button>
                    <Button type="button" variant="danger" onClick={() => void confirmDiscard()} isLoading={isDiscarding}>
                        Discard draft
                    </Button>
                </ModalFooter>
            </Modal>

            <MarkPaidDialog
                target={markPaid}
                onClose={() => setMarkPaid(null)}
                onPaid={() => {
                    setMarkPaid(null);
                    void refetch();
                }}
            />

            <PayoutSettingsModal
                isOpen={settingsOpen}
                current={threshold ?? 0}
                onClose={() => setSettingsOpen(false)}
                onSaved={() => {
                    setThreshold(null);
                    void refetch();
                }}
            />
        </div>
    );
}

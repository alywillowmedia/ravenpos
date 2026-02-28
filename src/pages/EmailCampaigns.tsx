import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { supabase } from '../lib/supabase';
import { cn, formatDateTime } from '../lib/utils';

type BlockType = 'text' | 'image' | 'button' | 'divider' | 'spacer';
type TextAlign = 'left' | 'center' | 'right';

interface TextBlock {
    id: string;
    type: 'text';
    heading: string;
    body: string;
    align: TextAlign;
}

interface ImageBlock {
    id: string;
    type: 'image';
    imageUrl: string;
    alt: string;
    widthPercent: number;
}

interface ButtonBlock {
    id: string;
    type: 'button';
    label: string;
    url: string;
    align: TextAlign;
    backgroundColor: string;
    textColor: string;
}

interface DividerBlock {
    id: string;
    type: 'divider';
    color: string;
}

interface SpacerBlock {
    id: string;
    type: 'spacer';
    height: number;
}

type EmailBlock = TextBlock | ImageBlock | ButtonBlock | DividerBlock | SpacerBlock;

interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    preview_text: string | null;
    from_name: string | null;
    from_email: string;
    reply_to: string | null;
    blocks: EmailBlock[];
    created_at: string;
    updated_at: string;
}

interface CampaignSend {
    id: string;
    template_name: string | null;
    subject: string;
    recipient_source: 'customers_with_email' | 'manual';
    recipient_count: number;
    sent_count: number;
    failed_count: number;
    status: 'sent' | 'partial' | 'failed';
    created_at: string;
}

interface SendResult {
    success: boolean;
    recipientCount: number;
    sentCount: number;
    failedCount: number;
    status: 'sent' | 'partial' | 'failed';
    sampleFailures: string[];
}

const DEFAULT_TEMPLATE = {
    templateName: '',
    subject: '',
    previewText: '',
    fromName: 'Ravenlia',
    fromEmail: 'email@ravenlia.com',
    replyTo: '',
};

function uid(): string {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function addLineBreaks(text: string): string {
    return escapeHtml(text).replace(/\n/g, '<br/>');
}

function defaultBlock(type: BlockType): EmailBlock {
    if (type === 'text') {
        return {
            id: uid(),
            type,
            heading: 'Title',
            body: 'Write your message here.',
            align: 'left',
        };
    }

    if (type === 'image') {
        return {
            id: uid(),
            type,
            imageUrl: '',
            alt: 'Campaign image',
            widthPercent: 100,
        };
    }

    if (type === 'button') {
        return {
            id: uid(),
            type,
            label: 'Shop Now',
            url: 'https://',
            align: 'center',
            backgroundColor: '#111111',
            textColor: '#ffffff',
        };
    }

    if (type === 'divider') {
        return {
            id: uid(),
            type,
            color: '#e5e7eb',
        };
    }

    return {
        id: uid(),
        type: 'spacer',
        height: 24,
    };
}

function renderBlockHtml(block: EmailBlock): string {
    if (block.type === 'text') {
        return `
        <tr>
          <td style="padding: 12px 28px; text-align: ${block.align};">
            ${block.heading.trim() ? `<h2 style="margin: 0 0 8px 0; color: #111827; font-size: 22px; line-height: 1.25;">${addLineBreaks(block.heading)}</h2>` : ''}
            ${block.body.trim() ? `<p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.6;">${addLineBreaks(block.body)}</p>` : ''}
          </td>
        </tr>
      `;
    }

    if (block.type === 'image' && block.imageUrl.trim()) {
        const safeWidth = Math.max(20, Math.min(100, block.widthPercent));
        return `
        <tr>
          <td style="padding: 10px 28px; text-align: center;">
            <img src="${escapeHtml(block.imageUrl.trim())}" alt="${escapeHtml(block.alt.trim())}" style="display: block; width: ${safeWidth}%; max-width: 100%; height: auto; border-radius: 10px; margin: 0 auto;" />
          </td>
        </tr>
      `;
    }

    if (block.type === 'button' && block.label.trim() && block.url.trim()) {
        return `
        <tr>
          <td style="padding: 12px 28px; text-align: ${block.align};">
            <a href="${escapeHtml(block.url.trim())}" style="display: inline-block; padding: 11px 18px; border-radius: 8px; text-decoration: none; font-weight: 600; background: ${escapeHtml(block.backgroundColor)}; color: ${escapeHtml(block.textColor)};">
              ${escapeHtml(block.label)}
            </a>
          </td>
        </tr>
      `;
    }

    if (block.type === 'divider') {
        return `
        <tr>
          <td style="padding: 12px 28px;">
            <div style="height: 1px; background: ${escapeHtml(block.color)};"></div>
          </td>
        </tr>
      `;
    }

    if (block.type === 'spacer') {
        const safeHeight = Math.max(8, Math.min(120, block.height));
        return `
        <tr>
          <td style="height: ${safeHeight}px; font-size: 0; line-height: 0;">&nbsp;</td>
        </tr>
      `;
    }

    return '';
}

function buildEmailHtml(payload: {
    subject: string;
    previewText?: string;
    blocks: EmailBlock[];
}): string {
    const blocksHtml = payload.blocks.map(renderBlockHtml).join('');

    return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(payload.subject)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <span style="display: none; opacity: 0; visibility: hidden; color: transparent; height: 0; width: 0; overflow: hidden;">
      ${escapeHtml(payload.previewText || '')}
    </span>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; background: #f3f4f6;">
      <tr>
        <td style="padding: 24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; border: 1px solid #e5e7eb; box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06); overflow: hidden;">
            ${blocksHtml}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}

function buildTextVersion(blocks: EmailBlock[]): string {
    return blocks
        .map((block) => {
            if (block.type === 'text') {
                return [block.heading.trim(), block.body.trim()].filter(Boolean).join('\n');
            }
            if (block.type === 'button') {
                return `${block.label.trim()}\n${block.url.trim()}`;
            }
            return '';
        })
        .filter(Boolean)
        .join('\n\n');
}

function parseManualRecipients(raw: string): string[] {
    return raw
        .split(/[\n,;]/g)
        .map((value) => value.trim())
        .filter(Boolean);
}

export function EmailCampaigns() {
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [campaigns, setCampaigns] = useState<CampaignSend[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [isSending, setIsSending] = useState(false);

    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [templateName, setTemplateName] = useState(DEFAULT_TEMPLATE.templateName);
    const [subject, setSubject] = useState(DEFAULT_TEMPLATE.subject);
    const [previewText, setPreviewText] = useState(DEFAULT_TEMPLATE.previewText);
    const [fromName, setFromName] = useState(DEFAULT_TEMPLATE.fromName);
    const [fromEmail, setFromEmail] = useState(DEFAULT_TEMPLATE.fromEmail);
    const [replyTo, setReplyTo] = useState(DEFAULT_TEMPLATE.replyTo);
    const [blocks, setBlocks] = useState<EmailBlock[]>([defaultBlock('text')]);

    const [audienceMode, setAudienceMode] = useState<'customers' | 'manual'>('customers');
    const [manualRecipientsRaw, setManualRecipientsRaw] = useState('');
    const [customerAudienceCount, setCustomerAudienceCount] = useState(0);

    const [templateError, setTemplateError] = useState<string | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [sendSuccess, setSendSuccess] = useState<string | null>(null);

    const manualRecipientCount = useMemo(
        () => parseManualRecipients(manualRecipientsRaw).length,
        [manualRecipientsRaw]
    );

    const previewHtml = useMemo(() => buildEmailHtml({ subject: subject || 'Preview', previewText, blocks }), [subject, previewText, blocks]);

    const resetDraft = useCallback(() => {
        setSelectedTemplateId('');
        setTemplateName(DEFAULT_TEMPLATE.templateName);
        setSubject(DEFAULT_TEMPLATE.subject);
        setPreviewText(DEFAULT_TEMPLATE.previewText);
        setFromName(DEFAULT_TEMPLATE.fromName);
        setFromEmail(DEFAULT_TEMPLATE.fromEmail);
        setReplyTo(DEFAULT_TEMPLATE.replyTo);
        setBlocks([defaultBlock('text')]);
        setTemplateError(null);
        setSendError(null);
        setSendSuccess(null);
    }, []);

    const loadInitialData = useCallback(async () => {
        setIsLoading(true);

        const [templatesRes, campaignsRes, customerCountRes] = await Promise.all([
            supabase
                .from('email_templates')
                .select('id, name, subject, preview_text, from_name, from_email, reply_to, blocks, created_at, updated_at')
                .eq('is_archived', false)
                .order('updated_at', { ascending: false }),
            supabase
                .from('email_campaign_sends')
                .select('id, template_name, subject, recipient_source, recipient_count, sent_count, failed_count, status, created_at')
                .order('created_at', { ascending: false })
                .limit(10),
            supabase
                .from('customers')
                .select('id', { count: 'exact', head: true })
                .eq('accepts_marketing', true)
                .not('email', 'is', null),
        ]);

        if (!templatesRes.error) {
            const normalized = (templatesRes.data ?? []).map((row) => ({
                ...row,
                blocks: Array.isArray(row.blocks) ? (row.blocks as EmailBlock[]) : [],
            }));
            setTemplates(normalized);
        }

        if (!campaignsRes.error) {
            setCampaigns((campaignsRes.data ?? []) as CampaignSend[]);
        }

        if (!customerCountRes.error) {
            setCustomerAudienceCount(customerCountRes.count ?? 0);
        }

        setIsLoading(false);
    }, []);

    useEffect(() => {
        void loadInitialData();
    }, [loadInitialData]);

    const loadTemplate = (templateId: string) => {
        const template = templates.find((item) => item.id === templateId);
        if (!template) return;

        setSelectedTemplateId(template.id);
        setTemplateName(template.name);
        setSubject(template.subject);
        setPreviewText(template.preview_text || '');
        setFromName(template.from_name || DEFAULT_TEMPLATE.fromName);
        setFromEmail(template.from_email || DEFAULT_TEMPLATE.fromEmail);
        setReplyTo(template.reply_to || '');
        setBlocks(template.blocks.length > 0 ? template.blocks : [defaultBlock('text')]);
        setTemplateError(null);
        setSendError(null);
        setSendSuccess(null);
    };

    const upsertTemplate = async () => {
        setTemplateError(null);

        if (!templateName.trim()) {
            setTemplateError('Template name is required.');
            return;
        }

        if (!subject.trim()) {
            setTemplateError('Subject is required.');
            return;
        }

        if (blocks.length === 0) {
            setTemplateError('Add at least one block.');
            return;
        }

        setIsSavingTemplate(true);

        const authResult = await supabase.auth.getUser();
        const userId = authResult.data.user?.id || null;

        const payload = {
            name: templateName.trim(),
            subject: subject.trim(),
            preview_text: previewText.trim() || null,
            from_name: fromName.trim() || null,
            from_email: fromEmail.trim() || DEFAULT_TEMPLATE.fromEmail,
            reply_to: replyTo.trim() || null,
            blocks,
            updated_by: userId,
        };

        let nextSelectedTemplateId = selectedTemplateId;
        let error: string | null = null;

        if (selectedTemplateId) {
            const { error: updateError } = await supabase
                .from('email_templates')
                .update(payload)
                .eq('id', selectedTemplateId);
            error = updateError?.message || null;
        } else {
            const { data, error: insertError } = await supabase
                .from('email_templates')
                .insert({ ...payload, created_by: userId })
                .select('id')
                .single();

            error = insertError?.message || null;
            if (!insertError && data?.id) {
                nextSelectedTemplateId = data.id;
            }
        }

        setIsSavingTemplate(false);

        if (error) {
            setTemplateError(error);
            return;
        }

        await loadInitialData();
        setSelectedTemplateId(nextSelectedTemplateId);

        setTemplateError(null);
    };

    const archiveTemplate = async () => {
        if (!selectedTemplateId) return;

        setIsSavingTemplate(true);
        const { error } = await supabase
            .from('email_templates')
            .update({ is_archived: true })
            .eq('id', selectedTemplateId);
        setIsSavingTemplate(false);

        if (error) {
            setTemplateError(error.message);
            return;
        }

        await loadInitialData();
        resetDraft();
    };

    const addBlock = (type: BlockType) => {
        setBlocks((prev) => [...prev, defaultBlock(type)]);
    };

    const updateBlock = (id: string, updater: (block: EmailBlock) => EmailBlock) => {
        setBlocks((prev) => prev.map((block) => (block.id === id ? updater(block) : block)));
    };

    const duplicateBlock = (id: string) => {
        setBlocks((prev) => {
            const idx = prev.findIndex((block) => block.id === id);
            if (idx < 0) return prev;
            const duplicate = { ...prev[idx], id: uid() };
            const next = [...prev];
            next.splice(idx + 1, 0, duplicate);
            return next;
        });
    };

    const moveBlock = (id: string, direction: 'up' | 'down') => {
        setBlocks((prev) => {
            const idx = prev.findIndex((block) => block.id === id);
            if (idx < 0) return prev;
            const target = direction === 'up' ? idx - 1 : idx + 1;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            [next[idx], next[target]] = [next[target], next[idx]];
            return next;
        });
    };

    const removeBlock = (id: string) => {
        setBlocks((prev) => (prev.length === 1 ? prev : prev.filter((block) => block.id !== id)));
    };

    const sendCampaign = async () => {
        setSendError(null);
        setSendSuccess(null);

        if (!subject.trim()) {
            setSendError('Subject is required before sending.');
            return;
        }

        if (blocks.length === 0) {
            setSendError('Add at least one content block before sending.');
            return;
        }

        const manualRecipients = parseManualRecipients(manualRecipientsRaw);
        if (audienceMode === 'manual' && manualRecipients.length === 0) {
            setSendError('Add at least one email for manual send.');
            return;
        }

        setIsSending(true);

        const { data, error } = await supabase.functions.invoke('send-bulk-email-campaign', {
            body: {
                templateId: selectedTemplateId || null,
                templateName: templateName.trim() || null,
                subject: subject.trim(),
                html: buildEmailHtml({ subject: subject.trim(), previewText, blocks }),
                text: buildTextVersion(blocks),
                fromName: fromName.trim() || DEFAULT_TEMPLATE.fromName,
                fromEmail: fromEmail.trim() || DEFAULT_TEMPLATE.fromEmail,
                replyTo: replyTo.trim() || null,
                recipientSource: audienceMode === 'customers' ? 'customers_with_email' : 'manual',
                manualRecipients,
                metadata: {
                    blockCount: blocks.length,
                },
            },
        });

        setIsSending(false);

        if (error) {
            setSendError(error.message || 'Failed to send campaign.');
            return;
        }

        const result = data as SendResult;
        if (!result.success) {
            setSendError('Campaign send failed.');
            return;
        }

        setSendSuccess(`Sent ${result.sentCount} of ${result.recipientCount}. Failed: ${result.failedCount}.`);
        if (result.sampleFailures.length > 0) {
            setSendError(`Some sends failed: ${result.sampleFailures.slice(0, 3).join(' | ')}`);
        }

        await loadInitialData();
    };

    return (
        <div className="space-y-6">
            <Header
                title="Email Campaigns"
                description="Build reusable email templates and send campaigns to customers using Resend."
                actions={
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={resetDraft}>New Template</Button>
                        <Button onClick={upsertTemplate} isLoading={isSavingTemplate}>Save Template</Button>
                    </div>
                }
            />

            <section className="grid gap-4 xl:grid-cols-[340px,1fr]">
                <div className="space-y-4">
                    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Templates</p>
                        <div className="mt-3 space-y-2">
                            <Select
                                label="Load template"
                                options={templates.map((template) => ({ value: template.id, label: template.name }))}
                                placeholder="Select a saved template"
                                value={selectedTemplateId}
                                onChange={(event) => loadTemplate(event.target.value)}
                            />
                            <Input label="Template name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
                            {selectedTemplateId && (
                                <Button variant="danger" onClick={archiveTemplate} isLoading={isSavingTemplate}>
                                    Archive Template
                                </Button>
                            )}
                            {templateError && <p className="text-sm text-[var(--color-danger)]">{templateError}</p>}
                        </div>
                    </div>

                    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Audience</p>
                        <div className="mt-3 space-y-3">
                            <Select
                                label="Send to"
                                value={audienceMode}
                                onChange={(event) => setAudienceMode(event.target.value as 'customers' | 'manual')}
                                options={[
                                    { value: 'customers', label: `Opted-in customers with email (${customerAudienceCount})` },
                                    { value: 'manual', label: 'Manual list' },
                                ]}
                            />

                            {audienceMode === 'manual' && (
                                <Textarea
                                    label="Manual recipients"
                                    placeholder="one@example.com, two@example.com"
                                    value={manualRecipientsRaw}
                                    onChange={(event) => setManualRecipientsRaw(event.target.value)}
                                    hint={`${manualRecipientCount} emails detected`}
                                />
                            )}

                            <Button onClick={sendCampaign} isLoading={isSending}>
                                Send Campaign
                            </Button>
                            {sendSuccess && <p className="text-sm text-[var(--color-success)]">{sendSuccess}</p>}
                            {sendError && <p className="text-sm text-[var(--color-danger)]">{sendError}</p>}
                        </div>
                    </div>

                    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Recent Sends</p>
                        <div className="mt-3 space-y-2">
                            {campaigns.map((campaign) => (
                                <div key={campaign.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
                                    <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">{campaign.subject}</p>
                                    <p className="text-xs text-[var(--color-muted)]">
                                        {campaign.template_name || 'One-off'} | {campaign.sent_count}/{campaign.recipient_count} | {campaign.status}
                                    </p>
                                    <p className="text-xs text-[var(--color-muted)]">{formatDateTime(campaign.created_at)}</p>
                                </div>
                            ))}
                            {!isLoading && campaigns.length === 0 && (
                                <p className="text-sm text-[var(--color-muted)]">No campaigns sent yet.</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Campaign Settings</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <Input label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} className="md:col-span-2" />
                            <Input label="Preview text" value={previewText} onChange={(event) => setPreviewText(event.target.value)} className="md:col-span-2" />
                            <Input label="From name" value={fromName} onChange={(event) => setFromName(event.target.value)} />
                            <Input label="From email" type="email" value={fromEmail} onChange={(event) => setFromEmail(event.target.value)} />
                            <Input label="Reply-to (optional)" type="email" value={replyTo} onChange={(event) => setReplyTo(event.target.value)} className="md:col-span-2" />
                        </div>
                    </div>

                    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Block Editor</p>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" size="sm" onClick={() => addBlock('text')}>+ Text</Button>
                                <Button variant="secondary" size="sm" onClick={() => addBlock('image')}>+ Image</Button>
                                <Button variant="secondary" size="sm" onClick={() => addBlock('button')}>+ Button</Button>
                                <Button variant="secondary" size="sm" onClick={() => addBlock('divider')}>+ Divider</Button>
                                <Button variant="secondary" size="sm" onClick={() => addBlock('spacer')}>+ Spacer</Button>
                            </div>
                        </div>

                        <div className="mt-3 space-y-3">
                            {blocks.map((block, index) => (
                                <div key={block.id} className="rounded-lg border border-[var(--color-border)] p-3">
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <p className="text-sm font-semibold capitalize text-[var(--color-foreground)]">{index + 1}. {block.type}</p>
                                        <div className="flex gap-1">
                                            <button className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs" onClick={() => moveBlock(block.id, 'up')}>Up</button>
                                            <button className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs" onClick={() => moveBlock(block.id, 'down')}>Down</button>
                                            <button className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs" onClick={() => duplicateBlock(block.id)}>Duplicate</button>
                                            <button className={cn('rounded-md border px-2 py-1 text-xs', blocks.length === 1 ? 'border-[var(--color-border)] text-[var(--color-muted)]' : 'border-[var(--color-danger)] text-[var(--color-danger)]')} onClick={() => removeBlock(block.id)} disabled={blocks.length === 1}>Delete</button>
                                        </div>
                                    </div>

                                    {block.type === 'text' && (
                                        <div className="space-y-3">
                                            <Input label="Heading" value={block.heading} onChange={(event) => updateBlock(block.id, (current) => current.type === 'text' ? { ...current, heading: event.target.value } : current)} />
                                            <Textarea label="Body" value={block.body} onChange={(event) => updateBlock(block.id, (current) => current.type === 'text' ? { ...current, body: event.target.value } : current)} />
                                            <Select
                                                label="Alignment"
                                                value={block.align}
                                                onChange={(event) => updateBlock(block.id, (current) => current.type === 'text' ? { ...current, align: event.target.value as TextAlign } : current)}
                                                options={[
                                                    { value: 'left', label: 'Left' },
                                                    { value: 'center', label: 'Center' },
                                                    { value: 'right', label: 'Right' },
                                                ]}
                                            />
                                        </div>
                                    )}

                                    {block.type === 'image' && (
                                        <div className="space-y-3">
                                            <Input label="Image URL" value={block.imageUrl} onChange={(event) => updateBlock(block.id, (current) => current.type === 'image' ? { ...current, imageUrl: event.target.value } : current)} />
                                            <Input label="Alt text" value={block.alt} onChange={(event) => updateBlock(block.id, (current) => current.type === 'image' ? { ...current, alt: event.target.value } : current)} />
                                            <Input
                                                label="Width %"
                                                type="number"
                                                min={20}
                                                max={100}
                                                value={block.widthPercent}
                                                onChange={(event) => updateBlock(block.id, (current) => current.type === 'image' ? { ...current, widthPercent: Number(event.target.value) || 100 } : current)}
                                            />
                                        </div>
                                    )}

                                    {block.type === 'button' && (
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <Input label="Label" value={block.label} onChange={(event) => updateBlock(block.id, (current) => current.type === 'button' ? { ...current, label: event.target.value } : current)} />
                                            <Input label="URL" value={block.url} onChange={(event) => updateBlock(block.id, (current) => current.type === 'button' ? { ...current, url: event.target.value } : current)} />
                                            <Select
                                                label="Alignment"
                                                value={block.align}
                                                onChange={(event) => updateBlock(block.id, (current) => current.type === 'button' ? { ...current, align: event.target.value as TextAlign } : current)}
                                                options={[
                                                    { value: 'left', label: 'Left' },
                                                    { value: 'center', label: 'Center' },
                                                    { value: 'right', label: 'Right' },
                                                ]}
                                            />
                                            <Input label="Background color" value={block.backgroundColor} onChange={(event) => updateBlock(block.id, (current) => current.type === 'button' ? { ...current, backgroundColor: event.target.value } : current)} />
                                            <Input label="Text color" value={block.textColor} onChange={(event) => updateBlock(block.id, (current) => current.type === 'button' ? { ...current, textColor: event.target.value } : current)} />
                                        </div>
                                    )}

                                    {block.type === 'divider' && (
                                        <Input label="Line color" value={block.color} onChange={(event) => updateBlock(block.id, (current) => current.type === 'divider' ? { ...current, color: event.target.value } : current)} />
                                    )}

                                    {block.type === 'spacer' && (
                                        <Input
                                            label="Height (px)"
                                            type="number"
                                            min={8}
                                            max={120}
                                            value={block.height}
                                            onChange={(event) => updateBlock(block.id, (current) => current.type === 'spacer' ? { ...current, height: Number(event.target.value) || 24 } : current)}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Preview</p>
                        <iframe
                            title="email-preview"
                            srcDoc={previewHtml}
                            className="mt-3 h-[700px] w-full rounded-lg border border-[var(--color-border)] bg-white"
                        />
                    </div>
                </div>
            </section>
        </div>
    );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { supabase } from '../lib/supabase';
import { cn, formatDateTime } from '../lib/utils';

type BlockType = 'text' | 'image' | 'button' | 'divider' | 'spacer';
type TextAlign = 'left' | 'center' | 'right';
type ComposerView = 'compose' | 'split' | 'preview';
type WorkspaceTab = 'compose' | 'history';
type ComposeStep = 'editor' | 'audience';

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

interface RecipientOption {
    id: string;
    name: string;
    email: string;
    source: 'customer' | 'consignor';
}

const DEFAULT_TEMPLATE = {
    templateName: '',
    subject: '',
    previewText: '',
    fromName: 'Ravenlia',
    fromEmail: 'email@ravenlia.com',
    replyTo: '',
};

const BLOCK_LIBRARY: Array<{ type: BlockType; label: string }> = [
    { type: 'text', label: 'Text' },
    { type: 'image', label: 'Image' },
    { type: 'button', label: 'Button' },
    { type: 'divider', label: 'Divider' },
    { type: 'spacer', label: 'Spacer' },
];

const ALIGNMENTS: TextAlign[] = ['left', 'center', 'right'];

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

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function textAlignClass(align: TextAlign): string {
    if (align === 'center') return 'text-center';
    if (align === 'right') return 'text-right';
    return 'text-left';
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
        const safeWidth = clamp(block.widthPercent, 20, 100);
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
        const safeHeight = clamp(block.height, 8, 120);
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: string): string | null {
    const email = value.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) return null;
    return email;
}

function dedupeValidEmails(values: string[]): string[] {
    const unique = new Set<string>();
    for (const value of values) {
        const normalized = normalizeEmail(value);
        if (normalized) unique.add(normalized);
    }
    return Array.from(unique);
}

function blockLabel(type: BlockType): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
}

function viewToggleLabel(view: ComposerView): string {
    if (view === 'compose') return 'Compose';
    if (view === 'split') return 'Split';
    return 'Preview';
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
    const [activeBlockId, setActiveBlockId] = useState<string>('');
    const [composerView, setComposerView] = useState<ComposerView>('split');
    const [activeTab, setActiveTab] = useState<WorkspaceTab>('compose');
    const [composeStep, setComposeStep] = useState<ComposeStep>('editor');

    const [recipientOptions, setRecipientOptions] = useState<RecipientOption[]>([]);
    const [selectedRecipientEmails, setSelectedRecipientEmails] = useState<string[]>([]);
    const [recipientSearch, setRecipientSearch] = useState('');
    const [manualRecipientsRaw, setManualRecipientsRaw] = useState('');
    const [customerAudienceCount, setCustomerAudienceCount] = useState(0);
    const [consignorAudienceCount, setConsignorAudienceCount] = useState(0);

    const [templateError, setTemplateError] = useState<string | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [sendSuccess, setSendSuccess] = useState<string | null>(null);

    const activeBlock = useMemo(
        () => blocks.find((block) => block.id === activeBlockId) || null,
        [blocks, activeBlockId]
    );

    const manualRecipientCount = useMemo(
        () => parseManualRecipients(manualRecipientsRaw).length,
        [manualRecipientsRaw]
    );

    const selectedRecipients = useMemo(
        () => recipientOptions.filter((recipient) => selectedRecipientEmails.includes(recipient.email)),
        [recipientOptions, selectedRecipientEmails]
    );

    const filteredRecipients = useMemo(() => {
        const query = recipientSearch.trim().toLowerCase();
        const base = query
            ? recipientOptions.filter((recipient) =>
                recipient.name.toLowerCase().includes(query) ||
                recipient.email.toLowerCase().includes(query)
            )
            : recipientOptions;

        return base.slice(0, 50);
    }, [recipientOptions, recipientSearch]);

    const totalRecipientCount = useMemo(() => {
        const manualRecipients = parseManualRecipients(manualRecipientsRaw);
        return dedupeValidEmails([...selectedRecipientEmails, ...manualRecipients]).length;
    }, [selectedRecipientEmails, manualRecipientsRaw]);

    const previewHtml = useMemo(
        () => buildEmailHtml({ subject: subject || 'Preview', previewText, blocks }),
        [subject, previewText, blocks]
    );

    const textVersion = useMemo(() => buildTextVersion(blocks), [blocks]);

    const wordCount = useMemo(
        () => textVersion.split(/\s+/).filter(Boolean).length,
        [textVersion]
    );

    const estimatedReadMinutes = useMemo(
        () => Math.max(1, Math.ceil(wordCount / 180)),
        [wordCount]
    );

    useEffect(() => {
        if (blocks.length === 0) {
            setActiveBlockId('');
            return;
        }

        if (!activeBlockId || !blocks.some((block) => block.id === activeBlockId)) {
            setActiveBlockId(blocks[0].id);
        }
    }, [blocks, activeBlockId]);

    const resetDraft = useCallback(() => {
        const starter = defaultBlock('text');
        setActiveTab('compose');
        setComposeStep('editor');
        setSelectedTemplateId('');
        setTemplateName(DEFAULT_TEMPLATE.templateName);
        setSubject(DEFAULT_TEMPLATE.subject);
        setPreviewText(DEFAULT_TEMPLATE.previewText);
        setFromName(DEFAULT_TEMPLATE.fromName);
        setFromEmail(DEFAULT_TEMPLATE.fromEmail);
        setReplyTo(DEFAULT_TEMPLATE.replyTo);
        setBlocks([starter]);
        setActiveBlockId(starter.id);
        setTemplateError(null);
        setSendError(null);
        setSendSuccess(null);
        setSelectedRecipientEmails([]);
        setRecipientSearch('');
        setManualRecipientsRaw('');
    }, []);

    const loadInitialData = useCallback(async () => {
        setIsLoading(true);

        const [templatesRes, campaignsRes, customersRes, consignorsRes] = await Promise.all([
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
                .select('id, name, email')
                .eq('accepts_marketing', true)
                .not('email', 'is', null),
            supabase
                .from('consignors')
                .select('id, name, email')
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

        const customerRows = customersRes.error
            ? []
            : (customersRes.data ?? []) as Array<{ id: string; name: string | null; email: string | null }>;
        const customerOptions: RecipientOption[] = customerRows
            .filter((row): row is { id: string; name: string | null; email: string } => Boolean(row.email))
            .map((row) => ({
                id: row.id,
                name: row.name?.trim() || 'Unnamed customer',
                email: row.email.trim().toLowerCase(),
                source: 'customer',
            }));

        const consignorRows = consignorsRes.error
            ? []
            : (consignorsRes.data ?? []) as Array<{ id: string; name: string | null; email: string | null }>;
        const consignorOptions: RecipientOption[] = consignorRows
            .filter((row): row is { id: string; name: string | null; email: string } => Boolean(row.email))
            .map((row) => ({
                id: row.id,
                name: row.name?.trim() || 'Unnamed consignor',
                email: row.email.trim().toLowerCase(),
                source: 'consignor',
            }));

        setCustomerAudienceCount(customerOptions.length);
        setConsignorAudienceCount(consignorOptions.length);
        setRecipientOptions(
            [...customerOptions, ...consignorOptions].sort((a, b) => a.name.localeCompare(b.name))
        );

        setIsLoading(false);
    }, []);

    useEffect(() => {
        void loadInitialData();
    }, [loadInitialData]);

    const loadTemplate = (templateId: string) => {
        const template = templates.find((item) => item.id === templateId);
        if (!template) return;

        const nextBlocks = template.blocks.length > 0 ? template.blocks : [defaultBlock('text')];

        setActiveTab('compose');
        setComposeStep('editor');
        setSelectedTemplateId(template.id);
        setTemplateName(template.name);
        setSubject(template.subject);
        setPreviewText(template.preview_text || '');
        setFromName(template.from_name || DEFAULT_TEMPLATE.fromName);
        setFromEmail(template.from_email || DEFAULT_TEMPLATE.fromEmail);
        setReplyTo(template.reply_to || '');
        setBlocks(nextBlocks);
        setActiveBlockId(nextBlocks[0]?.id || '');
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

    const insertBlock = (type: BlockType, index: number) => {
        const block = defaultBlock(type);
        setBlocks((prev) => {
            const next = [...prev];
            const safeIndex = clamp(index, 0, prev.length);
            next.splice(safeIndex, 0, block);
            return next;
        });
        setActiveBlockId(block.id);
    };

    const addBlock = (type: BlockType) => {
        insertBlock(type, blocks.length);
    };

    const updateBlock = (id: string, updater: (block: EmailBlock) => EmailBlock) => {
        setBlocks((prev) => prev.map((block) => (block.id === id ? updater(block) : block)));
    };

    const duplicateBlock = (id: string) => {
        let duplicatedId = '';
        setBlocks((prev) => {
            const idx = prev.findIndex((block) => block.id === id);
            if (idx < 0) return prev;
            const duplicate = { ...prev[idx], id: uid() };
            duplicatedId = duplicate.id;
            const next = [...prev];
            next.splice(idx + 1, 0, duplicate);
            return next;
        });

        if (duplicatedId) {
            setActiveBlockId(duplicatedId);
        }
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
        if (blocks.length === 1) return;

        let nextActive = activeBlockId;

        setBlocks((prev) => {
            if (prev.length === 1) return prev;

            const idx = prev.findIndex((block) => block.id === id);
            if (idx < 0) return prev;

            const next = prev.filter((block) => block.id !== id);
            if (next.length === 0) {
                nextActive = '';
            } else if (nextActive === id) {
                nextActive = next[Math.max(0, idx - 1)]?.id || next[0].id;
            }

            return next;
        });

        setActiveBlockId(nextActive);
    };

    const toggleRecipient = (email: string) => {
        setSelectedRecipientEmails((prev) =>
            prev.includes(email)
                ? prev.filter((value) => value !== email)
                : [...prev, email]
        );
    };

    const addRecipientGroup = (group: 'customers' | 'consignors' | 'all') => {
        const groupEmails = recipientOptions
            .filter((recipient) => {
                if (group === 'all') return true;
                if (group === 'customers') return recipient.source === 'customer';
                return recipient.source === 'consignor';
            })
            .map((recipient) => recipient.email);
        setSelectedRecipientEmails((prev) => dedupeValidEmails([...prev, ...groupEmails]));
    };

    const removeSelectedRecipient = (email: string) => {
        setSelectedRecipientEmails((prev) => prev.filter((value) => value !== email));
    };

    const continueToAudience = () => {
        setSendError(null);
        setSendSuccess(null);

        if (!subject.trim()) {
            setSendError('Subject is required before moving to recipients.');
            return;
        }

        if (blocks.length === 0) {
            setSendError('Add at least one content block before moving to recipients.');
            return;
        }

        setComposeStep('audience');
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
        const recipients = dedupeValidEmails([...selectedRecipientEmails, ...manualRecipients]);
        if (recipients.length === 0) {
            setSendError('Select at least one recipient by name or email before sending.');
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
                recipientSource: 'manual',
                manualRecipients: recipients,
                metadata: {
                    blockCount: blocks.length,
                    selectedRecipientCount: selectedRecipientEmails.length,
                    manualRecipientCount: manualRecipients.length,
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
                description="Build reusable templates and send polished campaigns to selected customers and consignors."
                actions={activeTab === 'compose' ? (
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={resetDraft}>New Template</Button>
                        <Button onClick={upsertTemplate} isLoading={isSavingTemplate}>Save Template</Button>
                        {composeStep === 'editor' ? (
                            <Button variant="success" onClick={continueToAudience}>Send...</Button>
                        ) : (
                            <>
                                <Button variant="secondary" onClick={() => setComposeStep('editor')}>Back to Editor</Button>
                                <Button variant="success" onClick={sendCampaign} isLoading={isSending}>Send Campaign</Button>
                            </>
                        )}
                    </div>
                ) : undefined}
            />

            <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
                <button
                    type="button"
                    onClick={() => setActiveTab('compose')}
                    className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-medium transition',
                        activeTab === 'compose'
                            ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                            : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                    )}
                >
                    Compose Campaign
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('history')}
                    className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-medium transition',
                        activeTab === 'history'
                            ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                            : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                    )}
                >
                    Previously Sent
                </button>
            </div>

            {activeTab === 'history' ? (
                <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Previously Sent Emails</p>
                    <div className="mt-3 space-y-2">
                        {campaigns.map((campaign) => (
                            <div key={campaign.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                                <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{campaign.subject}</p>
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
                </section>
            ) : (
                <section className={cn(
                    'grid gap-4',
                    composeStep === 'editor'
                        ? 'xl:grid-cols-[340px,minmax(0,1fr)]'
                        : 'xl:grid-cols-[380px,minmax(0,1fr)]'
                )}>
                    <div className="space-y-4">
                        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Templates</p>
                            <div className="mt-3 space-y-2">
                                <Select
                                    label="Load template"
                                    options={templates.map((template) => ({ value: template.id, label: template.name }))}
                                    placeholder="Select a saved template"
                                    value={selectedTemplateId}
                                    onChange={(event) => loadTemplate(event.target.value)}
                                />
                                <Input
                                    label="Template name"
                                    value={templateName}
                                    onChange={(event) => setTemplateName(event.target.value)}
                                />
                                {selectedTemplateId && (
                                    <Button variant="danger" onClick={archiveTemplate} isLoading={isSavingTemplate}>
                                        Archive Template
                                    </Button>
                                )}
                                {templateError && <p className="text-sm text-[var(--color-danger)]">{templateError}</p>}
                            </div>
                        </div>

                        {composeStep === 'editor' ? (
                            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Step 1: Build Email</p>
                                <p className="mt-2 text-sm text-[var(--color-foreground)]">
                                    Finish the content, then use <span className="font-semibold">Send...</span> in the header to choose recipients.
                                </p>
                                {sendError && <p className="mt-2 text-sm text-[var(--color-danger)]">{sendError}</p>}
                                {sendSuccess && <p className="mt-2 text-sm text-[var(--color-success)]">{sendSuccess}</p>}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Step 2: Choose Recipients</p>
                                <div className="mt-3 space-y-3">
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                        <Button variant="secondary" size="sm" onClick={() => addRecipientGroup('customers')}>
                                            Add Customers ({customerAudienceCount})
                                        </Button>
                                        <Button variant="secondary" size="sm" onClick={() => addRecipientGroup('consignors')}>
                                            Add Consignors ({consignorAudienceCount})
                                        </Button>
                                        <Button variant="secondary" size="sm" onClick={() => addRecipientGroup('all')}>
                                            Add Both ({customerAudienceCount + consignorAudienceCount})
                                        </Button>
                                    </div>

                                    <Input
                                        label="Search customers or consignors"
                                        placeholder="Search by name or email"
                                        value={recipientSearch}
                                        onChange={(event) => setRecipientSearch(event.target.value)}
                                        hint={`${selectedRecipientEmails.length} selected`}
                                    />

                                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-[var(--color-border)] p-2">
                                        {filteredRecipients.map((recipient) => {
                                            const checked = selectedRecipientEmails.includes(recipient.email);
                                            return (
                                                <label key={`${recipient.source}-${recipient.id}`} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--color-surface)]">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleRecipient(recipient.email)}
                                                        className="h-4 w-4"
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium text-[var(--color-foreground)]">{recipient.name}</p>
                                                        <p className="truncate text-xs text-[var(--color-muted)]">
                                                            {recipient.email} • {recipient.source}
                                                        </p>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                        {filteredRecipients.length === 0 && (
                                            <p className="px-2 py-4 text-sm text-[var(--color-muted)]">No matching recipients found.</p>
                                        )}
                                    </div>

                                    <div className="rounded-lg border border-[var(--color-border)] p-2">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Selected</p>
                                            <button
                                                type="button"
                                                className="text-xs text-[var(--color-muted)] underline"
                                                onClick={() => setSelectedRecipientEmails([])}
                                                disabled={selectedRecipientEmails.length === 0}
                                            >
                                                Clear
                                            </button>
                                        </div>
                                        <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                                            {selectedRecipients.map((recipient) => (
                                                <button
                                                    key={`selected-${recipient.source}-${recipient.id}`}
                                                    type="button"
                                                    onClick={() => removeSelectedRecipient(recipient.email)}
                                                    className="rounded-full border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-foreground)]"
                                                >
                                                    {recipient.name} ({recipient.source}) ×
                                                </button>
                                            ))}
                                            {selectedRecipients.length === 0 && (
                                                <p className="text-sm text-[var(--color-muted)]">No recipients selected yet.</p>
                                            )}
                                        </div>
                                    </div>

                                    <Textarea
                                        label="Additional email addresses (optional)"
                                        placeholder="one@example.com, two@example.com"
                                        value={manualRecipientsRaw}
                                        onChange={(event) => setManualRecipientsRaw(event.target.value)}
                                        hint={`${manualRecipientCount} typed • ${totalRecipientCount} total unique recipients`}
                                    />

                                    {sendSuccess && <p className="text-sm text-[var(--color-success)]">{sendSuccess}</p>}
                                    {sendError && <p className="text-sm text-[var(--color-danger)]">{sendError}</p>}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Envelope & Inbox</p>
                                    <p className="text-xs text-[var(--color-muted)]">
                                        {blocks.length} blocks • {wordCount} words • ~{estimatedReadMinutes} min read
                                    </p>
                                </div>
                                {composeStep === 'editor' && (
                                    <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
                                        {(['compose', 'split', 'preview'] as ComposerView[]).map((view) => (
                                            <button
                                                key={view}
                                                type="button"
                                                onClick={() => setComposerView(view)}
                                                className={cn(
                                                    'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                                                    composerView === view
                                                        ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                                                        : 'text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)]'
                                                )}
                                            >
                                                {viewToggleLabel(view)}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <Input
                                    label="Subject"
                                    value={subject}
                                    onChange={(event) => setSubject(event.target.value)}
                                    className="md:col-span-2"
                                />
                                <Input
                                    label="Preview text"
                                    value={previewText}
                                    onChange={(event) => setPreviewText(event.target.value)}
                                    className="md:col-span-2"
                                />
                                <Input label="From name" value={fromName} onChange={(event) => setFromName(event.target.value)} />
                                <Input label="From email" type="email" value={fromEmail} onChange={(event) => setFromEmail(event.target.value)} />
                                <Input label="Reply-to (optional)" type="email" value={replyTo} onChange={(event) => setReplyTo(event.target.value)} className="md:col-span-2" />
                            </div>

                            <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Inbox Preview</p>
                                <p className="mt-2 text-sm text-[var(--color-foreground)]">{fromName.trim() || DEFAULT_TEMPLATE.fromName} &lt;{fromEmail.trim() || DEFAULT_TEMPLATE.fromEmail}&gt;</p>
                                <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{subject.trim() || 'Your subject line appears here'}</p>
                                <p className="truncate text-sm text-[var(--color-foreground)]">{previewText.trim() || 'Preview text appears next to the subject in most inboxes.'}</p>
                            </div>
                        </div>

                        {composeStep === 'editor' ? (
                            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Visual Composer</p>
                                        <p className="text-xs text-[var(--color-muted)]">Edit directly inside each content block like a normal email editor.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {BLOCK_LIBRARY.map((option) => (
                                            <Button key={option.type} variant="secondary" size="sm" onClick={() => addBlock(option.type)}>
                                                + {option.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <div className={cn('mt-4 grid gap-4', composerView === 'split' && 'xl:grid-cols-2')}>
                                    {(composerView === 'compose' || composerView === 'split') && (
                                        <div className="space-y-4">
                                            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                                                <div className="mx-auto max-w-[640px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-sm">
                                                    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
                                                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Email Canvas</p>
                                                        <p className="text-sm text-[var(--color-foreground)]">
                                                            Click a block to tune style, duplicate, reorder, or delete.
                                                        </p>
                                                    </div>

                                                    <div className="space-y-2 p-3 md:p-5">
                                                        {blocks.map((block, index) => {
                                                            const isActive = block.id === activeBlockId;

                                                            return (
                                                                <div key={block.id} className="space-y-2">
                                                                    <div
                                                                        className={cn(
                                                                            'group relative rounded-xl border p-4 transition',
                                                                            isActive
                                                                                ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] ring-1 ring-[var(--color-primary)]/30'
                                                                                : 'border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)]/40'
                                                                        )}
                                                                        onClick={() => setActiveBlockId(block.id)}
                                                                        role="button"
                                                                        tabIndex={0}
                                                                        onKeyDown={(event) => {
                                                                            if (event.key === 'Enter' || event.key === ' ') {
                                                                                event.preventDefault();
                                                                                setActiveBlockId(block.id);
                                                                            }
                                                                        }}
                                                                    >
                                                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                                                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-foreground)]">
                                                                                {index + 1}. {blockLabel(block.type)}
                                                                            </p>
                                                                            <div className="flex flex-wrap gap-1.5">
                                                                                <button
                                                                                    type="button"
                                                                                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-xs text-[var(--color-foreground)] hover:bg-[var(--color-surface)]"
                                                                                    onClick={() => moveBlock(block.id, 'up')}
                                                                                >
                                                                                    Up
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-xs text-[var(--color-foreground)] hover:bg-[var(--color-surface)]"
                                                                                    onClick={() => moveBlock(block.id, 'down')}
                                                                                >
                                                                                    Down
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-xs text-[var(--color-foreground)] hover:bg-[var(--color-surface)]"
                                                                                    onClick={() => duplicateBlock(block.id)}
                                                                                >
                                                                                    Duplicate
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    className={cn(
                                                                                        'rounded-md border px-2 py-1 text-xs',
                                                                                        blocks.length === 1
                                                                                            ? 'border-[var(--color-border)] text-[var(--color-muted)]'
                                                                                            : 'border-[var(--color-danger)] text-[var(--color-danger)]'
                                                                                    )}
                                                                                    onClick={() => removeBlock(block.id)}
                                                                                    disabled={blocks.length === 1}
                                                                                >
                                                                                    Delete
                                                                                </button>
                                                                            </div>
                                                                        </div>

                                                                        {block.type === 'text' && (
                                                                            <div className={cn('space-y-2', textAlignClass(block.align))}>
                                                                                <input
                                                                                    value={block.heading}
                                                                                    onChange={(event) => updateBlock(
                                                                                        block.id,
                                                                                        (current) => current.type === 'text'
                                                                                            ? { ...current, heading: event.target.value }
                                                                                            : current
                                                                                    )}
                                                                                    placeholder="Heading"
                                                                                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold leading-tight text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-border)] focus:bg-[var(--color-surface)]"
                                                                                />
                                                                                <textarea
                                                                                    value={block.body}
                                                                                    onChange={(event) => updateBlock(
                                                                                        block.id,
                                                                                        (current) => current.type === 'text'
                                                                                            ? { ...current, body: event.target.value }
                                                                                            : current
                                                                                    )}
                                                                                    placeholder="Write your message here"
                                                                                    rows={4}
                                                                                    className="w-full resize-y rounded-md border border-transparent bg-transparent px-2 py-1 text-[15px] leading-7 text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-border)] focus:bg-[var(--color-surface)]"
                                                                                />
                                                                                <div className="flex flex-wrap gap-1.5">
                                                                                    {ALIGNMENTS.map((alignment) => (
                                                                                        <button
                                                                                            key={alignment}
                                                                                            type="button"
                                                                                            onClick={() => updateBlock(
                                                                                                block.id,
                                                                                                (current) => current.type === 'text'
                                                                                                    ? { ...current, align: alignment }
                                                                                                    : current
                                                                                            )}
                                                                                            className={cn(
                                                                                                'rounded-md border px-2 py-1 text-xs font-medium capitalize',
                                                                                                block.align === alignment
                                                                                                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                                                                                                    : 'border-[var(--color-border)] text-[var(--color-foreground)]'
                                                                                            )}
                                                                                        >
                                                                                            {alignment}
                                                                                        </button>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {block.type === 'image' && (
                                                                            <div className="space-y-3">
                                                                                <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-4">
                                                                                    {block.imageUrl.trim() ? (
                                                                                        <img
                                                                                            src={block.imageUrl}
                                                                                            alt={block.alt || 'Campaign image'}
                                                                                            className="mx-auto block h-auto max-w-full rounded-md"
                                                                                            style={{ width: `${clamp(block.widthPercent, 20, 100)}%` }}
                                                                                        />
                                                                                    ) : (
                                                                                        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-sm text-[var(--color-foreground)]">
                                                                                            Paste an image URL to display media in this block.
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                <input
                                                                                    value={block.imageUrl}
                                                                                    onChange={(event) => updateBlock(
                                                                                        block.id,
                                                                                        (current) => current.type === 'image'
                                                                                            ? { ...current, imageUrl: event.target.value }
                                                                                            : current
                                                                                    )}
                                                                                    placeholder="https://your-cdn/image.jpg"
                                                                                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                                                                                />
                                                                                <div className="grid gap-2 sm:grid-cols-[1fr,140px]">
                                                                                    <input
                                                                                        value={block.alt}
                                                                                        onChange={(event) => updateBlock(
                                                                                            block.id,
                                                                                            (current) => current.type === 'image'
                                                                                                ? { ...current, alt: event.target.value }
                                                                                                : current
                                                                                        )}
                                                                                        placeholder="Alt text"
                                                                                        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                                                                                    />
                                                                                    <input
                                                                                        type="number"
                                                                                        min={20}
                                                                                        max={100}
                                                                                        value={block.widthPercent}
                                                                                        onChange={(event) => {
                                                                                            const width = Number(event.target.value);
                                                                                            updateBlock(
                                                                                                block.id,
                                                                                                (current) => current.type === 'image'
                                                                                                    ? {
                                                                                                        ...current,
                                                                                                        widthPercent: Number.isFinite(width)
                                                                                                            ? clamp(Math.round(width), 20, 100)
                                                                                                            : 100,
                                                                                                    }
                                                                                                    : current
                                                                                            );
                                                                                        }}
                                                                                        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {block.type === 'button' && (
                                                                            <div className={cn('space-y-3', textAlignClass(block.align))}>
                                                                                <div>
                                                                                    <div
                                                                                        className="inline-flex rounded-lg px-4 py-2"
                                                                                        style={{
                                                                                            backgroundColor: block.backgroundColor,
                                                                                            color: block.textColor,
                                                                                        }}
                                                                                    >
                                                                                        <input
                                                                                            value={block.label}
                                                                                            onChange={(event) => updateBlock(
                                                                                                block.id,
                                                                                                (current) => current.type === 'button'
                                                                                                    ? { ...current, label: event.target.value }
                                                                                                    : current
                                                                                            )}
                                                                                            placeholder="Button label"
                                                                                            className="w-full min-w-[120px] bg-transparent text-center text-sm font-semibold outline-none"
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                                <input
                                                                                    value={block.url}
                                                                                    onChange={(event) => updateBlock(
                                                                                        block.id,
                                                                                        (current) => current.type === 'button'
                                                                                            ? { ...current, url: event.target.value }
                                                                                            : current
                                                                                    )}
                                                                                    placeholder="https://your-link"
                                                                                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                                                                                />
                                                                                <div className="grid gap-2 sm:grid-cols-[1fr,auto,auto] sm:items-center">
                                                                                    <div className="flex flex-wrap gap-1.5">
                                                                                        {ALIGNMENTS.map((alignment) => (
                                                                                            <button
                                                                                                key={alignment}
                                                                                                type="button"
                                                                                                onClick={() => updateBlock(
                                                                                                    block.id,
                                                                                                    (current) => current.type === 'button'
                                                                                                        ? { ...current, align: alignment }
                                                                                                        : current
                                                                                                )}
                                                                                                className={cn(
                                                                                                    'rounded-md border px-2 py-1 text-xs font-medium capitalize',
                                                                                                    block.align === alignment
                                                                                                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                                                                                                        : 'border-[var(--color-border)] text-[var(--color-foreground)]'
                                                                                                )}
                                                                                            >
                                                                                                {alignment}
                                                                                            </button>
                                                                                        ))}
                                                                                    </div>
                                                                                    <label className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-xs text-[var(--color-foreground)]">
                                                                                        Fill
                                                                                        <input
                                                                                            type="color"
                                                                                            value={block.backgroundColor}
                                                                                            onChange={(event) => updateBlock(
                                                                                                block.id,
                                                                                                (current) => current.type === 'button'
                                                                                                    ? { ...current, backgroundColor: event.target.value }
                                                                                                    : current
                                                                                            )}
                                                                                            className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
                                                                                        />
                                                                                    </label>
                                                                                    <label className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-xs text-[var(--color-foreground)]">
                                                                                        Text
                                                                                        <input
                                                                                            type="color"
                                                                                            value={block.textColor}
                                                                                            onChange={(event) => updateBlock(
                                                                                                block.id,
                                                                                                (current) => current.type === 'button'
                                                                                                    ? { ...current, textColor: event.target.value }
                                                                                                    : current
                                                                                            )}
                                                                                            className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
                                                                                        />
                                                                                    </label>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {block.type === 'divider' && (
                                                                            <div className="space-y-3">
                                                                                <div
                                                                                    className="h-px w-full"
                                                                                    style={{ backgroundColor: block.color }}
                                                                                />
                                                                                <div className="flex items-center justify-end gap-2">
                                                                                    <input
                                                                                        value={block.color}
                                                                                        onChange={(event) => updateBlock(
                                                                                            block.id,
                                                                                            (current) => current.type === 'divider'
                                                                                                ? { ...current, color: event.target.value }
                                                                                                : current
                                                                                        )}
                                                                                        className="w-28 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-xs text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                                                                                    />
                                                                                    <input
                                                                                        type="color"
                                                                                        value={block.color}
                                                                                        onChange={(event) => updateBlock(
                                                                                            block.id,
                                                                                            (current) => current.type === 'divider'
                                                                                                ? { ...current, color: event.target.value }
                                                                                                : current
                                                                                        )}
                                                                                        className="h-8 w-8 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-0"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {block.type === 'spacer' && (
                                                                            <div className="space-y-3">
                                                                                <div
                                                                                    className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
                                                                                    style={{ height: clamp(block.height, 8, 120) }}
                                                                                />
                                                                                <div className="flex items-center gap-3">
                                                                                    <input
                                                                                        type="range"
                                                                                        min={8}
                                                                                        max={120}
                                                                                        value={block.height}
                                                                                        onChange={(event) => {
                                                                                            const height = Number(event.target.value);
                                                                                            updateBlock(
                                                                                                block.id,
                                                                                                (current) => current.type === 'spacer'
                                                                                                    ? {
                                                                                                        ...current,
                                                                                                        height: Number.isFinite(height)
                                                                                                            ? clamp(Math.round(height), 8, 120)
                                                                                                            : 24,
                                                                                                    }
                                                                                                    : current
                                                                                            );
                                                                                        }}
                                                                                        className="w-full"
                                                                                    />
                                                                                    <input
                                                                                        type="number"
                                                                                        min={8}
                                                                                        max={120}
                                                                                        value={block.height}
                                                                                        onChange={(event) => {
                                                                                            const height = Number(event.target.value);
                                                                                            updateBlock(
                                                                                                block.id,
                                                                                                (current) => current.type === 'spacer'
                                                                                                    ? {
                                                                                                        ...current,
                                                                                                        height: Number.isFinite(height)
                                                                                                            ? clamp(Math.round(height), 8, 120)
                                                                                                            : 24,
                                                                                                    }
                                                                                                    : current
                                                                                            );
                                                                                        }}
                                                                                        className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-xs text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)]"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    <div className="flex flex-wrap justify-center gap-1.5">
                                                                        {BLOCK_LIBRARY.map((option) => (
                                                                            <button
                                                                                key={`${block.id}-${option.type}-after`}
                                                                                type="button"
                                                                                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-foreground)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                                                                                onClick={() => insertBlock(option.type, index + 1)}
                                                                            >
                                                                                + {option.label}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Selected Block</p>
                                                {activeBlock ? (
                                                    <div className="mt-2 space-y-2 text-sm text-[var(--color-foreground)]">
                                                        <p>
                                                            <span className="font-semibold">Type:</span> {blockLabel(activeBlock.type)}
                                                        </p>
                                                        <p>
                                                            <span className="font-semibold">Position:</span> #{blocks.findIndex((block) => block.id === activeBlock.id) + 1} of {blocks.length}
                                                        </p>
                                                        <div className="flex flex-wrap gap-2">
                                                            <Button variant="secondary" size="sm" onClick={() => duplicateBlock(activeBlock.id)}>
                                                                Duplicate
                                                            </Button>
                                                            <Button variant="secondary" size="sm" onClick={() => moveBlock(activeBlock.id, 'up')}>
                                                                Move Up
                                                            </Button>
                                                            <Button variant="secondary" size="sm" onClick={() => moveBlock(activeBlock.id, 'down')}>
                                                                Move Down
                                                            </Button>
                                                            <Button
                                                                variant="danger"
                                                                size="sm"
                                                                onClick={() => removeBlock(activeBlock.id)}
                                                                disabled={blocks.length === 1}
                                                            >
                                                                Delete
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="mt-2 text-sm text-[var(--color-foreground)]">Select a block in the canvas to see quick actions.</p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {(composerView === 'preview' || composerView === 'split') && (
                                        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Rendered Preview</p>
                                            <iframe
                                                title="email-preview"
                                                srcDoc={previewHtml}
                                                className="mt-3 h-[860px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Final Review</p>
                                <p className="mt-2 text-sm text-[var(--color-foreground)]">
                                    Confirm recipients and content preview, then click <span className="font-semibold">Send Campaign</span> in the header.
                                </p>
                                <p className="mt-2 text-sm text-[var(--color-muted)]">
                                    {totalRecipientCount} total unique recipients selected.
                                </p>
                                <iframe
                                    title="email-preview-audience-step"
                                    srcDoc={previewHtml}
                                    className="mt-3 h-[780px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
                                />
                            </div>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}

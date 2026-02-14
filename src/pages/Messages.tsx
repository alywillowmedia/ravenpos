import { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { cn } from '../lib/utils';
import type { useMessaging } from '../hooks/useMessaging';

type MessagingController = ReturnType<typeof useMessaging>;
interface MessagesOutletContext {
    messaging: MessagingController;
}

export function Messages() {
    const { messaging } = useOutletContext<MessagesOutletContext>();
    const [searchParams] = useSearchParams();
    const [draft, setDraft] = useState('');
    const [startTargetKey, setStartTargetKey] = useState('');
    const [isStartOpen, setIsStartOpen] = useState(false);
    const [view, setView] = useState<'list' | 'chat'>('list');
    const [actionError, setActionError] = useState<string | null>(null);

    const threadFromQuery = searchParams.get('thread');

    useEffect(() => {
        if (!threadFromQuery) return;
        messaging.setActiveThreadFromQuery(threadFromQuery);
        setView('chat');
    }, [messaging, threadFromQuery]);

    const activeThread = useMemo(
        () => messaging.threads.find((thread) => thread.thread.id === messaging.activeThreadId) ?? null,
        [messaging.activeThreadId, messaging.threads]
    );

    const directOptions = useMemo(
        () => messaging.directOptions.map((option) => ({ value: option.key, label: option.label })),
        [messaging.directOptions]
    );

    const startConversation = async () => {
        setActionError(null);

        if (!startTargetKey) {
            setActionError('Choose someone to start a direct message.');
            return;
        }

        const target = messaging.directOptions.find((option) => option.key === startTargetKey);
        if (!target) {
            setActionError('Unable to find that user.');
            return;
        }

        const result = await messaging.ensureDirectThread(target);
        if (result.error) {
            setActionError(result.error);
            return;
        }

        if (result.threadId) {
            messaging.setActiveThread(result.threadId);
            await messaging.markThreadRead(result.threadId);
            setView('chat');
        }

        setStartTargetKey('');
        setIsStartOpen(false);
    };

    const send = async () => {
        const result = await messaging.sendMessage(draft);
        if (result.error) {
            setActionError(result.error);
            return;
        }

        setDraft('');
        setActionError(null);
    };

    const showList = view === 'list';
    const showChat = view === 'chat';

    return (
        <div className="space-y-6">
            <Header
                title="Messages"
                description="Direct messages and role-based group chats for admins, consignors, and employees."
            />

            <div className="grid gap-4">
                {showList && (
                <section className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
                    <div className="border-b border-[var(--color-border)] px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[var(--color-foreground)]">Conversations</p>
                            <Button size="sm" onClick={() => setIsStartOpen((prev) => !prev)}>
                                Start New
                            </Button>
                        </div>
                    </div>

                    <div className="p-2">
                        {isStartOpen && (
                            <div className="mb-2 space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
                                <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">New direct chat</p>
                                <div className="space-y-2">
                                    <Select
                                        options={directOptions}
                                        value={startTargetKey}
                                        onChange={(event) => setStartTargetKey(event.target.value)}
                                        placeholder="Choose a person"
                                    />
                                    <div className="flex gap-2">
                                        <Button onClick={startConversation} size="sm" className="flex-1">
                                            Start
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => {
                                                setIsStartOpen(false);
                                                setStartTargetKey('');
                                            }}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
                            {messaging.threads.map((thread) => (
                                <button
                                    key={thread.thread.id}
                                    type="button"
                                    onClick={async () => {
                                        messaging.setActiveThread(thread.thread.id);
                                        await messaging.markThreadRead(thread.thread.id);
                                        setView('chat');
                                    }}
                                    className={cn(
                                        'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                                        messaging.activeThreadId === thread.thread.id
                                            ? 'bg-[var(--color-info-bg)]'
                                            : 'hover:bg-[var(--color-surface)]'
                                    )}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className={cn(
                                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                            messaging.activeThreadId === thread.thread.id
                                                ? 'bg-[var(--color-primary)] text-white'
                                                : 'bg-[var(--color-surface)] text-[var(--color-muted)]'
                                        )}>
                                            {getThreadInitials(thread.title)}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">{thread.title}</p>
                                                <p className="shrink-0 text-[11px] text-[var(--color-muted)]">{shortTime(thread.lastMessageAt)}</p>
                                            </div>
                                            <p className="truncate text-xs text-[var(--color-muted)]">
                                                {thread.lastMessagePreview || 'No messages yet'}
                                            </p>
                                        </div>

                                        {thread.unreadCount > 0 && (
                                            <span className="shrink-0 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
                                                {thread.unreadCount}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}

                            {!messaging.isLoadingThreads && messaging.threads.length === 0 && (
                                <p className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
                                    No conversations available yet.
                                </p>
                            )}
                        </div>
                    </div>
                </section>
                )}

                {showChat && (
                <section className="flex min-h-[560px] flex-col rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
                    <div className="border-b border-[var(--color-border)] px-4 py-3">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setView('list')}
                                className="shrink-0 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-foreground)]"
                            >
                                Back
                            </button>
                            {activeThread && (
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-white">
                                    {getThreadInitials(activeThread.title)}
                                </div>
                            )}
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[var(--color-foreground)]">
                                    {activeThread?.title || 'Select a conversation'}
                                </p>
                                {activeThread?.lastMessageAt && (
                                    <p className="text-xs text-[var(--color-muted)]">
                                        Last activity: {messaging.formatDateTime(activeThread.lastMessageAt)}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                        {messaging.activeMessages.map((message) => (
                            <div
                                key={message.id}
                                className={cn(
                                    'max-w-[80%] rounded-xl px-3 py-2',
                                    message.isOwn
                                        ? 'ml-auto bg-[var(--color-primary)] text-white'
                                        : 'bg-[var(--color-surface)] text-[var(--color-foreground)]'
                                )}
                            >
                                <p className={cn('text-[11px]', message.isOwn ? 'text-white/80' : 'text-[var(--color-muted)]')}>
                                    {message.senderLabel}
                                </p>
                                <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
                                <p className={cn('mt-1 text-[11px]', message.isOwn ? 'text-white/80' : 'text-[var(--color-muted)]')}>
                                    {messaging.formatDateTime(message.created_at)}
                                </p>
                            </div>
                        ))}

                        {messaging.activeThreadId && !messaging.isLoadingMessages && messaging.activeMessages.length === 0 && (
                            <p className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
                                No messages yet. Say hello.
                            </p>
                        )}

                        {!messaging.activeThreadId && (
                            <p className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
                                Pick a conversation to start messaging.
                            </p>
                        )}
                    </div>

                    <div className="border-t border-[var(--color-border)] p-3">
                        {actionError && (
                            <p className="mb-2 text-sm text-[var(--color-danger)]">{actionError}</p>
                        )}
                        <div className="flex gap-2">
                            <Input
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                        event.preventDefault();
                                        void send();
                                    }
                                }}
                                placeholder={messaging.activeThreadId ? 'Type a message...' : 'Choose a conversation first'}
                                disabled={!messaging.activeThreadId}
                                maxLength={2000}
                            />
                            <Button onClick={send} disabled={!messaging.activeThreadId || !draft.trim()}>
                                Send
                            </Button>
                        </div>
                    </div>
                </section>
                )}
            </div>
        </div>
    );
}

function getThreadInitials(title: string) {
    const words = title.trim().split(/\s+/);
    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

function shortTime(value: string | null) {
    if (!value) return '';
    const date = new Date(value);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    if (diff < oneDay) {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

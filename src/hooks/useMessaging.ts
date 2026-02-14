import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useEmployee } from '../contexts/EmployeeContext';
import type {
    ChatActor,
    ChatMessage,
    ChatMessageView,
    ChatParticipantOption,
    ChatThread,
    ChatThreadMember,
    ChatThreadSummary,
    MessageToast,
    MessagingState,
} from '../types/messaging';

type UserRow = {
    id: string;
    email: string;
    full_name: string | null;
    role: 'admin' | 'vendor';
    consignor_id: string | null;
};

type EmployeeRow = {
    id: string;
    name: string;
};

type ConsignorRow = {
    id: string;
    name: string;
};

type AdminContactRow = {
    id: string;
    email: string;
    full_name: string | null;
};

interface UseMessagingOptions {
    portalBasePath: '/admin' | '/vendor' | '/employee';
}

const MAX_MESSAGE_LENGTH = 2000;
const TOAST_LIFETIME_MS = 4500;
const NOTIFICATION_POLL_INTERVAL_MS = 8000;

function actorKey(actor: ChatActor): string {
    return actor.type === 'user' ? `user:${actor.id}` : `employee:${actor.id}`;
}

function messageIsOwn(actor: ChatActor, message: ChatMessage): boolean {
    if (actor.type === 'user') {
        return message.sender_type === 'user' && message.sender_user_id === actor.id;
    }
    return message.sender_type === 'employee' && message.sender_employee_id === actor.id;
}

function formatActorLabel(actor: ChatActor): string {
    if (actor.type === 'user') {
        return actor.role === 'admin' ? 'Admin' : 'Consignor';
    }
    return 'Employee';
}

function formatDateTime(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function useMessaging({ portalBasePath }: UseMessagingOptions) {
    const location = useLocation();
    const navigate = useNavigate();
    const { userRecord } = useAuth();
    const { employee } = useEmployee();

    const [state, setState] = useState<MessagingState>({
        actor: null,
        threads: [],
        activeThreadId: null,
        activeMessages: [],
        unreadCount: 0,
        unreadThreads: [],
        directOptions: [],
        toasts: [],
        isLoadingThreads: false,
        isLoadingMessages: false,
    });

    const actor = useMemo<ChatActor | null>(() => {
        if (userRecord) {
            return {
                type: 'user',
                id: userRecord.id,
                role: userRecord.role,
                consignorId: userRecord.consignor_id,
            };
        }

        if (employee) {
            return {
                type: 'employee',
                id: employee.id,
            };
        }

        return null;
    }, [employee, userRecord]);

    const threadIdsRef = useRef<Set<string>>(new Set());
    const activeThreadIdRef = useRef<string | null>(null);
    const threadsRef = useRef<ChatThreadSummary[]>([]);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const lastToastKeyRef = useRef<string>('');

    const clearToasts = useCallback(() => {
        setState((prev) => ({ ...prev, toasts: [] }));
    }, []);

    const removeToast = useCallback((toastId: string) => {
        setState((prev) => ({
            ...prev,
            toasts: prev.toasts.filter((toast) => toast.id !== toastId),
        }));
    }, []);

    const resolveUserLabels = useCallback(async (users: UserRow[]) => {
        const consignorIds = Array.from(new Set(users.map((user) => user.consignor_id).filter((id): id is string => Boolean(id))));

        const consignorNameMap = new Map<string, string>();
        if (consignorIds.length > 0) {
            const { data: consignors } = await supabase
                .from('consignors')
                .select('id, name')
                .in('id', consignorIds);

            ((consignors ?? []) as ConsignorRow[]).forEach((consignor) => {
                consignorNameMap.set(consignor.id, consignor.name);
            });
        }

        const userLabelMap = new Map<string, string>();
        users.forEach((user) => {
            if (user.role === 'admin') {
                userLabelMap.set(user.id, user.full_name?.trim() || user.email || 'Admin');
            } else {
                const consignorName = user.consignor_id ? consignorNameMap.get(user.consignor_id) : null;
                userLabelMap.set(user.id, consignorName || user.full_name?.trim() || user.email || 'Consignor');
            }
        });

        return userLabelMap;
    }, []);

    const loadAdminContacts = useCallback(async (): Promise<AdminContactRow[]> => {
        const { data, error } = await supabase.rpc('get_chat_admin_contacts');
        if (error) {
            console.error('Failed to load admin chat contacts:', error);
            return [];
        }
        return (data ?? []) as AdminContactRow[];
    }, []);

    const buildParticipantDirectory = useCallback(async (
        members: ChatThreadMember[],
        messages: ChatMessage[]
    ) => {
        const userIds = new Set<string>();
        const employeeIds = new Set<string>();

        members.forEach((member) => {
            if (member.user_id) userIds.add(member.user_id);
            if (member.employee_id) employeeIds.add(member.employee_id);
        });

        messages.forEach((message) => {
            if (message.sender_user_id) userIds.add(message.sender_user_id);
            if (message.sender_employee_id) employeeIds.add(message.sender_employee_id);
        });

        const userLabelMap = new Map<string, string>();
        if (userIds.size > 0) {
            const [{ data: users }, adminContacts] = await Promise.all([
                supabase
                    .from('users')
                    .select('id, email, full_name, role, consignor_id')
                    .in('id', Array.from(userIds)),
                loadAdminContacts(),
            ]);

            const labels = await resolveUserLabels((users ?? []) as UserRow[]);
            labels.forEach((value, key) => userLabelMap.set(key, value));

            adminContacts.forEach((admin) => {
                if (!userIds.has(admin.id)) return;
                userLabelMap.set(admin.id, admin.full_name?.trim() || admin.email || 'Admin');
            });
        }

        const employeeLabelMap = new Map<string, string>();
        if (employeeIds.size > 0) {
            const { data: employeesData } = await supabase
                .from('employees')
                .select('id, name')
                .in('id', Array.from(employeeIds));

            ((employeesData ?? []) as EmployeeRow[]).forEach((employeeRow) => {
                employeeLabelMap.set(employeeRow.id, employeeRow.name);
            });
        }

        return { userLabelMap, employeeLabelMap };
    }, [loadAdminContacts, resolveUserLabels]);

    const loadDirectOptions = useCallback(async (currentActor: ChatActor) => {
        if (currentActor.type === 'employee') {
            const data = await loadAdminContacts();

            const options = data.map((row) => ({
                key: `user:${row.id}`,
                memberType: 'user' as const,
                id: row.id,
                label: row.full_name?.trim() || row.email || 'Admin',
            }));
            setState((prev) => ({ ...prev, directOptions: options }));
            return;
        }

        if (currentActor.role === 'admin') {
            const [{ data: users }, { data: employeesData }, { data: consignors }] = await Promise.all([
                supabase
                    .from('users')
                    .select('id, role, email, full_name, consignor_id')
                    .neq('id', currentActor.id)
                    .order('email'),
                supabase
                    .from('employees')
                    .select('id, name')
                    .eq('is_active', true)
                    .order('name'),
                supabase
                    .from('consignors')
                    .select('id, name'),
            ]);

            const consignorMap = new Map<string, string>();
            ((consignors ?? []) as ConsignorRow[]).forEach((consignor) => {
                consignorMap.set(consignor.id, consignor.name);
            });

            const userOptions = ((users ?? []) as UserRow[]).map((row) => ({
                key: `user:${row.id}`,
                memberType: 'user' as const,
                id: row.id,
                label: row.role === 'vendor'
                    ? (row.consignor_id ? consignorMap.get(row.consignor_id) || row.email : row.email)
                    : (row.full_name?.trim() || row.email),
            }));

            const employeeOptions = ((employeesData ?? []) as EmployeeRow[]).map((row) => ({
                key: `employee:${row.id}`,
                memberType: 'employee' as const,
                id: row.id,
                label: `${row.name} (Employee)`,
            }));

            setState((prev) => ({ ...prev, directOptions: [...userOptions, ...employeeOptions] }));
            return;
        }

        const data = await loadAdminContacts();

        const options = data.map((row) => ({
            key: `user:${row.id}`,
            memberType: 'user' as const,
            id: row.id,
            label: row.full_name?.trim() || row.email || 'Admin',
        }));
        setState((prev) => ({ ...prev, directOptions: options }));
    }, [loadAdminContacts]);

    const loadThreads = useCallback(async (currentActor: ChatActor, keepActiveSelection: boolean) => {
        setState((prev) => ({ ...prev, isLoadingThreads: true }));

        const membershipQuery = supabase
            .from('chat_thread_members')
            .select('id, thread_id, member_type, user_id, employee_id, unread_count, last_read_at');

        const { data: rawMemberships, error: membershipError } = currentActor.type === 'user'
            ? await membershipQuery.eq('member_type', 'user').eq('user_id', currentActor.id)
            : await membershipQuery.eq('member_type', 'employee').eq('employee_id', currentActor.id);

        if (membershipError) {
            console.error('Failed to load memberships:', membershipError);
            setState((prev) => ({
                ...prev,
                threads: [],
                unreadCount: 0,
                unreadThreads: [],
                isLoadingThreads: false,
            }));
            return;
        }

        const memberships = (rawMemberships ?? []) as ChatThreadMember[];
        const threadIds = memberships.map((membership) => membership.thread_id);

        if (threadIds.length === 0) {
            threadIdsRef.current = new Set();
            setState((prev) => ({
                ...prev,
                threads: [],
                activeThreadId: keepActiveSelection ? prev.activeThreadId : null,
                activeMessages: keepActiveSelection ? prev.activeMessages : [],
                unreadCount: 0,
                unreadThreads: [],
                isLoadingThreads: false,
            }));
            return;
        }

        threadIdsRef.current = new Set(threadIds);

        const [{ data: rawThreads }, { data: rawAllMembers }, { data: rawMessages }] = await Promise.all([
            supabase
                .from('chat_threads')
                .select('id, thread_type, title, system_key, direct_key, last_message_at, updated_at')
                .in('id', threadIds),
            supabase
                .from('chat_thread_members')
                .select('id, thread_id, member_type, user_id, employee_id, unread_count, last_read_at')
                .in('thread_id', threadIds),
            supabase
                .from('chat_messages')
                .select('id, thread_id, sender_type, sender_user_id, sender_employee_id, body, created_at')
                .in('thread_id', threadIds)
                .order('created_at', { ascending: false })
                .limit(800),
        ]);

        const threads = (rawThreads ?? []) as ChatThread[];
        const allMembers = (rawAllMembers ?? []) as ChatThreadMember[];
        const messages = (rawMessages ?? []) as ChatMessage[];

        const latestByThread = new Map<string, ChatMessage>();
        messages.forEach((message) => {
            if (!latestByThread.has(message.thread_id)) {
                latestByThread.set(message.thread_id, message);
            }
        });

        const { userLabelMap, employeeLabelMap } = await buildParticipantDirectory(allMembers, messages);

        const membersByThread = new Map<string, ChatThreadMember[]>();
        allMembers.forEach((member) => {
            const existing = membersByThread.get(member.thread_id) ?? [];
            existing.push(member);
            membersByThread.set(member.thread_id, existing);
        });

        const membershipByThread = new Map<string, ChatThreadMember>();
        memberships.forEach((member) => membershipByThread.set(member.thread_id, member));

        const summaries: ChatThreadSummary[] = threads.map((thread) => {
            const myMembership = membershipByThread.get(thread.id);
            const threadMembers = membersByThread.get(thread.id) ?? [];
            const lastMessage = latestByThread.get(thread.id);

            const title = (() => {
                if (thread.thread_type === 'group') {
                    return thread.title || 'Group chat';
                }

                const peer = threadMembers.find((member) => {
                    if (currentActor.type === 'user' && member.member_type === 'user' && member.user_id === currentActor.id) {
                        return false;
                    }
                    if (currentActor.type === 'employee' && member.member_type === 'employee' && member.employee_id === currentActor.id) {
                        return false;
                    }
                    return true;
                });

                if (!peer) return thread.title || 'Direct message';
                if (peer.member_type === 'user' && peer.user_id) {
                    return userLabelMap.get(peer.user_id) || 'User';
                }
                if (peer.member_type === 'employee' && peer.employee_id) {
                    return employeeLabelMap.get(peer.employee_id) || 'Employee';
                }
                return thread.title || 'Direct message';
            })();

            const lastSenderLabel = (() => {
                if (!lastMessage) return null;
                if (lastMessage.sender_type === 'user' && lastMessage.sender_user_id) {
                    return userLabelMap.get(lastMessage.sender_user_id) || 'User';
                }
                if (lastMessage.sender_type === 'employee' && lastMessage.sender_employee_id) {
                    return employeeLabelMap.get(lastMessage.sender_employee_id) || 'Employee';
                }
                return null;
            })();

            return {
                thread,
                title,
                unreadCount: myMembership?.unread_count ?? 0,
                lastMessagePreview: lastMessage?.body ?? '',
                lastMessageAt: lastMessage?.created_at ?? thread.last_message_at,
                lastSenderLabel,
            };
        }).sort((a, b) => {
            const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return bTime - aTime;
        });

        const unreadCount = summaries.reduce((acc, summary) => acc + summary.unreadCount, 0);
        const unreadThreads = summaries.filter((summary) => summary.unreadCount > 0);

        setState((prev) => ({
            ...prev,
            activeThreadId: (() => {
                if (keepActiveSelection && prev.activeThreadId) {
                    const stillExists = summaries.some((summary) => summary.thread.id === prev.activeThreadId);
                    if (stillExists) return prev.activeThreadId;
                }
                return summaries[0]?.thread.id ?? null;
            })(),
            actor: currentActor,
            threads: summaries,
            unreadCount,
            unreadThreads,
            isLoadingThreads: false,
        }));
    }, [buildParticipantDirectory]);

    const loadMessages = useCallback(async (currentActor: ChatActor, threadId: string | null) => {
        if (!threadId) {
            setState((prev) => ({ ...prev, activeMessages: [], isLoadingMessages: false }));
            return;
        }

        setState((prev) => ({ ...prev, isLoadingMessages: true }));

        const { data: rawMessages, error } = await supabase
            .from('chat_messages')
            .select('id, thread_id, sender_type, sender_user_id, sender_employee_id, body, created_at')
            .eq('thread_id', threadId)
            .order('created_at', { ascending: true })
            .limit(400);

        if (error) {
            console.error('Failed to load messages:', error);
            setState((prev) => ({ ...prev, activeMessages: [], isLoadingMessages: false }));
            return;
        }

        const messages = (rawMessages ?? []) as ChatMessage[];

        const { data: rawMembers } = await supabase
            .from('chat_thread_members')
            .select('id, thread_id, member_type, user_id, employee_id, unread_count, last_read_at')
            .eq('thread_id', threadId);

        const members = (rawMembers ?? []) as ChatThreadMember[];
        const { userLabelMap, employeeLabelMap } = await buildParticipantDirectory(members, messages);

        const messageViews: ChatMessageView[] = messages.map((message) => {
            let senderLabel = 'Unknown';

            if (message.sender_type === 'user' && message.sender_user_id) {
                senderLabel = userLabelMap.get(message.sender_user_id) || 'User';
            }
            if (message.sender_type === 'employee' && message.sender_employee_id) {
                senderLabel = employeeLabelMap.get(message.sender_employee_id) || 'Employee';
            }

            return {
                ...message,
                senderLabel,
                isOwn: messageIsOwn(currentActor, message),
            };
        });

        setState((prev) => ({
            ...prev,
            activeMessages: messageViews,
            isLoadingMessages: false,
        }));
    }, [buildParticipantDirectory]);

    const markThreadRead = useCallback(async (threadId: string) => {
        if (!actor) return;

        const now = new Date().toISOString();
        if (actor.type === 'user') {
            await supabase
                .from('chat_thread_members')
                .update({ unread_count: 0, last_read_at: now })
                .eq('thread_id', threadId)
                .eq('member_type', 'user')
                .eq('user_id', actor.id);
        } else {
            await supabase
                .from('chat_thread_members')
                .update({ unread_count: 0, last_read_at: now })
                .eq('thread_id', threadId)
                .eq('member_type', 'employee')
                .eq('employee_id', actor.id);
        }

        setState((prev) => {
            const updatedThreads = prev.threads.map((summary) => (
                summary.thread.id === threadId
                    ? { ...summary, unreadCount: 0 }
                    : summary
            ));
            return {
                ...prev,
                threads: updatedThreads,
                unreadCount: updatedThreads.reduce((acc, summary) => acc + summary.unreadCount, 0),
                unreadThreads: updatedThreads.filter((summary) => summary.unreadCount > 0),
            };
        });
    }, [actor]);

    const setActiveThread = useCallback((threadId: string) => {
        setState((prev) => ({ ...prev, activeThreadId: threadId }));
    }, []);

    const sendMessage = useCallback(async (body: string) => {
        if (!actor || !state.activeThreadId) {
            return { error: 'No active conversation selected.' };
        }

        const trimmed = body.trim();
        if (!trimmed) {
            return { error: 'Message cannot be empty.' };
        }
        if (trimmed.length > MAX_MESSAGE_LENGTH) {
            return { error: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.` };
        }

        const payload = actor.type === 'user'
            ? {
                thread_id: state.activeThreadId,
                sender_type: 'user',
                sender_user_id: actor.id,
                body: trimmed,
            }
            : {
                thread_id: state.activeThreadId,
                sender_type: 'employee',
                sender_employee_id: actor.id,
                body: trimmed,
            };

        const { error } = await supabase
            .from('chat_messages')
            .insert(payload);

        if (error) {
            return { error: error.message };
        }

        await loadMessages(actor, state.activeThreadId);
        await markThreadRead(state.activeThreadId);
        await loadThreads(actor, true);

        return { error: null };
    }, [actor, loadMessages, loadThreads, markThreadRead, state.activeThreadId]);

    const ensureDirectThread = useCallback(async (option: ChatParticipantOption) => {
        if (!actor) {
            return { threadId: null, error: 'Not authenticated.' };
        }

        const { data: threadId, error } = await supabase.rpc('create_or_get_direct_thread', {
            p_actor_member_type: actor.type,
            p_actor_user_id: actor.type === 'user' ? actor.id : null,
            p_actor_employee_id: actor.type === 'employee' ? actor.id : null,
            p_peer_member_type: option.memberType,
            p_peer_user_id: option.memberType === 'user' ? option.id : null,
            p_peer_employee_id: option.memberType === 'employee' ? option.id : null,
        });

        if (error || !threadId) {
            return { threadId: null, error: error?.message || 'Failed to create conversation.' };
        }

        await loadThreads(actor, true);
        setState((prev) => ({ ...prev, activeThreadId: threadId }));

        return { threadId, error: null };
    }, [actor, loadThreads]);

    const openThreadFromNotification = useCallback((threadId: string) => {
        navigate(`${portalBasePath}/messages?thread=${threadId}`);
        setState((prev) => ({ ...prev, activeThreadId: threadId }));
    }, [navigate, portalBasePath]);

    const pushToast = useCallback((toast: MessageToast) => {
        setState((prev) => ({
            ...prev,
            toasts: [toast, ...prev.toasts].slice(0, 4),
        }));

        window.setTimeout(() => {
            removeToast(toast.id);
        }, TOAST_LIFETIME_MS);
    }, [removeToast]);

    useEffect(() => {
        if (!actor) {
            threadIdsRef.current = new Set();
            setState((prev) => ({
                ...prev,
                actor: null,
                threads: [],
                activeThreadId: null,
                activeMessages: [],
                unreadCount: 0,
                unreadThreads: [],
                directOptions: [],
                toasts: [],
                isLoadingThreads: false,
                isLoadingMessages: false,
            }));
            return;
        }

        setState((prev) => ({ ...prev, actor }));
        loadThreads(actor, false);
        loadDirectOptions(actor);
    }, [actor, loadDirectOptions, loadThreads]);

    useEffect(() => {
        if (!actor) return;
        loadMessages(actor, state.activeThreadId);

        if (state.activeThreadId && location.pathname.endsWith('/messages')) {
            markThreadRead(state.activeThreadId);
        }
    }, [actor, loadMessages, location.pathname, markThreadRead, state.activeThreadId]);

    useEffect(() => {
        activeThreadIdRef.current = state.activeThreadId;
        threadsRef.current = state.threads;
    }, [state.activeThreadId, state.threads]);

    useEffect(() => {
        if (!actor) return;

        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }

        const channel = supabase
            .channel(`messaging:${actorKey(actor)}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
            }, async (payload) => {
                const message = payload.new as ChatMessage;
                if (!threadIdsRef.current.has(message.thread_id)) return;

                await loadThreads(actor, true);

                const isOwn = messageIsOwn(actor, message);
                const onCurrentThread = activeThreadIdRef.current === message.thread_id;
                const viewingMessages = location.pathname.endsWith('/messages');

                if (onCurrentThread) {
                    await loadMessages(actor, message.thread_id);
                    if (viewingMessages) {
                        await markThreadRead(message.thread_id);
                    }
                }

                if (isOwn) return;

                const threadSummary = threadsRef.current.find((thread) => thread.thread.id === message.thread_id);
                const threadTitle = threadSummary?.title || 'New message';
                const sender = threadSummary?.lastSenderLabel || 'Someone';
                const dedupeKey = `${message.thread_id}:${message.id}`;

                if (lastToastKeyRef.current === dedupeKey) return;
                lastToastKeyRef.current = dedupeKey;

                pushToast({
                    id: message.id,
                    threadId: message.thread_id,
                    title: threadTitle,
                    sender,
                    message: message.body,
                });
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'chat_thread_members',
                filter: actor.type === 'user'
                    ? `user_id=eq.${actor.id}`
                    : `employee_id=eq.${actor.id}`,
            }, async (payload) => {
                const member = payload.new as ChatThreadMember;
                await loadThreads(actor, true);

                const onCurrentThread = activeThreadIdRef.current === member.thread_id;
                const viewingMessages = location.pathname.endsWith('/messages');
                if (onCurrentThread && viewingMessages) {
                    await markThreadRead(member.thread_id);
                    return;
                }

                if ((member.unread_count ?? 0) <= 0) return;

                const { data: latest } = await supabase
                    .from('chat_messages')
                    .select('id, thread_id, sender_type, sender_user_id, sender_employee_id, body, created_at')
                    .eq('thread_id', member.thread_id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (!latest) return;
                const latestMessage = latest as ChatMessage;
                if (messageIsOwn(actor, latestMessage)) return;

                const dedupeKey = `${latestMessage.thread_id}:${latestMessage.id}`;
                if (lastToastKeyRef.current === dedupeKey) return;
                lastToastKeyRef.current = dedupeKey;

                const threadSummary = threadsRef.current.find((thread) => thread.thread.id === latestMessage.thread_id);
                pushToast({
                    id: latestMessage.id,
                    threadId: latestMessage.thread_id,
                    title: threadSummary?.title || 'New message',
                    sender: threadSummary?.lastSenderLabel || 'Someone',
                    message: latestMessage.body,
                });
            })
            .subscribe();

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [
        actor,
        loadMessages,
        loadThreads,
        location.pathname,
        markThreadRead,
        pushToast,
    ]);

    useEffect(() => {
        if (!actor) return;
        const interval = window.setInterval(() => {
            void loadThreads(actor, true);
        }, NOTIFICATION_POLL_INTERVAL_MS);
        return () => window.clearInterval(interval);
    }, [actor, loadThreads]);

    const refresh = useCallback(async () => {
        if (!actor) return;
        await loadThreads(actor, true);
        await loadMessages(actor, state.activeThreadId);
    }, [actor, loadMessages, loadThreads, state.activeThreadId]);

    const setActiveThreadFromQuery = useCallback((threadId: string | null) => {
        if (!threadId) return;
        setState((prev) => ({ ...prev, activeThreadId: threadId }));
    }, []);

    return {
        ...state,
        actorRoleLabel: actor ? formatActorLabel(actor) : '',
        formatDateTime,
        setActiveThread,
        setActiveThreadFromQuery,
        sendMessage,
        ensureDirectThread,
        markThreadRead,
        removeToast,
        clearToasts,
        refresh,
        openThreadFromNotification,
    };
}

import type { UserRole } from '../contexts/AuthContext';

export type ChatMemberType = 'user' | 'employee';
export type ChatThreadType = 'direct' | 'group';

export interface ChatActorUser {
    type: 'user';
    id: string;
    role: UserRole;
    consignorId: string | null;
}

export interface ChatActorEmployee {
    type: 'employee';
    id: string;
}

export type ChatActor = ChatActorUser | ChatActorEmployee;

export interface ChatThread {
    id: string;
    thread_type: ChatThreadType;
    title: string | null;
    system_key: string | null;
    direct_key: string | null;
    last_message_at: string | null;
    updated_at: string;
}

export interface ChatThreadMember {
    id: string;
    thread_id: string;
    member_type: ChatMemberType;
    user_id: string | null;
    employee_id: string | null;
    unread_count: number;
    last_read_at: string | null;
}

export interface ChatMessage {
    id: string;
    thread_id: string;
    sender_type: ChatMemberType;
    sender_user_id: string | null;
    sender_employee_id: string | null;
    body: string;
    created_at: string;
}

export interface ChatParticipantOption {
    key: string;
    memberType: ChatMemberType;
    id: string;
    label: string;
}

export interface ChatMessageView extends ChatMessage {
    senderLabel: string;
    isOwn: boolean;
}

export interface ChatThreadSummary {
    thread: ChatThread;
    title: string;
    unreadCount: number;
    lastMessagePreview: string;
    lastMessageAt: string | null;
    lastSenderLabel: string | null;
}

export interface MessageToast {
    id: string;
    threadId: string;
    title: string;
    message: string;
    sender: string;
}

export interface MessagingState {
    actor: ChatActor | null;
    threads: ChatThreadSummary[];
    activeThreadId: string | null;
    activeMessages: ChatMessageView[];
    unreadCount: number;
    unreadThreads: ChatThreadSummary[];
    directOptions: ChatParticipantOption[];
    toasts: MessageToast[];
    isLoadingThreads: boolean;
    isLoadingMessages: boolean;
}

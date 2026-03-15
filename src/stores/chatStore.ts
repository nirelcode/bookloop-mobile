import { create } from 'zustand';

export interface CachedMessage {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  book_id?: string | null;
  message_type?: string | null;
  book?: {
    id: string;
    title: string;
    author: string;
    images: string[];
    listing_type: string;
    price?: number;
  } | null;
}

const CHAT_TTL = 30_000; // 30 sec

interface ChatCache {
  messages: CachedMessage[];
  fetchedAt: number;
}

interface ChatStore {
  chats: Record<string, ChatCache>;
  recipientChatMap: Record<string, string>; // recipientId → chatId
  getMessages: (chatId: string) => CachedMessage[];
  isChatStale: (chatId: string) => boolean;
  hasCache: (chatId: string) => boolean;
  setChatIdForRecipient: (recipientId: string, chatId: string) => void;
  getChatIdForRecipient: (recipientId: string) => string | undefined;
  setMessages: (chatId: string, messages: CachedMessage[]) => void;
  appendMessage: (chatId: string, msg: CachedMessage) => void;
  prependMessages: (chatId: string, msgs: CachedMessage[]) => void;
  invalidate: (chatId: string) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: {},
  recipientChatMap: {},

  getMessages: (chatId) => get().chats[chatId]?.messages ?? [],

  isChatStale: (chatId) => {
    const c = get().chats[chatId];
    return !c || Date.now() - c.fetchedAt > CHAT_TTL;
  },

  setChatIdForRecipient: (recipientId, chatId) =>
    set(s => ({ recipientChatMap: { ...s.recipientChatMap, [recipientId]: chatId } })),

  getChatIdForRecipient: (recipientId) => get().recipientChatMap[recipientId],

  // fetchedAt > 0 means we've fetched at least once (even if result was empty)
  hasCache: (chatId) => {
    const c = get().chats[chatId];
    return !!c && c.fetchedAt > 0;
  },

  setMessages: (chatId, messages) =>
    set(s => ({
      chats: { ...s.chats, [chatId]: { messages, fetchedAt: Date.now() } },
    })),

  // Append a new realtime message at the end (index last = newest in ascending list)
  appendMessage: (chatId, msg) =>
    set(s => {
      const prev = s.chats[chatId]?.messages ?? [];
      if (prev.find(m => m.id === msg.id)) return s; // dedupe
      return {
        chats: {
          ...s.chats,
          [chatId]: {
            messages: [...prev, msg],
            fetchedAt: s.chats[chatId]?.fetchedAt ?? Date.now(),
          },
        },
      };
    }),

  // Prepend older messages loaded via pagination (they go at the top)
  prependMessages: (chatId, msgs) =>
    set(s => {
      const prev = s.chats[chatId]?.messages ?? [];
      const ids = new Set(prev.map(m => m.id));
      const fresh = msgs.filter(m => !ids.has(m.id));
      if (!fresh.length) return s;
      return {
        chats: {
          ...s.chats,
          [chatId]: {
            messages: [...fresh, ...prev],
            fetchedAt: s.chats[chatId]?.fetchedAt ?? Date.now(),
          },
        },
      };
    }),

  invalidate: (chatId) =>
    set(s => ({
      chats: {
        ...s.chats,
        [chatId]: s.chats[chatId]
          ? { ...s.chats[chatId], fetchedAt: 0 }
          : { messages: [], fetchedAt: 0 },
      },
    })),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDataStore } from '../stores/dataStore';

const KEY      = (chatId: string) => `bookloop_chat_read_${chatId}`;
const BASE_KEY = (userId: string) => `bookloop_baseline_${userId}`;

/** Store "now" as the last-read timestamp for a specific chat. */
export async function markChatRead(chatId: string): Promise<void> {
  const now = new Date().toISOString();
  await AsyncStorage.setItem(KEY(chatId), now);

  // Sync to in-memory store so MessagesScreen reflects immediately without re-fetch
  const store = useDataStore.getState();
  if (store.messagesFetchedAt > 0) {
    store.setConversations(store.conversations, { ...store.readAtMap, [chatId]: now });
  }
  // Reset the unread badge count for this chat
  if (store.unreadCounts[chatId]) {
    store.setUnreadCounts({ ...store.unreadCounts, [chatId]: 0 });
  }
}

/**
 * Return the ISO timestamp when this chat was last read.
 * If never read locally, returns `fallback` (if provided) or epoch.
 * Pass `getUserBaselineTime(userId)` as fallback so messages before the user's
 * first login don't appear unread, but new messages in unread chats DO appear.
 */
export async function getChatReadAt(chatId: string, fallback?: string): Promise<string> {
  const v = await AsyncStorage.getItem(KEY(chatId));
  return v ?? fallback ?? new Date(0).toISOString();
}

/**
 * Returns the ISO timestamp of the user's first login on this device.
 * Used as the unread baseline: messages before first login are "already seen",
 * messages after are unread until explicitly opened.
 * Created once and never changed.
 */
export async function getUserBaselineTime(userId: string): Promise<string> {
  const key = BASE_KEY(userId);
  let v = await AsyncStorage.getItem(key);
  if (!v) {
    v = new Date().toISOString();
    await AsyncStorage.setItem(key, v);
  }
  return v;
}

// ── Module-level refresh hook so ChatScreen can ping the nav badge ──────────
let _refresh: (() => void) | null = null;

export function registerUnreadRefresh(fn: () => void): void {
  _refresh = fn;
}

export function triggerUnreadRefresh(): void {
  _refresh?.();
}

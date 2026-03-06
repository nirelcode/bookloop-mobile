import { create } from 'zustand';
import { Book } from '../types';

// Mirrors the Chat shape in MessagesScreen
export interface ChatConv {
  id: string;
  buyer_id: string;
  seller_id: string;
  last_message?: string;
  last_message_at?: string;
  other_user?: { id: string; name: string; avatar_url?: string };
}

const HOME_TTL     = 60_000;   // 1 min  — home feed
const MESSAGES_TTL = 10_000;   // 10 sec — conversation list
const WISHLIST_TTL = 120_000;  // 2 min  — user's saved books
const MY_BOOKS_TTL = 30_000;   // 30 sec — user's own listings

interface DataState {
  homeBooks: Book[];
  homeFetchedAt: number;

  conversations: ChatConv[];
  readAtMap: Record<string, string>;
  messagesFetchedAt: number;

  wishlistBooks: Book[];
  wishlistFetchedAt: number;

  myBooks: Book[];
  myBooksFetchedAt: number;

  favoriteIds: string[];

  blockedIds: string[];

  unreadCounts: Record<string, number>;
}

interface DataActions {
  setHomeBooks: (books: Book[]) => void;
  isHomeStale: () => boolean;
  invalidateHome: () => void;

  setConversations: (convs: ChatConv[], readAtMap: Record<string, string>) => void;
  isMessagesStale: () => boolean;
  invalidateMessages: () => void;

  setWishlistBooks: (books: Book[]) => void;
  isWishlistStale: () => boolean;
  invalidateWishlist: () => void;

  setMyBooks: (books: Book[]) => void;
  isMyBooksStale: () => boolean;
  invalidateMyBooks: () => void;

  setFavoriteIds: (ids: string[]) => void;
  addFavoriteId: (id: string) => void;
  removeFavoriteId: (id: string) => void;

  setBlockedIds: (ids: string[]) => void;
  addBlockedId: (id: string) => void;
  removeBlockedId: (id: string) => void;

  setUnreadCounts: (counts: Record<string, number>) => void;
}

export const useDataStore = create<DataState & DataActions>((set, get) => ({
  // ── Home ────────────────────────────────────────────────────────────────
  homeBooks: [],
  homeFetchedAt: 0,
  setHomeBooks: (homeBooks) => set({ homeBooks, homeFetchedAt: Date.now() }),
  isHomeStale: () => Date.now() - get().homeFetchedAt > HOME_TTL,
  invalidateHome: () => set({ homeFetchedAt: 0 }),

  // ── Messages ────────────────────────────────────────────────────────────
  conversations: [],
  readAtMap: {},
  messagesFetchedAt: 0,
  setConversations: (conversations, readAtMap) =>
    set({ conversations, readAtMap, messagesFetchedAt: Date.now() }),
  isMessagesStale: () => Date.now() - get().messagesFetchedAt > MESSAGES_TTL,
  invalidateMessages: () => set({ messagesFetchedAt: 0 }),

  // ── Wishlist / Favorites ─────────────────────────────────────────────────
  wishlistBooks: [],
  wishlistFetchedAt: 0,
  setWishlistBooks: (wishlistBooks) => set({
    wishlistBooks,
    wishlistFetchedAt: Date.now(),
    favoriteIds: wishlistBooks.map(b => b.id),
  }),
  isWishlistStale: () => Date.now() - get().wishlistFetchedAt > WISHLIST_TTL,
  invalidateWishlist: () => set({ wishlistFetchedAt: 0 }),

  // ── My Books ────────────────────────────────────────────────────────────
  myBooks: [],
  myBooksFetchedAt: 0,
  setMyBooks: (myBooks) => set({ myBooks, myBooksFetchedAt: Date.now() }),
  isMyBooksStale: () => Date.now() - get().myBooksFetchedAt > MY_BOOKS_TTL,
  invalidateMyBooks: () => set({ myBooksFetchedAt: 0 }),

  // ── Favorite IDs ────────────────────────────────────────────────────────
  favoriteIds: [],
  setFavoriteIds: (favoriteIds) => set({ favoriteIds }),
  addFavoriteId: (id) => set(state => ({
    favoriteIds: state.favoriteIds.includes(id) ? state.favoriteIds : [...state.favoriteIds, id],
  })),
  removeFavoriteId: (id) => set(state => ({
    favoriteIds: state.favoriteIds.filter(fid => fid !== id),
  })),

  // ── Blocked users ────────────────────────────────────────────────────────
  blockedIds: [],
  setBlockedIds: (blockedIds) => set({ blockedIds }),
  addBlockedId: (id) => set(state => ({
    blockedIds: state.blockedIds.includes(id) ? state.blockedIds : [...state.blockedIds, id],
  })),
  removeBlockedId: (id) => set(state => ({
    blockedIds: state.blockedIds.filter(bid => bid !== id),
  })),

  // ── Unread counts (per chat) ─────────────────────────────────────────────
  unreadCounts: {},
  setUnreadCounts: (unreadCounts) => set({ unreadCounts }),
}));

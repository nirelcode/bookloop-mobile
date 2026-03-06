import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { supabase } from '../lib/supabase';
import { getChatReadAt } from '../lib/chatRead';
import { MessagesSkeletons } from '../components/Skeleton';
import { useDataStore } from '../stores/dataStore';
import NotificationPrompt from '../components/NotificationPrompt';
import { FetchErrorBanner } from '../components/Toast';
import {
  NOTIFICATIONS_PROMPTED_KEY,
  checkPushPermissionStatus,
} from '../lib/notifications';

const C = {
  bg:           '#fafaf9',
  white:        '#ffffff',
  border:       '#e7e5e4',
  text:         '#1c1917',
  sub:          '#78716c',
  muted:        '#a8a29e',
  primary:      '#2563eb',
  primaryLight: '#eff6ff',
};

interface Chat {
  id: string;
  buyer_id: string;
  seller_id: string;
  last_message?: string;
  last_message_at?: string;
  other_user?: { id: string; name: string; avatar_url?: string };
}

function formatTime(dateStr: string): string {
  const d    = new Date(dateStr);
  const now  = new Date();
  const diff = now.getTime() - d.getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)  return 'now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7)   return `${days}d`;
  return d.toLocaleDateString();
}

export default function MessagesScreen() {
  const navigation = useNavigation<any>();
  const { user }   = useAuthStore();
  const { isRTL }  = useLanguageStore();

  const {
    conversations,
    readAtMap,
    unreadCounts,
    blockedIds,
    setConversations: storeSetConversations,
  } = useDataStore();
  // Show skeleton only on the very first load
  const [loading, setLoading]       = useState(
    () => !!user && useDataStore.getState().messagesFetchedAt === 0
  );
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch]         = useState('');

  // Notification prompt
  const [showPrompt, setShowPrompt]       = useState(false);
  const [permStatus, setPermStatus]       = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const promptCheckedRef                  = useRef(false);

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('chats')
        .select(`
          id,
          buyer_id,
          seller_id,
          last_message,
          last_message_at,
          buyer:profiles!chats_buyer_id_fkey(id, name, avatar_url),
          seller:profiles!chats_seller_id_fkey(id, name, avatar_url)
        `)
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;

      const formatted = (data || []).map((chat: any) => ({
        ...chat,
        other_user: chat.buyer_id === user.id ? chat.seller : chat.buyer,
      }));

      // Load per-chat read timestamps for unread indicators
      const entries = await Promise.all(
        formatted.map(async (c: Chat) => [c.id, await getChatReadAt(c.id, c.last_message_at ?? undefined)] as [string, string])
      );
      setFetchError(false);
      storeSetConversations(formatted, Object.fromEntries(entries));
    } catch (e) {
      console.error('MessagesScreen fetchConversations:', e);
      setFetchError(true);
      // Stamp fetchedAt even on failure so TTL backoff applies.
      // Without this, fetchedAt stays 0 and every focus retries immediately.
      const s = useDataStore.getState();
      storeSetConversations(s.conversations, s.readAtMap);
    } finally {
      setLoading(false);
    }
  }, [user, storeSetConversations]);

  // SWR: show cached data immediately; background-fetch only if stale
  useFocusEffect(useCallback(() => {
    const store = useDataStore.getState();
    const hasCache = store.messagesFetchedAt > 0;
    if (hasCache && !store.isMessagesStale()) return;
    if (!hasCache) setLoading(true);
    fetchConversations();
  }, [fetchConversations]));

  // Show notification prompt on first Messages visit (non-Expo-Go only)
  useFocusEffect(useCallback(() => {
    if (!user || promptCheckedRef.current || Constants.appOwnership === 'expo') return;
    promptCheckedRef.current = true;
    (async () => {
      const already = await AsyncStorage.getItem(NOTIFICATIONS_PROMPTED_KEY);
      if (already === 'true') return;
      const status = await checkPushPermissionStatus();
      // Don't prompt if already granted — token is registered on login
      if (status === 'granted') {
        await AsyncStorage.setItem(NOTIFICATIONS_PROMPTED_KEY, 'true');
        return;
      }
      setPermStatus(status);
      setShowPrompt(true);
    })();
  }, [user]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }, [fetchConversations]);

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <View style={s.container}>
        <View style={s.loginPrompt}>
          <View style={s.loginIconWrap}>
            <Ionicons name="chatbubbles-outline" size={44} color={C.primary} />
          </View>
          <Text style={s.loginTitle}>
            {isRTL ? 'התחבר כדי לראות הודעות' : 'Sign in to see messages'}
          </Text>
          <Text style={s.loginSub}>
            {isRTL
              ? 'צור קשר עם מוכרים וקונים ישירות'
              : 'Contact sellers and buyers directly'}
          </Text>
        </View>
      </View>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.container}>
        <View style={[s.pageHeader, { paddingTop: 12 }]}>
          <Text style={[s.pageTitle, isRTL && s.rAlign]}>{isRTL ? 'הודעות' : 'Messages'}</Text>
        </View>
        <MessagesSkeletons />
      </View>
    );
  }

  // Filter out conversations with blocked users
  const unblocked = blockedIds.length > 0
    ? conversations.filter(c => !blockedIds.includes(c.other_user?.id ?? ''))
    : conversations;

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (unblocked.length === 0) {
    return (
      <View style={s.container}>
        <View style={[s.pageHeader, { paddingTop: 12 }]}>
          <Text style={[s.pageTitle, isRTL && s.rAlign]}>{isRTL ? 'הודעות' : 'Messages'}</Text>
          <Text style={[s.pageSub, isRTL && s.rAlign]}>{isRTL ? 'אין שיחות עדיין' : 'No conversations yet'}</Text>
        </View>
        {fetchError ? (
          <View style={s.empty}>
            <View style={[s.emptyIconWrap, { backgroundColor: '#fee2e2' }]}>
              <Ionicons name="cloud-offline-outline" size={40} color="#ef4444" />
            </View>
            <Text style={[s.emptyTitle, { color: C.text }]}>
              {isRTL ? 'לא הצלחנו לטעון הודעות' : 'Couldn\'t load messages'}
            </Text>
            <Text style={s.emptySub}>
              {isRTL ? 'משוך למטה כדי לנסות שוב' : 'Pull down to try again'}
            </Text>
          </View>
        ) : (
          <View style={s.empty}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="chatbubbles-outline" size={40} color={C.muted} />
            </View>
            <Text style={s.emptySub}>
              {isRTL
                ? 'כשתיצור קשר עם מוכר, השיחה תופיע כאן'
                : 'When you contact a seller, the conversation will appear here'}
            </Text>
            <TouchableOpacity
              style={s.browseBtn}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Catalog' })}
              activeOpacity={0.85}
            >
              <Ionicons name="book-outline" size={16} color={C.white} />
              <Text style={s.browseBtnTxt}>
                {isRTL ? 'עיין בספרים' : 'Browse Books'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ── List ───────────────────────────────────────────────────────────────────
  const renderItem = ({ item }: { item: Chat }) => {
    const name      = item.other_user?.name || 'User';
    const initial   = name.charAt(0).toUpperCase();
    const avatarUrl = item.other_user?.avatar_url;
    // Fall back to last_message_at (not epoch) so a fresh install doesn't
    // mark every conversation as having unread messages.
    const readAt = readAtMap[item.id] ?? item.last_message_at ?? new Date(0).toISOString();
    const hasUnread = !!(item.last_message_at && item.last_message_at > readAt);
    const unreadCount = unreadCounts[item.id] ?? 0;

    return (
      <TouchableOpacity
        style={[s.row, isRTL && s.rowRTL]}
        activeOpacity={0.75}
        onPress={() =>
          navigation.navigate('Chat', {
            chatId:          item.id,
            recipientId:     item.other_user?.id,
            recipientName:   name,
            recipientAvatar: avatarUrl,
          })
        }
      >
        {/* Avatar */}
        <View style={[s.avatar, s.avatarFallback]}>
          <Text style={s.avatarTxt}>{initial}</Text>
          {avatarUrl && (
            <Image
              source={{ uri: avatarUrl }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
            />
          )}
        </View>

        {/* Body */}
        <View style={s.rowBody}>
          <View style={[s.rowTop, isRTL && s.rowTopRTL]}>
            <Text style={[s.name, isRTL && s.rAlign, hasUnread && s.nameUnread]} numberOfLines={1}>{name}</Text>
            {item.last_message_at && (
              <Text style={[s.time, hasUnread && s.timeUnread]}>{formatTime(item.last_message_at)}</Text>
            )}
          </View>
          {item.last_message && (
            <Text style={[s.preview, isRTL && s.rAlign, hasUnread && s.previewUnread]} numberOfLines={1}>
              {item.last_message}
            </Text>
          )}
        </View>

        <View style={s.rowEnd}>
          {hasUnread && (
            unreadCount > 0
              ? <View style={s.unreadBadge}><Text style={s.unreadBadgeTxt}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text></View>
              : <View style={s.unreadDot} />
          )}
          <Ionicons
            name={isRTL ? 'chevron-back' : 'chevron-forward'}
            size={16}
            color={C.muted}
          />
        </View>
      </TouchableOpacity>
    );
  };

  const filtered = search.trim()
    ? unblocked.filter(c =>
        c.other_user?.name?.toLowerCase().includes(search.toLowerCase())
      )
    : unblocked;

  return (
    <View style={s.container}>
      {/* Page header */}
      <View style={[s.pageHeader, { paddingTop: 12 }]}>
        <Text style={[s.pageTitle, isRTL && s.rAlign]}>
          {isRTL ? 'הודעות' : 'Messages'}
        </Text>
        <Text style={[s.pageSub, isRTL && s.rAlign]}>
          {isRTL
            ? `${unblocked.length} שיחות`
            : `${unblocked.length} conversation${unblocked.length !== 1 ? 's' : ''}`}
        </Text>

        {/* Search */}
        {unblocked.length > 2 && (
          <View style={[s.searchWrap, isRTL && { flexDirection: 'row-reverse' }]}>
            <Ionicons name="search-outline" size={15} color={C.muted} />
            <TextInput
              style={s.searchInput}
              placeholder={isRTL ? 'חפש שיחה...' : 'Search conversations...'}
              placeholderTextColor={C.muted}
              value={search}
              onChangeText={setSearch}
              textAlign={isRTL ? 'right' : 'left'}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={15} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        ListEmptyComponent={
          search.trim() ? (
            <View style={s.searchEmpty}>
              <Text style={s.searchEmptyTxt}>
                {isRTL ? 'לא נמצאו שיחות' : 'No conversations found'}
              </Text>
            </View>
          ) : null
        }
      />

      {/* Notification opt-in prompt — shown once on first visit */}
      {user && (
        <NotificationPrompt
          userId={user.id}
          visible={showPrompt}
          permissionStatus={permStatus}
          onDismiss={() => setShowPrompt(false)}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loader:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Page header
  pageHeader: {
    backgroundColor: C.white,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  pageTitle: { fontSize: 26, fontWeight: '700', color: C.text },
  pageSub:   { fontSize: 13, color: C.muted, marginTop: 2 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.white, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9,
    marginTop: 12, borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.text, padding: 0 },
  searchEmpty: { padding: 40, alignItems: 'center' },
  searchEmptyTxt: { fontSize: 14, color: C.muted },

  // Login prompt
  loginPrompt:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loginIconWrap:{ width: 88, height: 88, borderRadius: 24, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  loginTitle:   { fontSize: 20, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 8 },
  loginSub:     { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 21 },

  // Empty
  empty:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIconWrap:{ width: 88, height: 88, borderRadius: 24, backgroundColor: '#f5f5f4', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: '600', color: C.text, marginBottom: 8, textAlign: 'center' },
  emptySub:    { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  browseBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  browseBtnTxt:{ color: C.white, fontSize: 15, fontWeight: '600' },

  // List
  list:      { paddingBottom: 20 },
  separator: { height: 1, backgroundColor: C.border, marginHorizontal: 76 },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: C.white,
    gap: 12,
  },
  rowRTL:    { flexDirection: 'row-reverse' },
  rowTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  rowTopRTL: { flexDirection: 'row-reverse' },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    flexShrink: 0, overflow: 'hidden',
  },
  avatarFallback: {
    backgroundColor: C.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarTxt: { fontSize: 20, fontWeight: '700', color: C.primary },
  rowBody:   { flex: 1, minWidth: 0 },
  name:         { fontSize: 15, fontWeight: '600', color: C.text, flex: 1, marginRight: 8 },
  nameUnread:   { color: C.text, fontWeight: '700' },
  time:         { fontSize: 12, color: C.muted, flexShrink: 0 },
  timeUnread:   { color: C.primary, fontWeight: '600' },
  preview:      { fontSize: 13, color: C.muted },
  previewUnread:{ color: C.text, fontWeight: '500' },

  rowEnd:    { alignItems: 'center', gap: 4 },
  unreadDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: C.primary },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: C.primary,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 5,
  },
  unreadBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 13 },

  rAlign: { textAlign: 'right' },
});

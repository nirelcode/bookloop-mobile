import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { markChatRead, triggerUnreadRefresh } from '../lib/chatRead';
import { useChatStore } from '../stores/chatStore';
import { useDataStore } from '../stores/dataStore';
import { ChatSkeletons } from '../components/Skeleton';
import { useToast, Toast } from '../components/Toast';
import { ReportModal } from '../components/ReportModal';
import SellerBooksPickerModal, { PickerBook } from '../components/SellerBooksPickerModal';
import i18n from '../lib/i18n';

interface Message {
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

interface BookContext {
  id: string;
  title: string;
  author: string;
  image?: string;
  images?: string[];
  listing_type: string;
  price?: number;
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  sale:  { bg: '#eff6ff', text: '#2563eb' },
  free:  { bg: '#d1fae5', text: '#059669' },
  trade: { bg: '#fef3c7', text: '#d97706' },
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function isSameDay(a: string, b: string) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

function formatDateLabel(iso: string) {
  const d         = new Date(iso);
  const now       = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(iso, now.toISOString()))        return i18n.locale === 'he' ? 'היום'  : 'Today';
  if (isSameDay(iso, yesterday.toISOString()))  return i18n.locale === 'he' ? 'אתמול' : 'Yesterday';
  return d.toLocaleDateString(i18n.locale === 'he' ? 'he-IL' : 'en-US', {
    day: 'numeric', month: 'long',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

// ── Chat screen ───────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const route      = useRoute();
  const navigation = useNavigation<any>();
  const insets     = useSafeAreaInsets();
  const { isRTL }  = useLanguageStore();
  const [kbHeight, setKbHeight] = useState(0);

  const { chatId: routeChatId, recipientId, recipientName, recipientAvatar, bookContext } = route.params as {
    chatId?: string;
    recipientId: string;
    recipientName: string;
    recipientAvatar?: string;
    bookContext?: BookContext;
  };

  const { user, profile } = useAuthStore();
  const chatStore         = useChatStore();
  const { blockedIds, addBlockedId, removeBlockedId } = useDataStore();
  const isBlocked = blockedIds.includes(recipientId);

  const [newMessage, setNewMessage]         = useState(() => {
    if (!bookContext) return '';
    return isRTL
      ? `היי, אני מעוניין ב"${bookContext.title}" — האם הוא עדיין זמין?`
      : `Hi, I'm interested in "${bookContext.title}" — is it still available?`;
  });
  const [bookPreviews, setBookPreviews]     = useState<BookContext[]>(bookContext ? [bookContext] : []);
  const [bookPickerVisible, setBookPickerVisible] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(() => {
    if (routeChatId) return routeChatId;
    return useChatStore.getState().getChatIdForRecipient(recipientId) ?? null;
  });
  const [loadingMore, setLoadingMore]       = useState(false);
  const [refreshing, setRefreshing]         = useState(false);
  const [hasMore, setHasMore]               = useState(true);
  const [menuVisible,   setMenuVisible]   = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [loading, setLoading] = useState(() => {
    const cid = routeChatId ?? useChatStore.getState().getChatIdForRecipient(recipientId);
    return cid ? !useChatStore.getState().hasCache(cid) : true;
  });

  const { showToast, toast } = useToast();
  const [reviewPromptVisible, setReviewPromptVisible] = useState(false);

  const flatListRef    = useRef<FlatList>(null);
  const channelRef     = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Ref so onContentSizeChange doesn't close over stale state
  const loadingMoreRef        = useRef(false);
  const hasScrolledInitially  = useRef(false);

  const messages = conversationId ? chatStore.getMessages(conversationId) : [];

  // Keyboard height tracking (needed for edge-to-edge Android)
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, e => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Mark read on mount and focus
  useEffect(() => {
    if (conversationId) markChatRead(conversationId).then(triggerUnreadRefresh);
  }, [conversationId]);

  useFocusEffect(useCallback(() => {
    if (conversationId) markChatRead(conversationId).then(triggerUnreadRefresh);
  }, [conversationId]));

  // Scroll to bottom once after initial messages load
  useEffect(() => {
    if (!loading && messages.length > 0 && !hasScrolledInitially.current) {
      hasScrolledInitially.current = true;
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 150);
    }
  }, [loading, messages.length]);

  const LIMIT = 30;

  // ── Header ────────────────────────────────────────────────────────────────

  const handleReportUser = () => {
    setMenuVisible(false);
    setReportVisible(true);
  };

  const submitReport = async (category: string, details: string) => {
    if (!user) return;
    await supabase.from('reports').insert({
      reporter_id:      user.id,
      reported_user_id: recipientId,
      chat_id:          conversationId ?? undefined,
      reason:           details || 'User reported from chat',
      category,
    });
    showToast(isRTL ? 'הדיווח נשלח, תודה' : 'Report submitted, thank you');
  };

  const handleBlockUser = async () => {
    if (!user) return;
    setMenuVisible(false);
    // Optimistic: update store immediately
    addBlockedId(recipientId);
    const { error } = await supabase.from('blocked_users').insert({
      blocker_id: user.id,
      blocked_id: recipientId,
    });
    if (error && error.code !== '23505') {
      removeBlockedId(recipientId); // revert on failure
      showToast(isRTL ? 'שגיאה בחסימה' : 'Could not block user', 'error');
      return;
    }
    showToast(
      isRTL ? 'המשתמש נחסם' : 'User blocked',
      'success',
      {
        label: isRTL ? 'בטל' : 'Undo',
        onPress: async () => {
          await supabase.from('blocked_users').delete()
            .eq('blocker_id', user.id).eq('blocked_id', recipientId);
          removeBlockedId(recipientId);
        },
      },
    );
  };

  const handleUnblockUser = async () => {
    if (!user) return;
    setMenuVisible(false);
    removeBlockedId(recipientId);
    await supabase.from('blocked_users').delete()
      .eq('blocker_id', user.id).eq('blocked_id', recipientId);
    showToast(
      isRTL ? 'החסימה בוטלה' : 'User unblocked',
      'success',
      {
        label: isRTL ? 'בטל' : 'Undo',
        onPress: async () => {
          await supabase.from('blocked_users').insert({
            blocker_id: user.id,
            blocked_id: recipientId,
          });
          addBlockedId(recipientId);
        },
      },
    );
  };

  // Header — re-runs when language changes so left/right slots flip correctly
  useEffect(() => {
    if (isRTL) {
      navigation.setOptions({
        headerLeft: () => (
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={{ padding: 8, paddingLeft: 4 }}>
            <Ionicons name="ellipsis-vertical" size={20} color="#1c1917" />
          </TouchableOpacity>
        ),
        headerTitle: () => null,
        headerRight: () => (
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8, paddingRight: 4 }}>
              <Ionicons name="chevron-forward" size={22} color="#1c1917" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('SellerProfile', { sellerId: recipientId, sellerName: recipientName })}
              style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}
              activeOpacity={0.7}
            >
              <View style={[hs.avatar, hs.avatarFallback]}>
                <Text style={hs.avatarInitial}>{recipientName.charAt(0).toUpperCase()}</Text>
                {recipientAvatar && (
                  <Image source={{ uri: recipientAvatar }} style={[StyleSheet.absoluteFillObject, { borderRadius: 17 }]} contentFit="cover" />
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={hs.name}>{recipientName}</Text>
                <Text style={hs.sub}>צפה בפרופיל</Text>
              </View>
            </TouchableOpacity>
          </View>
        ),
      });
    } else {
      navigation.setOptions({
        headerLeft: undefined,
        headerTitle: () => (
          <TouchableOpacity
            onPress={() => navigation.navigate('SellerProfile', { sellerId: recipientId, sellerName: recipientName })}
            activeOpacity={0.7}
            style={hs.wrap}
          >
            <View style={[hs.avatar, hs.avatarFallback]}>
              <Text style={hs.avatarInitial}>{recipientName.charAt(0).toUpperCase()}</Text>
              {recipientAvatar && (
                <Image source={{ uri: recipientAvatar }} style={[StyleSheet.absoluteFillObject, { borderRadius: 17 }]} contentFit="cover" />
              )}
            </View>
            <View>
              <Text style={hs.name}>{recipientName}</Text>
              <Text style={hs.sub}>View profile</Text>
            </View>
          </TouchableOpacity>
        ),
        headerRight: () => (
          <TouchableOpacity onPress={() => setMenuVisible(true)} style={{ padding: 8 }}>
            <Ionicons name="ellipsis-vertical" size={20} color="#1c1917" />
          </TouchableOpacity>
        ),
      });
    }
  }, [recipientId, isRTL]);

  // Init — only re-runs when chat partner changes
  useEffect(() => {
    initializeConversation();
    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [recipientId]);

  // ── Init ──────────────────────────────────────────────────────────────────

  const initializeConversation = async () => {
    try {
      let chatId: string;
      if (routeChatId) {
        chatId = routeChatId;
      } else {
        // Check in-memory cache first to skip the DB lookup
        const cached = useChatStore.getState().getChatIdForRecipient(recipientId);
        if (cached) {
          chatId = cached;
        } else {
          const { data: existingChat } = await supabase
            .from('chats').select('id')
            .or(`and(buyer_id.eq.${user?.id},seller_id.eq.${recipientId}),and(buyer_id.eq.${recipientId},seller_id.eq.${user?.id})`)
            .maybeSingle();
          if (existingChat?.id) {
            chatId = existingChat.id;
          } else {
            const { data: newChat, error } = await supabase
              .from('chats').insert({ buyer_id: user?.id, seller_id: recipientId }).select().single();
            if (error) throw error;
            chatId = newChat.id;
          }
          useChatStore.getState().setChatIdForRecipient(recipientId, chatId);
        }
      }
      setConversationId(chatId);
      subscribeToMessages(chatId);
      const store = useChatStore.getState();
      if (store.hasCache(chatId) && !store.isChatStale(chatId)) {
        setLoading(false);
        // Fetch any messages that arrived since our last cached message
        const cachedMsgs = store.getMessages(chatId);
        const latest = cachedMsgs[cachedMsgs.length - 1];
        if (latest) {
          supabase
            .from('messages')
            .select('*, book:books!messages_book_id_fkey(id,title,author,images,listing_type,price)')
            .eq('chat_id', chatId)
            .gt('created_at', latest.created_at)
            .order('created_at', { ascending: true })
            .then(({ data }) => {
              if (data?.length) {
                data.forEach(msg => useChatStore.getState().appendMessage(chatId, msg as Message));
                scrollToBottom(true);
              }
            });
        }
        return;
      }
      fetchMessages(chatId).finally(() => setLoading(false));
    } catch (error) {
      console.error('Error initializing conversation:', error);
      setLoading(false); // always clear skeleton even on error
    }
  };

  // ── Scroll helpers ────────────────────────────────────────────────────────

  const scrollToBottom = (animated = false) => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated }), 80);
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchMessages = async (chatId: string, before?: string) => {
    try {
      let batch: Message[];
      if (before) {
        // Loading OLDER messages: fetch descending (before timestamp) then reverse
        const { data, error } = await supabase
          .from('messages').select('*, book:books!messages_book_id_fkey(id,title,author,images,listing_type,price)').eq('chat_id', chatId)
          .order('created_at', { ascending: false })
          .lt('created_at', before)
          .limit(LIMIT);
        if (error) throw error;
        batch = ((data || []) as Message[]).reverse(); // ascending order
        useChatStore.getState().prependMessages(chatId, batch);
      } else {
        // Initial load: fetch newest 30 descending, then reverse for display
        const { data, error } = await supabase
          .from('messages').select('*, book:books!messages_book_id_fkey(id,title,author,images,listing_type,price)').eq('chat_id', chatId)
          .order('created_at', { ascending: false })
          .limit(LIMIT);
        if (error) throw error;
        batch = ((data || []) as Message[]).reverse(); // newest-first → reverse → oldest at top, newest at bottom
        useChatStore.getState().setMessages(chatId, batch);
      }
      setHasMore(batch.length === LIMIT);
    } catch (error) {
      console.error('Error fetching messages:', error);
      if (!before) useChatStore.getState().setMessages(chatId, useChatStore.getState().getMessages(chatId));
    }
  };

  const loadMore = useCallback(async () => {
    if (!conversationId || !hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const oldest = useChatStore.getState().getMessages(conversationId)[0];
    if (oldest) await fetchMessages(conversationId, oldest.created_at);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [conversationId, hasMore]);

  const onRefresh = useCallback(async () => {
    if (!conversationId) return;
    setRefreshing(true);
    await fetchMessages(conversationId);
    setRefreshing(false);
  }, [conversationId]);

  // ── Realtime ──────────────────────────────────────────────────────────────

  // ── Review pre-prompt ──────────────────────────────────────────────────────
  const REVIEW_KEY = 'bookloop_review_v2';
  const MAX_ASKS   = 3;
  const COOLDOWN   = 45 * 24 * 60 * 60 * 1000; // 45 days
  const MIN_AGE    = 7  * 24 * 60 * 60 * 1000; // account must be ≥ 7 days old

  const maybeShowReviewPrompt = async () => {
    try {
      // Guard: account age
      const createdAt = profile?.created_at ? new Date(profile.created_at).getTime() : Date.now();
      if (Date.now() - createdAt < MIN_AGE) return;

      const raw = await AsyncStorage.getItem(REVIEW_KEY);
      const data = raw ? JSON.parse(raw) : { status: null, askCount: 0, askedAt: 0 };

      // Permanent dismiss
      if (data.status === 'dismissed') return;
      // Max asks reached
      if (data.askCount >= MAX_ASKS) return;
      // Cooldown between asks
      if (data.askedAt && Date.now() - data.askedAt < COOLDOWN) return;

      setReviewPromptVisible(true);
    } catch {}
  };

  const handleReviewYes = async () => {
    setReviewPromptVisible(false);
    try {
      const raw = await AsyncStorage.getItem(REVIEW_KEY);
      const data = raw ? JSON.parse(raw) : { askCount: 0 };
      await AsyncStorage.setItem(REVIEW_KEY, JSON.stringify({
        ...data, status: 'asked', askedAt: Date.now(), askCount: (data.askCount || 0) + 1,
      }));
      const ok = await StoreReview.isAvailableAsync();
      if (ok) StoreReview.requestReview();
    } catch {}
  };

  const handleReviewNotNow = async () => {
    setReviewPromptVisible(false);
    try {
      const raw = await AsyncStorage.getItem(REVIEW_KEY);
      const data = raw ? JSON.parse(raw) : { askCount: 0 };
      await AsyncStorage.setItem(REVIEW_KEY, JSON.stringify({
        ...data, askedAt: Date.now(), askCount: (data.askCount || 0) + 1,
      }));
    } catch {}
  };

  const handleReviewDismiss = async () => {
    setReviewPromptVisible(false);
    try {
      await AsyncStorage.setItem(REVIEW_KEY, JSON.stringify({ status: 'dismissed' }));
    } catch {}
  };

  const subscribeToMessages = (chatId: string) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const channel = supabase.channel(`messages:${chatId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        async (payload) => {
          let msg = payload.new as Message;
          if (msg.book_id) {
            const { data } = await supabase
              .from('messages')
              .select('*, book:books!messages_book_id_fkey(id,title,author,images,listing_type,price)')
              .eq('id', msg.id)
              .single();
            if (data) msg = data as Message;
          }
          useChatStore.getState().appendMessage(chatId, msg);
          scrollToBottom(true);
          if (msg.sender_id !== useAuthStore.getState().user?.id) {
            markChatRead(chatId).then(triggerUnreadRefresh);
          }
        }
      ).subscribe();
    channelRef.current = channel;
  };

  // ── Send ──────────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    const text = newMessage.trim();
    const snapPreviews = bookPreviews;
    if (!text && snapPreviews.length === 0) return;
    if (!conversationId) return;

    setNewMessage('');
    setBookPreviews([]);

    try {
      if (snapPreviews.length > 0) {
        // Send one book_card message per queued book
        await Promise.all(
          snapPreviews.map(book =>
            supabase.from('messages').insert({
              chat_id:      conversationId,
              sender_id:    user?.id,
              content:      text,
              book_id:      book.id,
              message_type: 'book_card',
            })
          )
        );
      } else {
        const { error } = await supabase.from('messages').insert({
          chat_id:      conversationId,
          sender_id:    user?.id,
          content:      text,
          message_type: 'text',
        });
        if (error) throw error;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      markChatRead(conversationId).then(triggerUnreadRefresh);
      // Smart review pre-prompt
      maybeShowReviewPrompt();
      sendPushNotification(recipientId, text || (isRTL ? 'שיתף ספר' : 'Shared a book')).catch(() => {});
    } catch (error) {
      console.error('Error sending message:', error);
      setNewMessage(text);
      setBookPreviews(snapPreviews);
      Alert.alert(i18n.t('common.error'), i18n.t('chat.sendFailed'));
    }
  };

  const sendPushNotification = async (toUserId: string, messageText: string) => {
    const { data } = await supabase.from('profiles').select('push_token').eq('id', toUserId).single();
    const token = data?.push_token;
    if (!token) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title: profile?.name ?? user?.email ?? 'BookLoop',
        body: messageText.length > 100 ? messageText.slice(0, 97) + '...' : messageText,
        data: { recipientId: user?.id },
        sound: 'default',
      }),
    });
  };

  // ── Render message ────────────────────────────────────────────────────────

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.sender_id === user?.id;

    const above = messages[index - 1];
    const below = messages[index + 1];

    const TWO_MIN = 2 * 60 * 1000;
    const groupedWithAbove = above?.sender_id === item.sender_id
      && Math.abs(new Date(item.created_at).getTime() - new Date(above.created_at).getTime()) < TWO_MIN;
    const groupedWithBelow = below?.sender_id === item.sender_id
      && Math.abs(new Date(item.created_at).getTime() - new Date(below.created_at).getTime()) < TWO_MIN;

    const TAIL = 4, FULL = 18;
    const isBottom = !groupedWithBelow;

    // My messages always appear on the right, theirs on the left — regardless of RTL.
    // Text inside the bubble aligns per language, but bubble position stays consistent.
    const myTailLeft  = false;
    const myTailRight = true;
    const bubbleRadius = {
      borderTopLeftRadius:     FULL,
      borderTopRightRadius:    FULL,
      borderBottomLeftRadius:  isBottom ? (isMe ? (myTailLeft  ? TAIL : FULL) : (myTailLeft  ? FULL : TAIL)) : FULL,
      borderBottomRightRadius: isBottom ? (isMe ? (myTailRight ? TAIL : FULL) : (myTailRight ? FULL : TAIL)) : FULL,
    };

    const marginBottom = groupedWithBelow ? 2 : 8;
    const showDateSep = !above || !isSameDay(item.created_at, above.created_at);

    // ── Book card message ──
    if (item.message_type === 'book_card' && item.book) {
      const book = item.book;
      const tc = TYPE_COLORS[book.listing_type] ?? TYPE_COLORS.sale;
      const priceLabel = book.listing_type === 'sale' && book.price
        ? `₪${book.price}`
        : book.listing_type === 'free' ? (isRTL ? 'חינם' : 'Free') : (isRTL ? 'להחלפה' : 'Trade');
      const imgUri = book.images?.[0] ?? `https://picsum.photos/seed/${book.id}/300/400`;
      return (
        <View>
          {showDateSep && (
            <View style={s.dateSep}>
              <View style={s.dateSepLine} />
              <Text style={s.dateSepText}>{formatDateLabel(item.created_at)}</Text>
              <View style={s.dateSepLine} />
            </View>
          )}
          <View style={[
            s.cardBubble,
            isMe ? s.myBubble : s.theirBubble,
            bubbleRadius,
            { marginBottom },
          ]}>
            {/* Tappable book section → navigates to BookDetail */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('BookDetail', { bookId: book.id })}
            >
              <View style={s.cardImgWrap}>
                <Image source={{ uri: imgUri }} style={s.cardImg} contentFit="cover" />
                <View style={[s.cardAccentBar, { backgroundColor: isMe ? 'rgba(255,255,255,0.25)' : tc.text }]} />
              </View>
              <View style={[s.cardInfo, isMe && s.cardInfoMine]}>
                <View style={s.cardInfoLeft}>
                  <Text style={[s.cardTitle, isMe && s.myText]} numberOfLines={2}>{book.title}</Text>
                  <Text style={[s.cardAuthor, isMe ? { color: '#bfdbfe' } : {}]} numberOfLines={1}>{book.author}</Text>
                </View>
                <View style={[s.cardBadge, { backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : tc.bg }]}>
                  <Text style={[s.cardBadgeTxt, { color: isMe ? '#ffffff' : tc.text }]}>{priceLabel}</Text>
                </View>
              </View>
            </TouchableOpacity>
            {/* Divider + text — only shown when there's a caption */}
            {item.content ? (
              <>
                <View style={[s.cardDivider, isMe && { backgroundColor: 'rgba(255,255,255,0.18)' }]} />
                <View style={s.cardText}>
                  <Text style={[s.bubbleText, isMe && s.myText]}>{item.content}</Text>
                  <Text style={[s.bubbleTime, isMe && s.myTime]}>
                    {new Date(item.created_at).toLocaleTimeString(isRTL ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </>
            ) : (
              <View style={s.cardTimeOnly}>
                <Text style={[s.bubbleTime, isMe && s.myTime]}>
                  {new Date(item.created_at).toLocaleTimeString(isRTL ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    return (
      <View>
        {showDateSep && (
          <View style={s.dateSep}>
            <View style={s.dateSepLine} />
            <Text style={s.dateSepText}>{formatDateLabel(item.created_at)}</Text>
            <View style={s.dateSepLine} />
          </View>
        )}
        <View style={[
          s.bubble,
          isMe ? s.myBubble : s.theirBubble,
          bubbleRadius,
          { marginBottom },
        ]}>
          <Text style={[s.bubbleText, isMe && s.myText]}>{item.content}</Text>
          <Text style={[s.bubbleTime, isMe && s.myTime]}>
            {new Date(item.created_at).toLocaleTimeString(isRTL ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading && messages.length === 0) {
    return (
      <View style={s.container}>
        <ChatSkeletons />
        <View style={[s.bottomArea, { marginBottom: kbHeight > 0 ? kbHeight - insets.bottom : 0 }]}>
          <View style={[s.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={[s.inputPill, { opacity: 0.4 }]}>
              <TextInput style={s.input} editable={false} placeholder={i18n.t('messages.typePlaceholder') || 'Type a message...'} />
              <View style={s.pillIcon} />
            </View>
            <View style={[s.sendBtn, s.sendBtnDisabled]} />
          </View>
        </View>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        // Keep scroll position stable when older messages are prepended at top
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        // Load older messages when user scrolls near the top
        onScroll={e => {
          if (e.nativeEvent.contentOffset.y < 60) loadMore();
        }}
        scrollEventThrottle={300}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
        }
        ListHeaderComponent={
          loadingMore
            ? <ActivityIndicator size="small" color="#2563eb" style={{ paddingVertical: 12 }} />
            : null
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="chatbubbles-outline" size={36} color="#a8a29e" />
            </View>
            <Text style={s.emptyText}>{i18n.t('messages.startChatting')}</Text>
          </View>
        }
      />

      <View style={[s.bottomArea, { marginBottom: kbHeight > 0 ? kbHeight - insets.bottom : 0 }]}>
        {/* Book preview strip — shows all queued books */}
        {bookPreviews.length > 0 && (
          <View style={s.previewStrip}>
            {bookPreviews.map(book => {
              const tc = TYPE_COLORS[book.listing_type] ?? TYPE_COLORS.sale;
              const priceLabel = book.listing_type === 'sale' && book.price
                ? `₪${book.price}`
                : book.listing_type === 'free'
                  ? (isRTL ? 'חינם' : 'Free')
                  : (isRTL ? 'להחלפה' : 'Trade');
              return (
                <View key={book.id} style={s.bookPreview}>
                  <Image
                    source={{ uri: book.image ?? book.images?.[0] ?? `https://picsum.photos/seed/${book.id}/300/400` }}
                    style={s.bookPreviewImg}
                    contentFit="cover"
                  />
                  <View style={s.bookPreviewInfo}>
                    <Text style={s.bookPreviewTitle} numberOfLines={1}>{book.title}</Text>
                    <Text style={s.bookPreviewAuthor} numberOfLines={1}>{book.author}</Text>
                    <View style={[s.bookPreviewBadge, { backgroundColor: tc.bg }]}>
                      <Text style={[s.bookPreviewBadgeTxt, { color: tc.text }]}>{priceLabel}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={s.bookPreviewClose}
                    onPress={() => setBookPreviews(prev => prev.filter(b => b.id !== book.id))}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={15} color="#78716c" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <View style={[s.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }, isRTL && { flexDirection: 'row-reverse' }]}>
          {/* Input pill: text + book icon inside same bg */}
          <View style={s.inputPill}>
            {isRTL && (
              <TouchableOpacity style={s.pillIcon} onPress={() => setBookPickerVisible(true)} activeOpacity={0.7}>
                <Ionicons name="book-outline" size={19} color="#a8a29e" />
              </TouchableOpacity>
            )}
            <TextInput
              style={[s.input, isRTL && { textAlign: 'right', direction: 'rtl' }]}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder={i18n.t('messages.typePlaceholder') || 'Type a message...'}
              placeholderTextColor="#a8a29e"
              multiline
              numberOfLines={1}
              maxLength={500}
            />
            {!isRTL && (
              <TouchableOpacity style={s.pillIcon} onPress={() => setBookPickerVisible(true)} activeOpacity={0.7}>
                <Ionicons name="book-outline" size={19} color="#a8a29e" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[s.sendBtn, (!newMessage.trim() && bookPreviews.length === 0) && s.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!newMessage.trim() && bookPreviews.length === 0}
            activeOpacity={0.8}
          >
            <Ionicons
              name="send"
              size={18}
              color="#fff"
              style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Seller book picker */}
      <SellerBooksPickerModal
        visible={bookPickerVisible}
        onClose={() => setBookPickerVisible(false)}
        onConfirm={(picked: PickerBook[]) => {
          setBookPreviews(prev => {
            const existingIds = new Set(prev.map(b => b.id));
            const toAdd = picked
              .filter(b => !existingIds.has(b.id))
              .map(b => ({
                id: b.id,
                title: b.title,
                author: b.author,
                images: b.images,
                image: b.images?.[0],
                listing_type: b.listing_type,
                price: b.price,
              }));
            return [...prev, ...toAdd].slice(0, 5);
          });
        }}
        sellerId={recipientId}
        sellerName={recipientName}
        isRTL={isRTL}
      />

      {/* ── 3-dot dropdown menu ───────────────────────────────────────────── */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={m.overlay} onPress={() => setMenuVisible(false)}>
          <Pressable
            style={[m.card, isRTL ? m.cardRTL : m.cardLTR, { top: insets.top + 56 }]}
            onPress={e => e.stopPropagation()}
          >
            {/* View profile */}
            <TouchableOpacity
              style={[m.item, isRTL && m.itemRTL]}
              onPress={() => {
                setMenuVisible(false);
                navigation.navigate('SellerProfile', { sellerId: recipientId, sellerName: recipientName });
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={17} color="#78716c" />
              <Text style={m.itemTxt}>{isRTL ? 'פרופיל משתמש' : 'View profile'}</Text>
            </TouchableOpacity>

            <View style={m.divider} />

            {/* Report user */}
            <TouchableOpacity style={[m.item, isRTL && m.itemRTL]} onPress={handleReportUser} activeOpacity={0.7}>
              <Ionicons name="flag-outline" size={17} color="#ef4444" />
              <Text style={[m.itemTxt, m.itemRed]}>{isRTL ? 'דיווח על משתמש' : 'Report user'}</Text>
            </TouchableOpacity>

            {/* Block / Unblock user */}
            {isBlocked ? (
              <TouchableOpacity style={[m.item, isRTL && m.itemRTL]} onPress={handleUnblockUser} activeOpacity={0.7}>
                <Ionicons name="shield-checkmark-outline" size={17} color="#ef4444" />
                <Text style={[m.itemTxt, m.itemRed]}>{isRTL ? 'בטל חסימת משתמש' : 'Unblock user'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[m.item, isRTL && m.itemRTL]} onPress={handleBlockUser} activeOpacity={0.7}>
                <Ionicons name="ban-outline" size={17} color="#ef4444" />
                <Text style={[m.itemTxt, m.itemRed]}>{isRTL ? 'חסום משתמש' : 'Block user'}</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={submitReport}
        titleEn={`Report ${recipientName}`}
        titleHe={`דיווח על ${recipientName}`}
      />

      <Toast {...toast} />

      {/* ── Review pre-prompt ── */}
      <Modal visible={reviewPromptVisible} transparent animationType="fade" onRequestClose={handleReviewNotNow}>
        <Pressable style={s.reviewOverlay} onPress={handleReviewNotNow}>
          <Pressable style={s.reviewSheet} onPress={() => {}}>
            <Text style={s.reviewEmoji}>⭐</Text>
            <Text style={s.reviewTitle}>{isRTL ? 'נהנה מ-BookLoop?' : 'Enjoying BookLoop?'}</Text>
            <Text style={s.reviewSub}>
              {isRTL
                ? 'דירוג קצר עוזר לנו לגדול ולהביא עוד ספרים לקהילה'
                : 'A quick rating helps us grow and bring more books to the community'}
            </Text>
            <TouchableOpacity style={s.reviewYesBtn} onPress={handleReviewYes} activeOpacity={0.85}>
              <Text style={s.reviewYesTxt}>{isRTL ? 'כן, אוהב את האפליקציה! ⭐' : 'Yes, I love it! ⭐'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.reviewNoBtn} onPress={handleReviewNotNow} activeOpacity={0.8}>
              <Text style={s.reviewNoTxt}>{isRTL ? 'לא עכשיו' : 'Not right now'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleReviewDismiss} activeOpacity={0.7}>
              <Text style={s.reviewDismissTxt}>{isRTL ? 'אל תשאל שוב' : "Don't ask again"}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafaf9' },

  // Review prompt
  reviewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  reviewSheet:   { backgroundColor: '#fff', borderRadius: 20, padding: 28, width: '100%', alignItems: 'center', gap: 8 },
  reviewEmoji:   { fontSize: 40, marginBottom: 4 },
  reviewTitle:   { fontSize: 20, fontWeight: '700', color: '#1c1917', textAlign: 'center' },
  reviewSub:     { fontSize: 14, color: '#78716c', textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  reviewYesBtn:  { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24, width: '100%', alignItems: 'center' },
  reviewYesTxt:  { color: '#fff', fontSize: 15, fontWeight: '600' },
  reviewNoBtn:   { borderWidth: 1, borderColor: '#e7e5e4', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 24, width: '100%', alignItems: 'center' },
  reviewNoTxt:   { color: '#78716c', fontSize: 15, fontWeight: '500' },
  reviewDismissTxt: { fontSize: 13, color: '#a8a29e', marginTop: 4, textDecorationLine: 'underline' },
  list:      { padding: 16, paddingBottom: 8 },

  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginBottom: 8,
  },
  // ── Book card bubble ──
  cardBubble: {
    padding: 0,
    overflow: 'hidden',
    maxWidth: '80%',
  },
  cardImgWrap: {
    position: 'relative',
  },
  cardImg: {
    width: '100%',
    height: 140,
    backgroundColor: '#e7e5e4',
  },
  cardAccentBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  cardInfoMine: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardInfoLeft: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c1917',
    lineHeight: 17,
  },
  cardAuthor: {
    fontSize: 11,
    color: '#78716c',
  },
  cardBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  cardBadgeTxt: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#e7e5e4',
  },
  cardText: {
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  myBubble:    { alignSelf: 'flex-end',   backgroundColor: '#2563eb' },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7e5e4' },
  bubbleText:  { fontSize: 15, color: '#1c1917', lineHeight: 21 },
  myText:      { color: '#ffffff' },
  bubbleTime:  { fontSize: 10, color: '#a8a29e', alignSelf: 'flex-end', marginTop: 3 },
  myTime:      { color: '#bfdbfe' },

  // Date separator
  dateSep:     { flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 8 },
  dateSepLine: { flex: 1, height: 1, backgroundColor: '#e7e5e4' },
  dateSepText: { fontSize: 11, fontWeight: '600', color: '#a8a29e', textAlign: 'center' },

  // Bottom area (book preview + input)
  bottomArea: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e7e5e4',
  },

  // Multi-book preview strip
  previewStrip: {
    borderBottomWidth: 1,
    borderBottomColor: '#e7e5e4',
  },

  // Individual book preview row inside the strip
  bookPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f4',
  },
  bookPreviewImg: {
    width: 42,
    height: 56,
    borderRadius: 7,
    backgroundColor: '#e7e5e4',
  },
  bookPreviewInfo: {
    flex: 1,
    gap: 2,
  },
  bookPreviewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1c1917',
  },
  bookPreviewAuthor: {
    fontSize: 11,
    color: '#78716c',
  },
  bookPreviewBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 3,
  },
  bookPreviewBadgeTxt: {
    fontSize: 11,
    fontWeight: '600',
  },
  bookPreviewClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#f5f5f4',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Timestamp-only row at bottom of book card (when content is empty)
  cardTimeOnly: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'flex-end',
  },

  // Input bar
  inputRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: '#ffffff',
    alignItems: 'flex-end',
    gap: 8,
  },
  // Input pill: text field + book icon share the same rounded container
  inputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#fafaf9',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e7e5e4',
  },
  // TextInput inside the pill — no own border/bg
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 110,
    color: '#1c1917',
  },
  // Book icon anchored to the bottom-right of the pill
  pillIcon: {
    paddingRight: 10,
    paddingLeft: 4,
    paddingTop: 9,
    paddingBottom: 9,
  },
  sendBtn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center', marginBottom: 1 },
  sendBtnDisabled: { backgroundColor: '#d1d5db' },

  // Empty state
  empty:        { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyIconWrap:{ width: 72, height: 72, borderRadius: 20, backgroundColor: '#f5f5f4', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyText:    { fontSize: 14, color: '#a8a29e', textAlign: 'center' },
});

// Header styles (separate so they don't re-create on every render)
const hs = StyleSheet.create({
  wrap:          { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:        { width: 34, height: 34, borderRadius: 17, overflow: 'hidden' },
  avatarFallback:{ backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  name:          { fontSize: 16, fontWeight: '600', color: '#1c1917' },
  sub:           { fontSize: 11, color: '#78716c' },
});

// ── Dropdown menu styles ───────────────────────────────────────────────────────
const m = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  card: {
    position: 'absolute',
    width: 200,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7e5e4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  cardLTR: { right: 8 },
  cardRTL: { left: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 11,
  },
  itemRTL:  { flexDirection: 'row-reverse' },
  itemTxt:  { fontSize: 15, fontWeight: '500', color: '#1c1917' },
  itemRed:  { color: '#ef4444' },
  divider:  { height: 1, backgroundColor: '#e7e5e4' },
});

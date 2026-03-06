import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Book } from '../types';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { WishlistSkeletons } from '../components/Skeleton';
import { useDataStore } from '../stores/dataStore';
import { useFavorite } from '../hooks/useFavorite';

const C = {
  bg:           '#fafaf9',
  white:        '#ffffff',
  border:       '#e7e5e4',
  text:         '#1c1917',
  sub:          '#78716c',
  muted:        '#a8a29e',
  primary:      '#2563eb',
  primaryLight: '#eff6ff',
  emerald:      '#059669',
  emeraldLight: '#d1fae5',
  amber:        '#d97706',
  pink:         '#db2777',
  red:          '#ef4444',
  redLight:     '#fee2e2',
};

const CARD_W = 168;
const GAP    = 12;

function BookCard({ item, isRTL, onPress }: { item: Book; isRTL: boolean; onPress: () => void }) {
  const { isFavorite, toggleFavorite } = useFavorite(item.id);

  let priceLabel = '';
  let priceColor = C.primary;
  if (item.listing_type === 'sale' && item.price) {
    priceLabel = `₪${item.price}`;
  } else if (item.listing_type === 'free') {
    priceLabel = isRTL ? 'חינם' : 'Free';
    priceColor = C.emerald;
  } else if (item.listing_type === 'trade') {
    priceLabel = isRTL ? 'החלפה' : 'Trade';
    priceColor = C.amber;
  }

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.82}>
      <View style={s.imgBox}>
        <Image
          source={{ uri: item.images?.[0] ?? `https://picsum.photos/seed/${item.id}/300/400` }}
          style={s.cardImg}
          contentFit="cover"
          transition={200}
        />
        <TouchableOpacity
          style={[s.heartBtn, isRTL && s.heartBtnRTL]}
          onPress={toggleFavorite}
          activeOpacity={0.85}
          hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={15}
            color={isFavorite ? C.pink : 'rgba(255,255,255,0.9)'}
          />
        </TouchableOpacity>
      </View>
      <View style={s.cardBody}>
        <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={s.cardAuthor} numberOfLines={1}>{item.author}</Text>
        <View style={s.cardFooter}>
          <View style={s.cityRow}>
            <Ionicons name="location-outline" size={10} color={C.muted} />
            <Text style={s.cardCity} numberOfLines={1}>{item.city}</Text>
          </View>
          {priceLabel ? (
            <Text style={[s.priceTxt, { color: priceColor }]}>{priceLabel}</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function WishlistScreen() {
  const navigation = useNavigation<any>();
  const { user }   = useAuthStore();
  const { isRTL }  = useLanguageStore();

  const { wishlistBooks, favoriteIds, setWishlistBooks } = useDataStore();
  // Filter through favoriteIds so optimistic unfavorite removes the card instantly
  const books = wishlistBooks.filter(b => favoriteIds.includes(b.id));
  // Show skeleton only on the very first load
  const [loading, setLoading]       = useState(
    () => !!user && useDataStore.getState().wishlistFetchedAt === 0
  );
  const [refreshing, setRefreshing] = useState(false);

  const fetchWishlist = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('book_id, books(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const wishlist = (data || [])
        .map((fav: any) => fav.books)
        .filter(Boolean);

      setWishlistBooks(wishlist as Book[]);
    } catch (e) {
      console.error('WishlistScreen fetchWishlist:', e);
      // Stamp fetchedAt on failure to engage TTL backoff (prevents retry every focus)
      setWishlistBooks(useDataStore.getState().wishlistBooks);
    } finally {
      setLoading(false);
    }
  }, [user, setWishlistBooks]);

  // SWR: show cached data immediately; background-fetch only if stale
  useFocusEffect(useCallback(() => {
    const store = useDataStore.getState();
    const hasCache = store.wishlistFetchedAt > 0;
    if (hasCache && !store.isWishlistStale()) return;
    if (!hasCache) setLoading(true);
    fetchWishlist();
  }, [fetchWishlist]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchWishlist();
    setRefreshing(false);
  }, [fetchWishlist]);

  const goToBook = (id: string) => navigation.navigate('BookDetail', { bookId: id });

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <View style={s.container}>
        <View style={s.loginPrompt}>
          <View style={s.loginIconWrap}>
            <Ionicons name="heart-outline" size={44} color={C.pink} />
          </View>
          <Text style={s.loginTitle}>
            {isRTL ? 'התחבר כדי לראות מועדפים' : 'Sign in to see your favorites'}
          </Text>
          <Text style={s.loginSub}>
            {isRTL ? 'שמור ספרים שאתה אוהב' : 'Save books you love for later'}
          </Text>
        </View>
      </View>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.container}>
        <WishlistSkeletons />
      </View>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (books.length === 0) {
    return (
      <View style={s.container}>
        <View style={s.empty}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="heart-outline" size={40} color={C.pink} />
          </View>
          <Text style={s.emptyTitle}>
            {isRTL ? 'אין מועדפים עדיין' : 'No saved books yet'}
          </Text>
          <Text style={s.emptySub}>
            {isRTL
              ? 'לחץ על ♡ בכל ספר כדי לשמור אותו כאן'
              : 'Tap ♡ on any book to save it here'}
          </Text>

          {/* Step guide */}
          <View style={s.steps}>
            {(isRTL
              ? ['עיין בקטלוג', 'לחץ ♡ על ספר', 'מצא אותו כאן']
              : ['Browse the catalog', 'Tap ♡ on a book', 'Find it here anytime']
            ).map((step, i) => (
              <View key={i} style={s.step}>
                <View style={s.stepNum}>
                  <Text style={s.stepNumTxt}>{i + 1}</Text>
                </View>
                <Text style={s.stepTxt}>{step}</Text>
                {i < 2 && <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={14} color={C.muted} />}
              </View>
            ))}
          </View>

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
      </View>
    );
  }

  // ── Grid ───────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* Count header */}
      <View style={s.countBar}>
        <Ionicons name="heart" size={14} color={C.pink} />
        <Text style={s.countTxt}>
          {isRTL ? `${books.length} ספרים שמורים` : `${books.length} saved book${books.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      <FlatList
        data={books}
        keyExtractor={b => b.id}
        renderItem={({ item }) => (
          <BookCard item={item} isRTL={isRTL} onPress={() => goToBook(item.id)} />
        )}
        numColumns={2}
        columnWrapperStyle={s.row}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  // Login prompt
  loginPrompt:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loginIconWrap: { width: 88, height: 88, borderRadius: 24, backgroundColor: '#fce7f3', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  loginTitle:    { fontSize: 20, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 8 },
  loginSub:      { fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 21 },

  // Empty
  empty:        { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIconWrap:{ width: 88, height: 88, borderRadius: 24, backgroundColor: '#fce7f3', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle:   { fontSize: 18, fontWeight: '600', color: C.text, marginBottom: 8, textAlign: 'center' },
  emptySub:     { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  // Step guide
  steps:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  step:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepNum:    { width: 22, height: 22, borderRadius: 11, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  stepNumTxt: { fontSize: 11, fontWeight: '700', color: C.primary },
  stepTxt:    { fontSize: 12, color: C.sub, fontWeight: '500' },

  browseBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  browseBtnTxt: { color: C.white, fontSize: 15, fontWeight: '600' },

  // Count bar
  countBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  countTxt: { fontSize: 13, color: C.sub, fontWeight: '500' },

  // Grid
  listContent: { padding: 16, paddingBottom: 40 },
  row:         { justifyContent: 'space-between', marginBottom: GAP },

  // Card
  card: {
    width: CARD_W, backgroundColor: C.white, borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: C.border,
  },
  imgBox:     { width: '100%', aspectRatio: 3 / 4, backgroundColor: C.border },
  cardImg:    { width: '100%', height: '100%' },

  // Heart button overlay
  heartBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center', alignItems: 'center',
  },
  heartBtnRTL: { right: undefined, left: 6 },

  cardBody:   { padding: 10 },
  cardTitle:  { fontSize: 13, fontWeight: '600', color: C.text, lineHeight: 17, marginBottom: 2 },
  cardAuthor: { fontSize: 11, color: C.sub, marginBottom: 6 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cityRow:    { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1, marginRight: 4 },
  cardCity:   { fontSize: 11, color: C.muted, flexShrink: 1 },
  priceTxt:   { fontSize: 13, fontWeight: '600', flexShrink: 0 },
});

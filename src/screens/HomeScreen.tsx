import React, { useState, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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
import { useLocationStore } from '../stores/locationStore';
import { haversineKm, formatDistance } from '../lib/locationUtils';
import { CITY_COORDS } from '../constants/categoryGenreMap';
import { GENRE_LABEL_MAP, DB_VALUE_TO_LABEL } from '../constants/books';
import type { HomeScreenNavigationProp } from '../types/navigation';
import { HomeSkeletons } from '../components/Skeleton';
import { useDataStore } from '../stores/dataStore';
import { useFavorite } from '../hooks/useFavorite';
import { FetchErrorBanner } from '../components/Toast';

function getTimeGreeting(isRTL: boolean): string {
  const h = new Date().getHours();
  if (isRTL) {
    if (h < 2)  return 'לילה טוב';
    if (h < 12) return 'בוקר טוב';
    if (h < 17) return 'צהריים טובים';
    if (h < 23) return 'ערב טוב';
    return 'לילה טוב';
  }
  if (h < 2)  return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 23) return 'Good evening';
  return 'Good night';
}

const QUICK_CHIPS = [
  { key: 'free',  labelEn: 'Free',  labelHe: 'חינם',  icon: 'gift-outline',           color: '#059669', bg: '#d1fae5', filter: 'free'  },
  { key: 'sale',  labelEn: 'Sale',  labelHe: 'מכירה', icon: 'pricetag-outline',        color: '#2563eb', bg: '#eff6ff', filter: 'sale'  },
  { key: 'trade', labelEn: 'Trade', labelHe: 'החלפה', icon: 'swap-horizontal-outline', color: '#d97706', bg: '#fef3c7', filter: 'trade' },
  { key: 'all',   labelEn: 'All',   labelHe: 'הכל',   icon: 'grid-outline',            color: '#78716c', bg: '#f5f5f4', filter: null    },
] as const;

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
  amberLight:   '#fef3c7',
  pink:         '#db2777',
  pinkLight:    '#fce7f3',
  purple:       '#7c3aed',
  purpleLight:  '#f5f3ff',
};

const CARD_W = 156;

// ── Condition badge helpers ────────────────────────────────────────────────
const COND_BG:    Record<string, string> = { new: '#d1fae5', like_new: '#ede9fe', good: '#f5f5f4', fair: '#fef3c7' };
const COND_COLOR: Record<string, string> = { new: '#059669', like_new: '#7c3aed', good: '#78716c', fair: '#d97706' };
const COND_EN:    Record<string, string> = { new: 'New', like_new: 'Like New', good: 'Good', fair: 'Fair' };
const COND_HE:    Record<string, string> = { new: 'חדש', like_new: 'כמו חדש', good: 'טוב', fair: 'סביר' };

// Genre label lookup: DB sub-values first, fall back to top-level keys
function getGenreLabel(g: string, isRTL: boolean): string {
  const label = DB_VALUE_TO_LABEL[g] ?? GENRE_LABEL_MAP[g];
  if (!label) return g;
  return isRTL ? label.he : label.en;
}

// ── Book card ─────────────────────────────────────────────────────────────

interface CardProps { item: Book; isRTL: boolean; onPress: (id: string) => void; distance?: string; }

const BookCard = memo(({ item, isRTL, onPress, distance }: CardProps) => {
  const handlePress = useCallback(() => onPress(item.id), [onPress, item.id]);
  const { isFavorite, toggleFavorite } = useFavorite(item.id);

  let badge: { label: string; color: string } | null = null;
  if (item.listing_type === 'sale' && item.price)
    badge = { label: `₪${item.price}`, color: C.primary };
  else if (item.listing_type === 'free')
    badge = { label: isRTL ? 'חינם' : 'Free', color: C.emerald };
  else if (item.listing_type === 'trade')
    badge = { label: isRTL ? 'החלפה' : 'Trade', color: C.amber };

  const genres: string[] = (item as any).genres ?? [];
  const cond = (item as any).condition as string | undefined;

  return (
    <TouchableOpacity style={s.card} onPress={handlePress} activeOpacity={0.85}>
      <View style={s.imgBox}>
        <Image
          source={{ uri: item.images?.[0] || `https://picsum.photos/seed/${item.id}/300/400` }}
          style={s.img}
          contentFit="cover"
          cachePolicy="disk"
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
            size={22}
            color={isFavorite ? C.pink : 'rgba(255,255,255,0.95)'}
          />
        </TouchableOpacity>
      </View>
      <View style={s.cardBody}>
        <Text style={[s.cardTitle, isRTL && s.rAlign]} numberOfLines={2}>{item.title}</Text>
        <Text style={[s.cardAuthor, isRTL && s.rAlign]} numberOfLines={1}>
          {item.author || (isRTL ? 'מחבר לא ידוע' : 'Unknown')}
        </Text>
        {(cond || genres.length > 0) && (
          <View style={[s.genreRow, isRTL && s.rowRev]}>
            {cond && COND_BG[cond] && (
              <View style={[s.condPill, { backgroundColor: COND_BG[cond] }]}>
                <Text style={[s.condPillTxt, { color: COND_COLOR[cond] }]} numberOfLines={1}>
                  {isRTL ? COND_HE[cond] : COND_EN[cond]}
                </Text>
              </View>
            )}
            {genres.slice(0, cond ? 1 : 2).map(g => (
              <View key={g} style={s.genrePill}>
                <Text style={s.genrePillTxt} numberOfLines={1}>
                  {getGenreLabel(g, isRTL)}
                </Text>
              </View>
            ))}
          </View>
        )}
        <View style={s.cardFooter}>
          <View style={s.cityRow}>
            <Ionicons name="location-outline" size={10} color={C.muted} />
            <Text style={s.cardCity} numberOfLines={1}>
              {item.city}
            </Text>
          </View>
          {badge && (
            <Text style={[s.priceTxt, { color: badge.color }]}>{badge.label}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ── Section header ────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string; sub: string; color: string; isRTL: boolean; onSeeAll: () => void;
}

const SectionHeader = memo(({ title, sub, color, isRTL, onSeeAll }: SectionHeaderProps) => {
  const seeAllLabel = isRTL ? 'הכל' : 'All';
  if (isRTL) {
    return (
      <View style={s.secHead}>
        <TouchableOpacity style={s.seeAllBtn} onPress={onSeeAll} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={14} color={color} />
          <Text style={[s.seeAllTxt, { color }]}>{seeAllLabel}</Text>
        </TouchableOpacity>
        <View style={s.secTitleRowRTL}>
          <View style={s.titleTexts}>
            <Text style={[s.secTitle, s.rAlign]}>{title}</Text>
            <Text style={[s.secSub, s.rAlign]}>{sub}</Text>
          </View>
          <View style={[s.accentBar, { backgroundColor: color }]} />
        </View>
      </View>
    );
  }
  return (
    <View style={s.secHead}>
      <View style={s.secTitleRowLTR}>
        <View style={[s.accentBar, { backgroundColor: color }]} />
        <View style={s.titleTexts}>
          <Text style={s.secTitle}>{title}</Text>
          <Text style={s.secSub}>{sub}</Text>
        </View>
      </View>
      <TouchableOpacity style={s.seeAllBtn} onPress={onSeeAll} activeOpacity={0.7}>
        <Text style={[s.seeAllTxt, { color }]}>{seeAllLabel}</Text>
        <Ionicons name="chevron-forward" size={14} color={color} />
      </TouchableOpacity>
    </View>
  );
});

// ── Section row ───────────────────────────────────────────────────────────

interface SectionRowProps {
  id: string;
  title: string;
  sub: string;
  color: string;
  books: Book[];
  distances?: Record<string, string>;
  isRTL: boolean;
  onSeeAll: () => void;
  onBookPress: (id: string) => void;
}

// Mirror transform for RTL horizontal lists — flips scroll direction naturally
const RTL_FLIP = { transform: [{ scaleX: -1 }] } as const;

const SectionRow = memo(({ id, title, sub, color, books, distances, isRTL, onSeeAll, onBookPress }: SectionRowProps) => {
  const renderItem = useCallback(({ item }: { item: Book }) => (
    // Double-flip: FlatList is mirrored, each item mirrors back so content reads normally
    <View style={isRTL ? RTL_FLIP : undefined}>
      <BookCard item={item} isRTL={isRTL} onPress={onBookPress} distance={distances?.[item.id]} />
    </View>
  ), [isRTL, onBookPress, distances]);

  const keyExtractor = useCallback((b: Book) => `${id}-${b.id}`, [id]);

  if (books.length === 0) return null;

  return (
    <View style={s.section}>
      <SectionHeader title={title} sub={sub} color={color} isRTL={isRTL} onSeeAll={onSeeAll} />
      <FlatList
        horizontal
        data={books}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={s.rowList}
        showsHorizontalScrollIndicator={false}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        removeClippedSubviews
        // RTL: mirror the whole list so item[0] appears on the right
        style={isRTL ? RTL_FLIP : undefined}
        ListFooterComponent={
          // Mirror back so text/icon read normally; chevron-back = visually left-pointing ✓
          <View style={isRTL ? RTL_FLIP : undefined}>
            <TouchableOpacity style={[s.seeAllCard, { borderColor: color }]} onPress={onSeeAll} activeOpacity={0.85}>
              <View style={[s.seeAllIconWrap, { backgroundColor: color + '18' }]}>
                <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={22} color={color} />
              </View>
              <Text style={[s.seeAllCardTxt, { color }]}>{isRTL ? 'לכולם' : 'See all'}</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
});

// ── Main screen ───────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const profile = useAuthStore(s => s.profile);
  const isRTL   = useLanguageStore(s => s.isRTL);
  const coords  = useLocationStore(s => s.coords);

  const { homeBooks: books, setHomeBooks, blockedIds } = useDataStore();
  // Show skeleton only on the very first load (fetchedAt === 0 means never fetched)
  const [loading, setLoading]       = useState(() => useDataStore.getState().homeFetchedAt === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const fetchBooks = useCallback(async () => {
    try {
      // Fetch recent books + free books in parallel.
      // Free books get their own query so they're never crowded out by the
      // main date-sorted window (most books are 'sale', which dominates the top N).
      const sel = 'id,title,author,city,images,listing_type,price,condition,genres,created_at,user_id';
      const [mainRes, freeRes] = await Promise.all([
        supabase.from('books').select(sel).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(300),
        supabase.from('books').select(sel).eq('status', 'active')
          .eq('listing_type', 'free').order('created_at', { ascending: false }).limit(50),
      ]);
      const main  = (mainRes.data  as Book[]) || [];
      const free  = (freeRes.data  as Book[]) || [];
      const seen  = new Set(main.map(b => b.id));
      const merged = [...main, ...free.filter(b => !seen.has(b.id))];
      setFetchError(false);
      setHomeBooks(merged);
    } catch {
      setFetchError(true);
      setHomeBooks(useDataStore.getState().homeBooks);
    }
  }, [setHomeBooks]);

  // SWR: on focus show cached data immediately; background-fetch only if stale
  useFocusEffect(useCallback(() => {
    const store = useDataStore.getState();
    const hasCache = store.homeFetchedAt > 0;  // fetched at least once
    if (hasCache && !store.isHomeStale()) return;
    if (!hasCache) setLoading(true);
    fetchBooks().finally(() => setLoading(false));
  }, [fetchBooks]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBooks();
    setRefreshing(false);
  }, [fetchBooks]);

  // ── GPS-aware sections ────────────────────────────────────────────────
  const { sections } = useMemo(() => {
    const visibleBooks = blockedIds.length > 0
      ? books.filter(b => !blockedIds.includes(b.user_id))
      : books;
    const take = (arr: Book[]) => arr.slice(0, 16);

    const distanceMap: Record<string, number> = {};
    if (coords) {
      visibleBooks.forEach(b => {
        const c = CITY_COORDS[b.city];
        if (c) distanceMap[b.id] = haversineKm(coords.latitude, coords.longitude, c.lat, c.lng);
      });
    }

    let nearbyBooks: Book[] = [];
    const distLabels: Record<string, string> = {};

    if (coords && Object.keys(distanceMap).length > 0) {
      nearbyBooks = [...visibleBooks]
        .filter(b => distanceMap[b.id] !== undefined && distanceMap[b.id] < 50)
        .sort((a, b) => distanceMap[a.id] - distanceMap[b.id])
        .slice(0, 8);
      nearbyBooks.forEach(b => {
        distLabels[b.id] = formatDistance(distanceMap[b.id]);
      });
    } else if (profile?.city) {
      nearbyBooks = take(visibleBooks.filter(b => b.city === profile.city));
    }

    const result = [
      {
        id: 'recent',
        titleHe: 'חדש ב-BookLoop', titleEn: 'New on BookLoop',
        subHe: 'הספרים האחרונים שנוספו', subEn: 'Latest listings',
        color: C.primary, books: take(visibleBooks), distances: undefined,
      },
      {
        id: 'free',
        titleHe: 'ספרים חינם', titleEn: 'Free Books',
        subHe: 'כי שיתוף זה כיף', subEn: 'Sharing is caring',
        color: C.emerald, books: take(visibleBooks.filter(b => b.listing_type === 'free')), distances: undefined,
      },
      {
        id: 'mint',
        titleHe: 'כמו חדשים', titleEn: 'Like New',
        subHe: 'ספרים במצב מעולה', subEn: 'Excellent condition',
        color: C.pink, books: take(visibleBooks.filter(b => b.condition === 'new' || b.condition === 'like_new')), distances: undefined,
      },
      {
        id: 'sale',
        titleHe: 'למכירה', titleEn: 'For Sale',
        subHe: 'במחירים משתלמים', subEn: 'Great prices',
        color: C.primary, books: take(visibleBooks.filter(b => b.listing_type === 'sale')), distances: undefined,
      },
      {
        id: 'trade',
        titleHe: 'להחלפה', titleEn: 'For Trade',
        subHe: 'ספר תמורת ספר', subEn: 'Book for a book',
        color: C.amber, books: take(visibleBooks.filter(b => b.listing_type === 'trade')), distances: undefined,
      },
    ];

    if (nearbyBooks.length > 0) {
      result.splice(1, 0, {
        id: 'nearby',
        titleHe: 'קרוב אליך', titleEn: 'Near You',
        subHe: coords ? 'ממוין לפי מרחק' : `ספרים ב${profile?.city}`,
        subEn: coords ? 'Sorted by distance' : `Books in ${profile?.city}`,
        color: C.purple,
        books: nearbyBooks,
        distances: Object.keys(distLabels).length > 0 ? distLabels : undefined,
      });
    }

    return { sections: result };
  }, [books, coords, profile?.city, blockedIds]);

  const goToCatalog       = useCallback(() => navigation.navigate('Catalog' as any), [navigation]);
  const goToCatalogWith   = useCallback((filter: string | null) => {
    if (filter) navigation.navigate('Catalog' as any, { initialListingType: filter });
    else navigation.navigate('Catalog' as any);
  }, [navigation]);
  const goToBook = useCallback((id: string) => navigation.navigate('BookDetail', { bookId: id }), [navigation]);

  const firstName = profile?.name?.split(' ')[0] || '';

  const header = (
    <>
      {/* ── Hero ── */}
      <View style={s.hero}>
        <View style={[s.heroTop, isRTL && s.heroTopRTL]}>
          <View style={s.heroTextCol}>
            <Text style={[s.greeting, isRTL && s.rAlign]}>
              {getTimeGreeting(isRTL)}{firstName ? `, ${firstName}` : ''}
            </Text>
            {books.length > 0 && (
              <View style={[s.statChip, isRTL && s.statChipRTL]}>
                <View style={s.statDot} />
                <Text style={s.statTxt}>
                  {isRTL ? `${books.length}+ ספרים זמינים` : `${books.length}+ books available`}
                </Text>
              </View>
            )}
          </View>
        </View>
        {/* Tappable search shortcut → goes to Catalog */}
        <TouchableOpacity
          style={[s.searchShortcut, isRTL && s.searchShortcutRTL]}
          onPress={goToCatalog}
          activeOpacity={0.75}
        >
          <Ionicons name="search-outline" size={16} color={C.muted} />
          <Text style={s.searchShortcutTxt}>
            {isRTL ? 'חיפוש ספרים...' : 'Search books...'}
          </Text>
          <View style={s.searchKbd}>
            <Ionicons name="options-outline" size={14} color={C.muted} />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Quick filter chips ── */}
      <View style={s.quickWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.quickRow, isRTL && s.quickRowRev]}
        >
          {QUICK_CHIPS.map(chip => (
            <TouchableOpacity
              key={chip.key}
              style={[s.quick, { backgroundColor: chip.bg }]}
              onPress={() => goToCatalogWith(chip.filter)}
              activeOpacity={0.8}
            >
              <Ionicons name={chip.icon as any} size={14} color={chip.color} />
              <Text style={[s.quickTxt, { color: chip.color }]}>
                {isRTL ? chip.labelHe : chip.labelEn}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </>
  );

  if (loading) {
    return (
      <ScrollView style={s.container} showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        {header}
        <HomeSkeletons />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={s.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
    >
      {header}

      {/* ── Error / Empty state ── */}
      {books.length === 0 && fetchError ? (
        <View style={s.empty}>
          <View style={[s.emptyIconWrap, { backgroundColor: '#fee2e2' }]}>
            <Ionicons name="cloud-offline-outline" size={44} color="#ef4444" />
          </View>
          <Text style={s.emptyTitle}>
            {isRTL ? 'לא הצלחנו לטעון ספרים' : 'Couldn\'t load books'}
          </Text>
          <Text style={s.emptySub}>
            {isRTL ? 'משוך למטה כדי לנסות שוב' : 'Pull down to try again'}
          </Text>
        </View>
      ) : books.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIconWrap}>
            <Ionicons name="library-outline" size={44} color={C.primary} />
          </View>
          <Text style={s.emptyTitle}>
            {isRTL ? 'אין ספרים עדיין' : 'No books yet'}
          </Text>
          <Text style={s.emptySub}>
            {isRTL ? 'היה הראשון לפרסם ספר!' : 'Be the first to list a book!'}
          </Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => navigation.navigate('Publish' as never)} activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={s.emptyBtnTxt}>{isRTL ? 'פרסם ספר' : 'List a Book'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        sections.map(sec => (
          <SectionRow
            key={sec.id}
            id={sec.id}
            title={isRTL ? sec.titleHe : sec.titleEn}
            sub={isRTL ? sec.subHe : sec.subEn}
            color={sec.color}
            books={sec.books}
            distances={sec.distances}
            isRTL={isRTL}
            onSeeAll={goToCatalog}
            onBookPress={goToBook}
          />
        ))
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { paddingBottom: 40 },

  // ── Hero ──
  hero: {
    backgroundColor: C.white,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  heroTop:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  heroTopRTL:   { flexDirection: 'row-reverse' },
  heroTextCol:  { flex: 1 },
  greeting:     { fontSize: 23, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 6, alignSelf: 'flex-start',
  },
  statChipRTL:  { alignSelf: 'flex-end' },
  statDot:      { width: 7, height: 7, borderRadius: 4, backgroundColor: C.emerald },
  statTxt:      { fontSize: 12, color: C.sub, fontWeight: '500' },
  searchShortcut: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.bg,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  searchShortcutRTL:   { flexDirection: 'row-reverse' },
  searchShortcutTxt:   { flex: 1, fontSize: 14, color: C.muted },
  searchKbd: {
    width: 26, height: 26, borderRadius: 7,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },

  // ── Quick filter chips ──
  quickWrap: {
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 10,
  },
  quickRow:    { paddingHorizontal: 20, gap: 8 },
  quickRowRev: { flexDirection: 'row-reverse' },
  quick: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20,
  },
  quickTxt: { fontSize: 13, fontWeight: '600' },

  // ── Empty state ──
  empty:         { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyIconWrap: { width: 96, height: 96, borderRadius: 28, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle:    { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 8, textAlign: 'center' },
  emptySub:      { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 21, marginBottom: 28 },
  emptyBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.primary, paddingVertical: 13, paddingHorizontal: 28, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2 },
  emptyBtnTxt:   { color: C.white, fontSize: 15, fontWeight: '600' },

  // ── Sections ──
  section: { marginTop: 28 },
  secHead: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, marginBottom: 14,
  },
  secTitleRowLTR: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  secTitleRowRTL: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-end' },
  accentBar:  { width: 4, height: 34, borderRadius: 2 },
  titleTexts: { flex: 1 },
  secTitle:   { fontSize: 16, fontWeight: '700', color: C.text },
  secSub:     { fontSize: 12, color: C.muted, marginTop: 1 },
  seeAllBtn:  { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4, paddingHorizontal: 6 },
  seeAllTxt:  { fontSize: 13, fontWeight: '600' },

  rowList: { paddingHorizontal: 20, gap: 12, alignItems: 'center' },

  seeAllCard: {
    width: 80,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    marginLeft: 4,
    paddingHorizontal: 8,
  },
  seeAllIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  seeAllCardTxt: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  // ── Book card ──
  card: {
    width: CARD_W, backgroundColor: C.white, borderRadius: 16,
    overflow: 'hidden', borderWidth: 1, borderColor: C.border,
  },
  imgBox: { width: '100%', aspectRatio: 3 / 4, backgroundColor: C.border },
  img:    { width: '100%', height: '100%' },

  // Condition badge (overlay on image)
  condPill:    { borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6 },
  condPillTxt: { fontSize: 10, fontWeight: '600' },

  // Heart / favorite button (overlay on image, opposite corner from condition badge)
  heartBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 32, height: 32,
    justifyContent: 'center', alignItems: 'center',
  },
  heartBtnRTL: { right: undefined, left: 6 },

  cardBody:   { padding: 10 },
  cardTitle:  { fontSize: 13, fontWeight: '600', color: C.text, lineHeight: 17, marginBottom: 2 },
  cardAuthor: { fontSize: 11, color: C.sub, marginBottom: 4 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  cityRow:    { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1, marginRight: 6 },
  cardCity:   { fontSize: 11, color: C.muted, flexShrink: 1 },
  priceTxt:   { fontSize: 16, fontWeight: '600', flexShrink: 0 },

  // Genre pills — warm neutral (not blue)
  genreRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  genrePill:   { backgroundColor: '#f5f5f4', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  genrePillTxt:{ fontSize: 10, fontWeight: '500', color: C.sub },

  rAlign:  { textAlign: 'right' },
  rowRev:  { flexDirection: 'row-reverse' },
});

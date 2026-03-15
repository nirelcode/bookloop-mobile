import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  ScrollView,
  RefreshControl,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Book } from '../types';
import { useLanguageStore } from '../stores/languageStore';
import { useLocationStore } from '../stores/locationStore';
import { haversineKm } from '../lib/locationUtils';
import i18n from '../lib/i18n';
import type { CatalogScreenNavigationProp } from '../types/navigation';
import FiltersModal from '../components/FiltersModal';
import { GENRE_DB_GROUPS, CITY_COORDS, GENRE_LABEL_MAP, DB_VALUE_TO_LABEL } from '../constants/books';
import { CatalogSkeletons } from '../components/Skeleton';
import { useFavorite } from '../hooks/useFavorite';
import { FetchErrorBanner } from '../components/Toast';
import { useDataStore } from '../stores/dataStore';

const H_PAD = 16;
const COL_GAP = 10;

function getNumColumns(screenW: number) {
  if (screenW >= 900) return 4;
  if (screenW >= 600) return 3;
  return 2;
}

function getCardWidth(screenW: number, numColumns: number) {
  return (screenW - H_PAD * 2 - COL_GAP * (numColumns - 1)) / numColumns;
}

const C = {
  bg: '#fafaf9',
  white: '#ffffff',
  border: '#e7e5e4',
  text: '#1c1917',
  sub: '#78716c',
  muted: '#a8a29e',
  primary: '#2563eb',
  primaryLight: '#eff6ff',
  emerald: '#059669',
  emeraldLight: '#d1fae5',
  amber: '#d97706',
  amberLight: '#fef3c7',
  inputBg: '#f5f5f4',
  pink: '#db2777',
};

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

// ── Filter chip helpers ────────────────────────────────────────────────────

interface Chip { key: string; label: string }

function buildChips(filters: any, isRTL: boolean): Chip[] {
  const chips: Chip[] = [];
  if (filters.listingType) {
    const map: Record<string, string> = {
      free:  isRTL ? 'חינם'   : 'Free',
      sale:  isRTL ? 'מכירה'  : 'Sale',
      trade: isRTL ? 'החלפה'  : 'Trade',
    };
    chips.push({ key: 'listingType', label: map[filters.listingType] ?? filters.listingType });
  }
  if (filters.genres?.length) {
    (filters.genres as string[]).forEach(g => {
      chips.push({ key: `genre:${g}`, label: getGenreLabel(g, isRTL) });
    });
  }
  if (filters.conditions?.length) {
    filters.conditions.forEach((c: string) =>
      chips.push({ key: `condition:${c}`, label: i18n.t(`book.condition.${c}`) })
    );
  }
  if (filters.city) {
    chips.push({ key: 'city', label: filters.city });
  }
  if (filters.nearMe) {
    chips.push({ key: 'nearMe', label: isRTL ? 'קרוב אליי' : 'Near Me' });
  }
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined) {
    chips.push({ key: 'price', label: `₪${filters.minPrice} – ₪${filters.maxPrice}` });
  } else if (filters.minPrice !== undefined) {
    chips.push({ key: 'price', label: `₪${filters.minPrice}+` });
  } else if (filters.maxPrice !== undefined) {
    chips.push({ key: 'price', label: isRTL ? `עד ₪${filters.maxPrice}` : `Up to ₪${filters.maxPrice}` });
  }
  if (filters.shipping) {
    chips.push({ key: 'shipping', label: isRTL ? 'משלוח' : 'Shipping' });
  }
  return chips;
}

function dropChip(filters: any, key: string) {
  const next = { ...filters };
  if (key === 'price') { delete next.minPrice; delete next.maxPrice; }
  else if (key.startsWith('genre:')) {
    const g = key.slice(6);
    next.genres = (next.genres as string[] || []).filter((x: string) => x !== g);
    if (next.genres.length === 0) delete next.genres;
  } else if (key.startsWith('condition:')) {
    const c = key.slice(10);
    next.conditions = (next.conditions as string[] || []).filter((x: string) => x !== c);
    if (next.conditions.length === 0) delete next.conditions;
  } else delete next[key];
  return next;
}

// ── Book card (portrait, 2-col) ────────────────────────────────────────────

function BookCard({ item, isRTL, onPress, cardWidth }: { item: Book; isRTL: boolean; onPress: () => void; cardWidth: number }) {
  const { isFavorite, toggleFavorite } = useFavorite(item.id);

  let badge: { label: string; fg2: string } | null = null;
  if (item.listing_type === 'sale' && item.price)
    badge = { label: `₪${item.price}`, fg2: C.primary };
  else if (item.listing_type === 'free')
    badge = { label: isRTL ? 'חינם' : 'Free', fg2: C.emerald };
  else if (item.listing_type === 'trade')
    badge = { label: isRTL ? 'החלפה' : 'Trade', fg2: C.amber };

  const genres: string[] = (item as any).genres ?? [];
  const cond = (item as any).condition as string | undefined;

  return (
    <TouchableOpacity style={[s.card, { width: cardWidth }]} onPress={onPress} activeOpacity={0.82}>
      <View style={s.imgBox}>
        <Image
          source={{ uri: item.images?.[0] ?? `https://picsum.photos/seed/${item.id}/300/400` }}
          style={s.img}
          contentFit="cover"
          cachePolicy="disk"
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
          <View style={[s.genreRow, isRTL && { flexDirection: 'row-reverse' }]}>
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
            <Ionicons name="location-outline" size={11} color={C.muted} />
            <Text style={s.cardCity} numberOfLines={1}>{item.city}</Text>
          </View>
          {badge && (
            <Text style={[s.priceTxt, { color: badge.fg2 }]}>{badge.label}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

type SortOption = 'new' | 'price_asc' | 'price_desc';

const SORT_OPTIONS: { value: SortOption; labelEn: string; labelHe: string; icon: string }[] = [
  { value: 'new',        labelEn: 'Newest First',       labelHe: 'חדש ראשון',        icon: 'time-outline'          },
  { value: 'price_asc',  labelEn: 'Price: Low to High', labelHe: 'מחיר: נמוך לגבוה', icon: 'trending-up-outline'   },
  { value: 'price_desc', labelEn: 'Price: High to Low', labelHe: 'מחיר: גבוה לנמוך', icon: 'trending-down-outline' },
];

const ITEMS_PER_PAGE = 20;
const NEAR_ME_RADIUS_KM = 25;

const DEBUG_COORDS: { latitude: number; longitude: number } | null = null;

export default function CatalogScreen() {
  const navigation  = useNavigation<CatalogScreenNavigationProp>();
  const route       = useRoute<any>();
  const { isRTL }     = useLanguageStore();
  const { coords }    = useLocationStore();
  const { blockedIds } = useDataStore();
  const insets      = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const numColumns  = getNumColumns(screenW);
  const cardWidth   = getCardWidth(screenW, numColumns);

  const [books, setBooks]         = useState<Book[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [hasMore, setHasMore]     = useState(true);
  const [page, setPage]           = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [search, setSearch]           = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filters, setFilters]     = useState<any>({});
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort]           = useState<SortOption>('new');
  const [showSort, setShowSort]   = useState(false);

  // ── Near Me waterfall state (refs so they don't trigger re-renders) ───────
  const nearMeCityQueueRef = useRef<string[]>([]);
  const nearMeCityIndexRef = useRef(0);
  const nearMeCityPageRef  = useRef(0);

  // ── Collapsible header ────────────────────────────────────────────────────
  const collapsibleAnim = useRef(new Animated.Value(1)).current;
  const lastScrollY     = useRef(0);
  const isCollapsed     = useRef(false);

  const expandHeader = useCallback(() => {
    if (!isCollapsed.current) return;
    isCollapsed.current = false;
    Animated.timing(collapsibleAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
  }, []);

  const handleScroll = useCallback((e: any) => {
    const y    = e.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    lastScrollY.current = y;
    if (diff > 8 && !isCollapsed.current && y > 40) {
      isCollapsed.current = true;
      Animated.timing(collapsibleAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
    } else if (diff < -8 && isCollapsed.current) {
      isCollapsed.current = false;
      Animated.timing(collapsibleAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    }
  }, []);

  // Remove Near Me filter if location permission is revoked
  useEffect(() => {
    if (!coords && filters.nearMe) {
      setFilters((prev: any) => { const next = { ...prev }; delete next.nearMe; return next; });
    }
  }, [coords]);

  // Apply initial listing type filter when navigating from HomeScreen quick chips
  useEffect(() => {
    const initial = route.params?.initialListingType as string | undefined;
    if (initial) setFilters({ listingType: initial });
  }, [route.params?.initialListingType]);

  // Debounce search — only fire query 350ms after the user stops typing
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [search]);

  const chips = buildChips(filters, isRTL);

  // ── Fetch ──────────────────────────────────────────────────────

  const fetchBooks = useCallback(async (reset = false) => {
    if (!hasMore && !reset) return;
    const currentPage = reset ? 0 : page;
    if (reset) {
      setLoading(true);
      setBooks([]);
      setPage(0);
      setHasMore(true);
      setTotalCount(null);
    } else {
      setLoadingMore(true);
    }

    try {
      let query = supabase
        .from('books')
        .select('id,title,author,city,images,listing_type,price,condition,genres,created_at,location_lat,location_lng,user_id', { count: 'exact' })
        .eq('status', 'active');

      if (blockedIds.length > 0) {
        query = query.not('user_id', 'in', `(${blockedIds.join(',')})`);
      }

      const effectiveCoords = DEBUG_COORDS ?? coords;
      const isNearMe = !!(filters.nearMe && effectiveCoords);

      if (isNearMe) {
        // ── Near Me waterfall: fetch one city at a time in distance order ──
        if (reset) {
          const queue = Object.entries(CITY_COORDS)
            .map(([city, cc]) => ({ city, dist: haversineKm(effectiveCoords!.latitude, effectiveCoords!.longitude, cc.lat, cc.lng) }))
            .filter(({ dist }) => dist <= NEAR_ME_RADIUS_KM)
            .sort((a, b) => a.dist - b.dist)
            .map(c => c.city);
          nearMeCityQueueRef.current  = queue;
          nearMeCityIndexRef.current  = 0;
          nearMeCityPageRef.current   = 0;
        }

        const queue = nearMeCityQueueRef.current;
        const ci    = nearMeCityIndexRef.current;
        const cp    = nearMeCityPageRef.current;

        if (ci >= queue.length) {
          setHasMore(false);
          return;
        }

        query = query
          .eq('city', queue[ci])
          .order('created_at', { ascending: false })
          .range(cp * ITEMS_PER_PAGE, (cp + 1) * ITEMS_PER_PAGE - 1);

        if (debouncedSearch)           query = query.or(`title.ilike.%${debouncedSearch}%,author.ilike.%${debouncedSearch}%`);
        if (filters.listingType)       query = query.eq('listing_type', filters.listingType);
        if (filters.genres?.length) {
          const dbValues = (filters.genres as string[]).flatMap((g: string) => GENRE_DB_GROUPS[g] ?? [g]);
          query = query.overlaps('genres', dbValues);
        }
        if (filters.conditions?.length) query = query.in('condition', filters.conditions);
        if (filters.shipping)           query = query.eq('shipping_type', 'shipping');
        if (filters.minPrice !== undefined) query = query.gte('price', filters.minPrice);
        if (filters.maxPrice !== undefined) query = query.lte('price', filters.maxPrice);

        const { data, error } = await query;
        if (error) throw error;

        const newBooks = (data ?? []) as Book[];

        if (newBooks.length < ITEMS_PER_PAGE) {
          // City exhausted — advance to next city
          nearMeCityIndexRef.current = ci + 1;
          nearMeCityPageRef.current  = 0;
          setHasMore(ci + 1 < queue.length);
        } else {
          nearMeCityPageRef.current = cp + 1;
          setHasMore(true);
        }

        setBooks(prev => reset ? newBooks : [...prev, ...newBooks.filter(b => !prev.some(p => p.id === b.id))]);
        if (reset) setFetchError(false);

      } else {
        // ── Normal mode ────────────────────────────────────────────────────
        if (sort === 'price_asc') {
          query = query.order('price', { ascending: true });
        } else if (sort === 'price_desc') {
          query = query.order('price', { ascending: false });
        } else {
          query = query.order('created_at', { ascending: false });
        }
        query = query.range(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE - 1);

        if (debouncedSearch)             query = query.or(`title.ilike.%${debouncedSearch}%,author.ilike.%${debouncedSearch}%`);
        if (filters.listingType)         query = query.eq('listing_type', filters.listingType);
        if (filters.genres?.length) {
          const dbValues = (filters.genres as string[]).flatMap((g: string) => GENRE_DB_GROUPS[g] ?? [g]);
          query = query.overlaps('genres', dbValues);
        }
        if (filters.conditions?.length)   query = query.in('condition', filters.conditions);
        if (filters.city)                query = query.eq('city', filters.city);
        if (filters.shipping)            query = query.eq('shipping_type', 'shipping');
        if (filters.minPrice !== undefined) query = query.gte('price', filters.minPrice);
        if (filters.maxPrice !== undefined) query = query.lte('price', filters.maxPrice);

        const { data, error, count } = await query;
        if (error) throw error;

        const newBooks = (data ?? []) as Book[];
        setBooks(prev => reset ? newBooks : [...prev, ...newBooks.filter(b => !prev.some(p => p.id === b.id))]);
        setHasMore(newBooks.length === ITEMS_PER_PAGE);
        setPage(currentPage + 1);
        if (reset) {
          setTotalCount(count ?? null);
          setFetchError(false);
        }
      }
    } catch (err) {
      console.error('Error fetching books:', err);
      if (reset) setFetchError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [debouncedSearch, filters, hasMore, page, sort, coords, blockedIds]);

  useEffect(() => { fetchBooks(true); }, [debouncedSearch, filters, sort]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBooks(true);
  }, [debouncedSearch, filters]);

  const removeChip = useCallback((key: string) => {
    setFilters((prev: any) => dropChip(prev, key));
  }, []);

  const goToBook = (id: string) => navigation.navigate('BookDetail', { bookId: id });

  // ── Render ─────────────────────────────────────────────────────

  const renderBook = useCallback(({ item }: { item: Book }) => (
    <BookCard item={item} isRTL={isRTL} onPress={() => goToBook(item.id)} cardWidth={cardWidth} />
  ), [isRTL, cardWidth]);

  const activeFiltersCount = Object.values(filters).filter(v => v !== '' && v !== undefined).length;

  const countLabel = totalCount !== null
    ? isRTL ? `${totalCount} ספרים נמצאו` : `${totalCount} books found`
    : null;

  return (
    <View style={s.container}>

      {/* ── Header ── */}
      <View style={s.header}>
        {/* Search + filter button */}
        <View style={s.searchRow}>
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={16} color={C.muted} style={s.searchIcon} />
            <TextInput
              style={s.searchInput}
              placeholder={i18n.t('catalog.searchPlaceholder')}
              placeholderTextColor={C.muted}
              value={search}
              onChangeText={setSearch}
              onFocus={expandHeader}
              textAlign={isRTL ? 'right' : 'left'}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[s.filterBtn, activeFiltersCount > 0 && s.filterBtnActive]}
            onPress={() => setShowFilters(true)}
          >
            <Ionicons name="options-outline" size={20} color={activeFiltersCount > 0 ? C.white : C.sub} />
            {activeFiltersCount > 0 && (
              <View style={s.filterDot}>
                <Text style={s.filterDotTxt}>{activeFiltersCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Collapsible: chips + count/sort */}
        <Animated.View style={{
          maxHeight: collapsibleAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }),
          opacity: collapsibleAnim,
          overflow: 'hidden',
        }}>
          {/* Active filter chips */}
          {chips.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chipsRow}
              style={s.chipsScroll}
            >
              {chips.map(chip => (
                <TouchableOpacity
                  key={chip.key}
                  style={s.chip}
                  onPress={() => removeChip(chip.key)}
                  activeOpacity={0.75}
                >
                  <Text style={s.chipTxt}>{chip.label}</Text>
                  <Ionicons name="close" size={13} color={C.primary} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={s.chipClear} onPress={() => setFilters({})}>
                <Text style={s.chipClearTxt}>{isRTL ? 'נקה הכל' : 'Clear all'}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* Results count + sort */}
          {!loading && countLabel && (
            <View style={[s.countSortRow, isRTL && s.rowRev]}>
              <Text style={s.countTxt}>{countLabel}</Text>
              {filters.nearMe ? (
                <View style={s.sortBtn}>
                  <Ionicons name="navigate-outline" size={13} color={C.sub} />
                  <Text style={s.sortBtnTxt}>{isRTL ? 'לפי מרחק' : 'By distance'}</Text>
                </View>
              ) : (
                <TouchableOpacity style={s.sortBtn} onPress={() => setShowSort(true)} activeOpacity={0.75}>
                  <Ionicons name="swap-vertical-outline" size={13} color={C.sub} />
                  <Text style={s.sortBtnTxt}>
                    {isRTL
                      ? SORT_OPTIONS.find(o => o.value === sort)?.labelHe
                      : SORT_OPTIONS.find(o => o.value === sort)?.labelEn}
                  </Text>
                  <Ionicons name="chevron-down" size={12} color={C.muted} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </Animated.View>
      </View>

      <FiltersModal
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        onApply={f => setFilters(f)}
        currentFilters={filters}
      />

      <SortSheet
        visible={showSort}
        onClose={() => setShowSort(false)}
        current={sort}
        onSelect={setSort}
        isRTL={isRTL}
      />

      {/* ── Fetch error banner (shown when cached data visible but refresh failed) ── */}
      {fetchError && books.length > 0 && (
        <FetchErrorBanner
          message={isRTL ? 'לא הצלחנו לרענן — מציג נתונים ישנים' : 'Couldn\'t refresh — showing cached results'}
          retryLabel={isRTL ? 'נסה שוב' : 'Retry'}
          onRetry={() => fetchBooks(true)}
        />
      )}

      {/* ── List ── */}
      {loading ? (
        <CatalogSkeletons />
      ) : fetchError && books.length === 0 ? (
        <View style={s.empty}>
          <View style={[s.emptyIconWrap, { backgroundColor: '#fee2e2' }]}>
            <Ionicons name="cloud-offline-outline" size={36} color="#ef4444" />
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
            <Ionicons name="search-outline" size={36} color={C.muted} />
          </View>

          {/* Contextual title */}
          <Text style={s.emptyTitle}>
            {search.trim()
              ? (isRTL ? `אין תוצאות עבור "${search}"` : `No results for "${search}"`)
              : (isRTL ? 'לא נמצאו ספרים' : 'No books found')}
          </Text>
          <Text style={s.emptySub}>
            {activeFiltersCount > 0 && !search.trim()
              ? (isRTL ? 'הסינון שלך מצמצם מדי — נסה להסיר פילטרים' : 'Your filters are too narrow — try removing some')
              : (isRTL ? 'נסה חיפוש שונה' : 'Try a different search')}
          </Text>

          {/* Active filter chips in the empty state for quick removal */}
          {chips.length > 0 && (
            <View style={s.emptyChips}>
              {chips.map(chip => (
                <TouchableOpacity
                  key={chip.key}
                  style={s.emptyChip}
                  onPress={() => removeChip(chip.key)}
                  activeOpacity={0.7}
                >
                  <Text style={s.emptyChipTxt}>{chip.label}</Text>
                  <Ionicons name="close" size={12} color={C.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Clear actions */}
          <View style={s.emptyActions}>
            {search.trim() ? (
              <TouchableOpacity style={s.emptyBtn} onPress={() => setSearch('')}>
                <Ionicons name="close-circle-outline" size={16} color={C.primary} />
                <Text style={s.emptyBtnTxt}>{isRTL ? 'נקה חיפוש' : 'Clear search'}</Text>
              </TouchableOpacity>
            ) : null}
            {activeFiltersCount > 0 && (
              <TouchableOpacity style={[s.emptyBtn, search.trim() && s.emptyBtnSecondary]} onPress={() => setFilters({})}>
                <Ionicons name="options-outline" size={16} color={search.trim() ? C.sub : C.primary} />
                <Text style={[s.emptyBtnTxt, search.trim() && { color: C.sub }]}>
                  {isRTL ? 'נקה סינון' : 'Clear filters'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <FlatList
          key={numColumns}
          data={books}
          keyExtractor={item => item.id}
          renderItem={renderBook}
          numColumns={numColumns}
          columnWrapperStyle={s.row}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onEndReached={() => { if (!loadingMore && hasMore) fetchBooks(false); }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore
              ? <View style={s.loadingMore}><ActivityIndicator size="small" color={C.primary} /></View>
              : !hasMore && books.length > 0
                ? <Text style={s.endTxt}>{isRTL ? 'סוף הרשימה' : 'All books loaded'}</Text>
                : null
          }
        />
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    paddingBottom: 12,
  },
  rowRev: { flexDirection: 'row-reverse' },

  // Search row
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: C.text },

  filterBtn: {
    width: 46, height: 46, borderRadius: 12,
    borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  filterBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterDot: {
    position: 'absolute', top: -5, right: -5,
    backgroundColor: '#ef4444', borderRadius: 8,
    minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 3,
  },
  filterDotTxt: { color: C.white, fontSize: 10, fontWeight: '700' },


  // Filter chips
  chipsScroll: { marginTop: 10 },
  chipsRow:    { gap: 8, paddingRight: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.primaryLight, borderWidth: 1, borderColor: C.primary + '40',
    borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12,
  },
  chipTxt:     { fontSize: 13, color: C.primary, fontWeight: '600' },
  chipClear:   { paddingVertical: 6, paddingHorizontal: 12, justifyContent: 'center' },
  chipClearTxt:{ fontSize: 13, color: C.muted, fontWeight: '500', textDecorationLine: 'underline' },

  // Results count + sort
  countSortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  countTxt:     { fontSize: 12, color: C.muted, fontWeight: '500' },
  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.white,
  },
  sortBtnTxt: { fontSize: 12, color: C.sub, fontWeight: '600' },

  // Grid
  list: { padding: H_PAD, paddingBottom: 40, gap: COL_GAP },
  row:  { gap: COL_GAP },

  // Card
  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  imgBox: { width: '100%', aspectRatio: 2 / 3, backgroundColor: C.border },
  img:    { width: '100%', height: '100%' },
  condPill:    { borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6 },
  condPillTxt: { fontSize: 10, fontWeight: '600' },

  // Heart / favorite button (overlay on image, opposite corner from condition badge)
  heartBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 32, height: 32,
    justifyContent: 'center', alignItems: 'center',
  },
  heartBtnRTL: { right: undefined, left: 6 },

  cardBody:    { padding: 10 },
  cardTitle:   { fontSize: 13, fontWeight: '600', color: C.text, lineHeight: 18, marginBottom: 2 },
  cardAuthor:  { fontSize: 11, color: C.sub, marginBottom: 4 },
  genreRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  genrePill:   { backgroundColor: '#f5f5f4', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  genrePillTxt:{ fontSize: 10, fontWeight: '500', color: C.sub },
  cardFooter:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 0 },
  cityRow:     { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1, marginRight: 6 },
  cardCity:    { fontSize: 11, color: C.muted, flexShrink: 1 },
  priceTxt:    { fontSize: 16, fontWeight: '600', flexShrink: 0 },

  // States
  empty:   { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 22, backgroundColor: '#f5f5f4', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: C.text, marginBottom: 6, textAlign: 'center' },
  emptySub:   { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 16 },

  // Inline filter chips inside empty state
  emptyChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 },
  emptyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.primaryLight, borderWidth: 1, borderColor: C.primary + '40',
    borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12,
  },
  emptyChipTxt: { fontSize: 13, color: C.primary, fontWeight: '600' },

  // Action buttons
  emptyActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 12, borderWidth: 1.5, borderColor: C.primary,
  },
  emptyBtnSecondary: { borderColor: C.border },
  emptyBtnTxt: { fontSize: 14, color: C.primary, fontWeight: '600' },

  loadingMore: { paddingVertical: 24, alignItems: 'center' },
  endTxt:      { textAlign: 'center', color: C.muted, fontSize: 13, paddingVertical: 24 },

  rAlign: { textAlign: 'right' },
});

// ── Sort Sheet ──────────────────────────────────────────────────────────────

function SortSheet({
  visible, onClose, current, onSelect, isRTL,
}: {
  visible: boolean;
  onClose: () => void;
  current: SortOption;
  onSelect: (s: SortOption) => void;
  isRTL: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={ss.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={ss.sheet}>
          <View style={ss.handle} />
          <Text style={[ss.title, isRTL && { textAlign: 'right' }]}>
            {isRTL ? 'מיון לפי' : 'Sort by'}
          </Text>
          {SORT_OPTIONS.map((opt, i) => {
            const active = current === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[ss.row, i > 0 && ss.rowBorder, isRTL && ss.rowRTL]}
                onPress={() => { onSelect(opt.value); onClose(); }}
                activeOpacity={0.7}
              >
                <View style={[ss.iconWrap, active && ss.iconWrapActive]}>
                  <Ionicons name={opt.icon as any} size={16} color={active ? '#fff' : C.sub} />
                </View>
                <Text style={[ss.rowTxt, active && ss.rowTxtActive]}>
                  {isRTL ? opt.labelHe : opt.labelEn}
                </Text>
                {active && <Ionicons name="checkmark-circle" size={20} color={C.primary} />}
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 32 }} />
        </View>
      </View>
    </Modal>
  );
}

const ss = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(28,25,23,0.5)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  title:   { fontSize: 16, fontWeight: '700', color: C.text, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  rowRTL:  { flexDirection: 'row-reverse' },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  iconWrap:       { width: 34, height: 34, borderRadius: 10, backgroundColor: C.inputBg, justifyContent: 'center', alignItems: 'center' },
  iconWrapActive: { backgroundColor: C.primary },
  rowTxt:         { flex: 1, fontSize: 15, color: C.sub, fontWeight: '500' },
  rowTxtActive:   { color: C.text, fontWeight: '600' },
});

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Book } from '../types';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useDataStore } from '../stores/dataStore';
import { MyBooksSkeletons } from '../components/Skeleton';
import { useToast, Toast, FetchErrorBanner } from '../components/Toast';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import i18n from '../lib/i18n';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type StatusFilter  = 'all' | 'active' | 'unlisted' | 'sold';
type ListingFilter = 'all' | 'sale' | 'free' | 'trade';
type SortKey       = 'date_desc' | 'date_asc' | 'price_asc' | 'price_desc' | 'title_asc';

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
  red:          '#ef4444',
  redLight:     '#fee2e2',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysSince(dateStr: string, isRTL: boolean): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days === 0) return isRTL ? 'היום' : 'Today';
  if (days === 1) return isRTL ? 'אתמול' : 'Yesterday';
  if (days < 30)  return isRTL ? `לפני ${days} ימים` : `${days}d ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12)    return isRTL ? `לפני ${mo} חודשים` : `${mo}mo ago`;
  return isRTL ? `לפני ${Math.floor(mo / 12)} שנים` : `${Math.floor(mo / 12)}y ago`;
}

function getConditionLabel(condition: string, isRTL: boolean): string {
  const map: Record<string, [string, string]> = {
    new:      ['חדש',     'New'],
    like_new: ['כמו חדש', 'Like new'],
    good:     ['טוב',     'Good'],
    fair:     ['סביר',    'Fair'],
  };
  const e = map[condition];
  return e ? (isRTL ? e[0] : e[1]) : condition;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MyBooksScreen() {
  const navigation = useNavigation<Nav>();
  const { user }   = useAuthStore();
  const { isRTL }  = useLanguageStore();
  const insets     = useSafeAreaInsets();

  const { myBooks: books, setMyBooks } = useDataStore();
  const [loading,    setLoading]    = useState(
    () => !!user && useDataStore.getState().myBooksFetchedAt === 0
  );
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const { showToast, toast }        = useToast();

  // Filters & sort
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('all');
  const [listingFilter, setListingFilter] = useState<ListingFilter>('all');
  const [sortKey,       setSortKey]       = useState<SortKey>('date_desc');
  const [search,        setSearch]        = useState('');
  const [showSortMenu,  setShowSortMenu]  = useState(false);

  // Multi-select
  const [selectMode,  setSelectMode]  = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // More actions sheet
  const [moreBook, setMoreBook] = useState<Book | null>(null);

  // Quick price edit
  const [quickEditBook,  setQuickEditBook]  = useState<Book | null>(null);
  const [quickEditPrice, setQuickEditPrice] = useState('');

  // Wishlist counts
  const [wishlistCounts, setWishlistCounts] = useState<Record<string, number>>({});

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchWishlistCounts = useCallback(async (bookIds: string[]) => {
    if (!bookIds.length) return;
    try {
      const { data } = await supabase
        .from('wishlists')
        .select('book_id')
        .in('book_id', bookIds);
      const counts: Record<string, number> = {};
      (data || []).forEach((r: { book_id: string }) => {
        counts[r.book_id] = (counts[r.book_id] || 0) + 1;
      });
      setWishlistCounts(counts);
    } catch { /* non-critical */ }
  }, []);

  const fetchMyBooks = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setFetchError(false);
      const loaded = (data as Book[]) || [];
      setMyBooks(loaded);
      fetchWishlistCounts(loaded.map(b => b.id));
    } catch (error) {
      console.error('Error fetching books:', error);
      setFetchError(true);
      setMyBooks(useDataStore.getState().myBooks);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, setMyBooks, fetchWishlistCounts]);

  useFocusEffect(useCallback(() => {
    const store = useDataStore.getState();
    const hasCache = store.myBooksFetchedAt > 0;
    if (hasCache && !store.isMyBooksStale()) return;
    if (!hasCache) setLoading(true);
    fetchMyBooks();
  }, [fetchMyBooks]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMyBooks();
  }, [fetchMyBooks]);

  // ── Derived lists ──────────────────────────────────────────────────────────

  const activeBooks   = useMemo(() => books.filter(b => b.status === 'active'),    [books]);
  const unlistedBooks = useMemo(() => books.filter(b => b.status === 'unlisted'),  [books]);
  const soldBooks     = useMemo(() => books.filter(b => b.status === 'completed'), [books]);

  const displayed = useMemo(() => {
    let list: Book[] = books;
    if (statusFilter === 'active')   list = activeBooks;
    if (statusFilter === 'unlisted') list = unlistedBooks;
    if (statusFilter === 'sold')     list = soldBooks;

    if (listingFilter !== 'all') list = list.filter(b => b.listing_type === listingFilter);

    const q = search.trim().toLowerCase();
    if (q) list = list.filter(b =>
      b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
    );

    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'date_asc':   return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'price_asc':  return (a.price ?? 0) - (b.price ?? 0);
        case 'price_desc': return (b.price ?? 0) - (a.price ?? 0);
        case 'title_asc':  return a.title.localeCompare(b.title, isRTL ? 'he' : 'en');
        default:           return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [books, statusFilter, listingFilter, search, sortKey, activeBooks, unlistedBooks, soldBooks, isRTL]);

  // ── Select mode ────────────────────────────────────────────────────────────

  const enterSelectMode = (id: string) => { setSelectMode(true); setSelectedIds(new Set([id])); };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const cancelSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const selectAll    = () => { setSelectedIds(new Set(displayed.map(b => b.id))); };

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleDelete = (bookId: string) => {
    setMoreBook(null);
    Alert.alert(i18n.t('myBooks.delete'), i18n.t('myBooks.confirmDelete'), [
      { text: i18n.t('common.cancel'), style: 'cancel' },
      {
        text: i18n.t('common.delete'), style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('books').delete().eq('id', bookId);
            if (error) throw error;
            fetchMyBooks();
            showToast(isRTL ? 'הספר נמחק' : 'Book removed');
          } catch (e: any) { Alert.alert(i18n.t('common.error'), e.message); }
        },
      },
    ]);
  };

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    Alert.alert(
      isRTL ? 'מחיקה מרובה' : 'Delete books',
      isRTL ? `למחוק ${count} ספרים?` : `Delete ${count} book${count !== 1 ? 's' : ''}?`,
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: i18n.t('common.delete'), style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('books').delete().in('id', [...selectedIds]);
              if (error) throw error;
              cancelSelect(); fetchMyBooks();
              showToast(isRTL ? `${count} ספרים נמחקו` : `${count} books removed`);
            } catch (e: any) { Alert.alert(i18n.t('common.error'), e.message); }
          },
        },
      ]
    );
  };

  const handleBulkHide = async () => {
    const count = selectedIds.size;
    try {
      const { error } = await supabase.from('books').update({ status: 'unlisted' }).in('id', [...selectedIds]);
      if (error) throw error;
      cancelSelect(); fetchMyBooks();
      showToast(isRTL ? `${count} ספרים הוסתרו` : `${count} books hidden`);
    } catch (e: any) { Alert.alert(i18n.t('common.error'), e.message); }
  };

  const handleBulkSold = () => {
    const count = selectedIds.size;
    Alert.alert(
      isRTL ? 'סמן כנמכרו?' : 'Mark as sold?',
      isRTL ? `לסמן ${count} ספרים כנמכרו?` : `Mark ${count} book${count !== 1 ? 's' : ''} as sold?`,
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: isRTL ? 'נמכר' : 'Mark sold',
          onPress: async () => {
            try {
              const { error } = await supabase.from('books').update({ status: 'completed' }).in('id', [...selectedIds]);
              if (error) throw error;
              cancelSelect(); fetchMyBooks();
              showToast(isRTL ? `${count} ספרים סומנו כנמכרו` : `${count} books marked as sold`);
            } catch (e: any) { Alert.alert(i18n.t('common.error'), e.message); }
          },
        },
      ]
    );
  };

  const handleMarkAsSold = (book: Book) => {
    setMoreBook(null);
    Alert.alert(
      isRTL ? 'סמן כנמכר?' : 'Mark as sold?',
      isRTL ? 'הספר יועבר לארכיון ולא יוצג במודעות' : 'This book will be archived and hidden from listings',
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: isRTL ? 'נמכר' : 'Mark sold',
          onPress: async () => {
            try {
              const { error } = await supabase.from('books').update({ status: 'completed' }).eq('id', book.id);
              if (error) throw error;
              fetchMyBooks();
              showToast(isRTL ? 'הספר סומן כנמכר' : 'Book marked as sold');
            } catch (e: any) { Alert.alert(i18n.t('common.error'), e.message); }
          },
        },
      ],
    );
  };

  const handleToggleStatus = async (book: Book) => {
    setMoreBook(null);
    const next = book.status === 'active' ? 'unlisted' : 'active';
    try {
      const { error } = await supabase.from('books').update({ status: next }).eq('id', book.id);
      if (error) throw error;
      fetchMyBooks();
      showToast(next === 'active'
        ? (isRTL ? 'הספר פעיל שוב' : 'Book is active again')
        : (isRTL ? 'הספר הוסתר' : 'Book hidden from listings')
      );
    } catch (e: any) { Alert.alert(i18n.t('common.error'), e.message); }
  };

  const handleDuplicate = (book: Book) => {
    setMoreBook(null);
    navigation.navigate('MainTabs', { screen: 'Publish' });
    showToast(isRTL ? 'מעביר לפרסום...' : 'Opening publish...');
  };

  const handleQuickSavePrice = async () => {
    if (!quickEditBook) return;
    const price = parseInt(quickEditPrice, 10);
    if (isNaN(price) || price < 0) {
      showToast(isRTL ? 'מחיר לא תקין' : 'Invalid price'); return;
    }
    try {
      const { error } = await supabase.from('books').update({ price }).eq('id', quickEditBook.id);
      if (error) throw error;
      setMyBooks(books.map(b => b.id === quickEditBook.id ? { ...b, price } : b));
      setQuickEditBook(null);
      showToast(isRTL ? 'המחיר עודכן' : 'Price updated');
    } catch (e: any) { Alert.alert(i18n.t('common.error'), e.message); }
  };

  // ── Badge helpers ──────────────────────────────────────────────────────────

  const getStatusBadge = (status: string) => {
    if (status === 'active')    return { label: isRTL ? 'פעיל'  : 'Active', color: C.emerald, bg: C.emeraldLight };
    if (status === 'unlisted')  return { label: isRTL ? 'מוסתר' : 'Hidden', color: C.amber,   bg: C.amberLight   };
    if (status === 'completed') return { label: isRTL ? 'נמכר'  : 'Sold',   color: C.muted,   bg: '#f0f0ef'      };
    return null;
  };

  const getListingBadge = (type: string, price?: number) => {
    if (type === 'sale' && price != null) return { label: `₪${price}`, color: C.primary, bg: C.primaryLight };
    if (type === 'free')  return { label: isRTL ? 'חינם'  : 'Free',  color: C.emerald, bg: C.emeraldLight };
    if (type === 'trade') return { label: isRTL ? 'החלפה' : 'Trade', color: C.amber,   bg: C.amberLight   };
    return null;
  };

  // ── Render card ────────────────────────────────────────────────────────────

  const renderBook = useCallback(({ item }: { item: Book }) => {
    const isSelected   = selectedIds.has(item.id);
    const statusBadge  = getStatusBadge(item.status);
    const listingBadge = getListingBadge(item.listing_type, item.price);
    const isSold       = item.status === 'completed';
    const wCount       = wishlistCounts[item.id] || 0;

    return (
      <TouchableOpacity
        style={[s.card, isSelected && s.cardSelected, isRTL && s.cardRTL]}
        activeOpacity={0.85}
        onPress={() => {
          if (selectMode) { toggleSelect(item.id); return; }
          navigation.navigate('BookDetail', { bookId: item.id });
        }}
        onLongPress={() => enterSelectMode(item.id)}
        delayLongPress={300}
      >
        {/* Checkbox (select mode) */}
        {selectMode && (
          <View style={[s.checkWrap, isRTL && s.checkWrapRTL]}>
            <View style={[s.checkbox, isSelected && s.checkboxActive]}>
              {isSelected && <Ionicons name="checkmark" size={13} color={C.white} />}
            </View>
          </View>
        )}

        {/* Cover */}
        <View style={s.coverWrap}>
          {item.images?.[0] ? (
            <Image
              source={{ uri: item.images[0] }}
              style={[s.cover, isSold && s.coverSold]}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[s.cover, s.coverFallback, isSold && s.coverSold]}>
              <Ionicons name="book-outline" size={28} color={C.muted} />
            </View>
          )}
          {isSold && (
            <View style={s.soldOverlay} pointerEvents="none">
              <Text style={s.soldOverlayTxt}>{isRTL ? 'נמכר' : 'SOLD'}</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={[s.info, isRTL && { alignItems: 'flex-end' }]}>
          {/* Badge row */}
          <View style={[s.badgeRow, isRTL && s.badgeRowRTL]}>
            {statusBadge && (
              <View style={[s.statusPill, { backgroundColor: statusBadge.bg }]}>
                <View style={[s.statusDot, { backgroundColor: statusBadge.color }]} />
                <Text style={[s.statusTxt, { color: statusBadge.color }]}>{statusBadge.label}</Text>
              </View>
            )}
            {listingBadge && (
              item.listing_type === 'sale' ? (
                <TouchableOpacity
                  onPress={() => { setQuickEditBook(item); setQuickEditPrice(String(item.price ?? '')); }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <View style={[s.pricePill, { backgroundColor: listingBadge.bg, flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
                    <Text style={[s.pricePillTxt, { color: listingBadge.color }]}>{listingBadge.label}</Text>
                    <Ionicons name="pencil-outline" size={11} color={C.muted} />
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={[s.pricePill, { backgroundColor: listingBadge.bg }]}>
                  <Text style={[s.pricePillTxt, { color: listingBadge.color }]}>{listingBadge.label}</Text>
                </View>
              )
            )}
            {wCount > 0 && (
              <View style={s.wishPill}>
                <Ionicons name="heart-outline" size={10} color={C.muted} />
                <Text style={s.wishTxt}>{wCount}</Text>
              </View>
            )}
          </View>

          <Text style={[s.bookTitle, isRTL && s.rAlign]} numberOfLines={2}>{item.title}</Text>
          <Text style={[s.bookAuthor, isRTL && s.rAlign]} numberOfLines={1}>{item.author}</Text>

          {/* Meta row */}
          <View style={[s.metaRow, isRTL && s.metaRowRTL]}>
            <View style={s.condPill}>
              <Text style={s.condTxt}>{getConditionLabel(item.condition, isRTL)}</Text>
            </View>
            {item.city ? (
              <>
                <Text style={s.metaDot}>·</Text>
                <Ionicons name="location-outline" size={10} color={C.muted} />
                <Text style={s.metaTxt} numberOfLines={1}>{item.city}</Text>
              </>
            ) : null}
            <Text style={s.metaDot}>·</Text>
            <Text style={s.metaTxt}>{daysSince(item.created_at, isRTL)}</Text>
          </View>
        </View>

        {/* ⋮ button */}
        {!selectMode && (
          <TouchableOpacity
            style={[s.dotBtn, isRTL && { marginRight: 0, marginLeft: 6 }]}
            onPress={() => setMoreBook(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={isRTL ? 'עוד פעולות' : 'More actions'}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={C.muted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }, [isRTL, selectMode, selectedIds, wishlistCounts]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) return <View style={s.container}><MyBooksSkeletons /></View>;

  // ── Tab / filter / sort data ───────────────────────────────────────────────

  const STATUS_TABS: { key: StatusFilter; en: string; he: string; count: number }[] = [
    { key: 'all',      en: 'All',    he: 'הכל',     count: books.length         },
    { key: 'active',   en: 'Active', he: 'פעילים',  count: activeBooks.length   },
    { key: 'unlisted', en: 'Hidden', he: 'מוסתרים', count: unlistedBooks.length },
    { key: 'sold',     en: 'Sold',   he: 'נמכרו',   count: soldBooks.length     },
  ];

  const LISTING_TABS: { key: ListingFilter; en: string; he: string }[] = [
    { key: 'all',   en: 'All',   he: 'הכל'   },
    { key: 'sale',  en: 'Sale',  he: 'מכירה' },
    { key: 'free',  en: 'Free',  he: 'חינם'  },
    { key: 'trade', en: 'Trade', he: 'החלפה' },
  ];

  const SORT_OPTIONS: { key: SortKey; en: string; he: string }[] = [
    { key: 'date_desc',  en: 'Newest first',    he: 'החדשים ביותר'     },
    { key: 'date_asc',   en: 'Oldest first',    he: 'הישנים ביותר'    },
    { key: 'price_asc',  en: 'Price: low–high', he: 'מחיר: נמוך–גבוה' },
    { key: 'price_desc', en: 'Price: high–low', he: 'מחיר: גבוה–נמוך' },
    { key: 'title_asc',  en: 'Title A–Z',       he: 'כותרת א–ת'       },
  ];

  const sortActive = sortKey !== 'date_desc';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>

      {/* ── Summary text ── */}
      <View style={[s.summaryRow, isRTL && { flexDirection: 'row-reverse' }]}>
        <Text style={s.summaryTxt}>
          {books.length === 0
            ? (isRTL ? 'אין לך ספרים עדיין' : 'No books yet')
            : isRTL
              ? `${books.length} ספרים · ${activeBooks.length} פעילים${soldBooks.length > 0 ? ` · ${soldBooks.length} נמכרו` : ''}`
              : `${books.length} book${books.length !== 1 ? 's' : ''} · ${activeBooks.length} active${soldBooks.length > 0 ? ` · ${soldBooks.length} sold` : ''}`
          }
        </Text>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => navigation.navigate('MainTabs', { screen: 'Publish' })}
        >
          <Ionicons name="add" size={15} color={C.primary} />
          <Text style={s.addBtnTxt}>{isRTL ? 'פרסם ספר' : 'Add book'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search + Sort ── */}
      <View style={s.searchRow}>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color={C.muted} />
          <TextInput
            style={s.searchInput}
            placeholder={isRTL ? 'חפש לפי שם ספר או מחבר...' : 'Search by title or author...'}
            placeholderTextColor={C.muted}
            value={search}
            onChangeText={setSearch}
            textAlign={isRTL ? 'right' : 'left'}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={C.muted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[s.sortBtn, sortActive && s.sortBtnActive]}
          onPress={() => setShowSortMenu(true)}
          accessibilityLabel={isRTL ? 'מיון' : 'Sort'}
        >
          <Ionicons name="funnel-outline" size={17} color={sortActive ? C.white : C.sub} />
        </TouchableOpacity>
      </View>

      {/* ── Status tabs ── */}
      <View style={[s.tabsRow, isRTL && { flexDirection: 'row-reverse' }]}>
        {STATUS_TABS.map(t => {
          const active = statusFilter === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[s.tabChip, active && s.tabChipActive]}
              onPress={() => setStatusFilter(t.key)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabChipTxt, active && s.tabChipTxtActive]}>
                {isRTL ? t.he : t.en}
              </Text>
              <View style={[s.tabCount, active && s.tabCountActive]}>
                <Text style={[s.tabCountTxt, active && s.tabCountTxtActive]}>{t.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Listing type filter ── */}
      <View style={[s.listingRow, isRTL && { flexDirection: 'row-reverse' }]}>
        {LISTING_TABS.map(t => {
          const active = listingFilter === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[s.listingChip, active && s.listingChipActive]}
              onPress={() => setListingFilter(t.key)}
              activeOpacity={0.7}
            >
              <Text style={[s.listingChipTxt, active && s.listingChipTxtActive]}>
                {isRTL ? t.he : t.en}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Select mode toolbar ── */}
      {selectMode && (
        <View style={[s.selectBar, isRTL && { flexDirection: 'row-reverse' }]}>
          <TouchableOpacity onPress={cancelSelect} style={s.selectBarBtn}>
            <Ionicons name="close" size={18} color={C.sub} />
            <Text style={s.selectBarTxt}>{isRTL ? 'ביטול' : 'Cancel'}</Text>
          </TouchableOpacity>
          <Text style={s.selectBarCount}>
            {isRTL ? `${selectedIds.size} נבחרו` : `${selectedIds.size} selected`}
          </Text>
          <TouchableOpacity onPress={selectAll} style={s.selectBarBtn}>
            <Text style={[s.selectBarTxt, { color: C.primary }]}>{isRTL ? 'בחר הכל' : 'Select all'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Error banner ── */}
      {fetchError && books.length === 0 && (
        <FetchErrorBanner message={isRTL ? 'לא הצלחנו לטעון — משוך לרענון' : "Couldn't load — pull to refresh"} />
      )}

      {/* ── List / empty ── */}
      {displayed.length === 0 ? (
        <View style={s.empty}>
          <View style={[s.emptyIconWrap, { backgroundColor: C.primaryLight }]}>
            <Ionicons name="library-outline" size={40} color={C.primary} />
          </View>
          <Text style={s.emptyTitle}>
            {search.trim() ? (isRTL ? 'לא נמצאו ספרים' : 'No books found') : (isRTL ? 'אין ספרים כאן' : 'No books here')}
          </Text>
          {!search.trim() && statusFilter === 'all' && listingFilter === 'all' && (
            <>
              <Text style={s.emptySub}>
                {isRTL ? 'שתף ספרים שקראת עם אנשים קרובים' : "Share books you've read with people nearby"}
              </Text>
              <TouchableOpacity
                style={s.publishBtn}
                onPress={() => navigation.navigate('MainTabs', { screen: 'Publish' })}
              >
                <Ionicons name="add" size={18} color={C.white} />
                <Text style={s.publishBtnTxt}>{i18n.t('myBooks.publishFirst')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={displayed}
          renderItem={renderBook}
          keyExtractor={item => item.id}
          contentContainerStyle={[s.list, { paddingBottom: selectMode ? 104 : 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        />
      )}

      {/* ── Floating bulk action bar ── */}
      {selectMode && selectedIds.size > 0 && (
        <View style={[s.bulkBar, { bottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={[s.bulkBtn, { backgroundColor: C.amber }]} onPress={handleBulkHide} activeOpacity={0.85}>
            <Ionicons name="eye-off-outline" size={16} color={C.white} />
            <Text style={s.bulkBtnTxt}>{isRTL ? 'הסתר' : 'Hide'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.bulkBtn, { backgroundColor: C.emerald }]} onPress={handleBulkSold} activeOpacity={0.85}>
            <Ionicons name="checkmark-done-outline" size={16} color={C.white} />
            <Text style={s.bulkBtnTxt}>{isRTL ? 'נמכר' : 'Sold'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.bulkBtn, { backgroundColor: C.red }]} onPress={handleBulkDelete} activeOpacity={0.85}>
            <Ionicons name="trash-outline" size={16} color={C.white} />
            <Text style={s.bulkBtnTxt}>
              {isRTL ? `מחק (${selectedIds.size})` : `Delete (${selectedIds.size})`}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Sort menu modal ── */}
      <Modal visible={showSortMenu} transparent animationType="fade" onRequestClose={() => setShowSortMenu(false)}>
        <Pressable style={s.overlay} onPress={() => setShowSortMenu(false)}>
          <Pressable style={s.sortSheet}>
            <Text style={s.sortTitle}>{isRTL ? 'מיון לפי' : 'Sort by'}</Text>
            {SORT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[s.sortOption, isRTL && { flexDirection: 'row-reverse' }]}
                onPress={() => { setSortKey(opt.key); setShowSortMenu(false); }}
              >
                <Text style={[s.sortOptionTxt, sortKey === opt.key && s.sortOptionActive]}>
                  {isRTL ? opt.he : opt.en}
                </Text>
                {sortKey === opt.key && <Ionicons name="checkmark" size={16} color={C.primary} />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── More actions bottom sheet ── */}
      <Modal visible={!!moreBook} transparent animationType="slide" onRequestClose={() => setMoreBook(null)}>
        <Pressable style={s.overlay} onPress={() => setMoreBook(null)}>
          <Pressable style={[s.moreSheet, { paddingBottom: Math.max(insets.bottom + 8, 20) }]}>
            <View style={s.moreHandle} />
            {moreBook && (
              <>
                <Text style={[s.moreBookTitle, isRTL && s.rAlign]} numberOfLines={1}>
                  {moreBook.title}
                </Text>

                {/* Edit */}
                <TouchableOpacity
                  style={[s.moreOption, isRTL && { flexDirection: 'row-reverse' }]}
                  onPress={() => { setMoreBook(null); navigation.navigate('EditBook', { bookId: moreBook.id }); }}
                >
                  <View style={[s.moreIcon, { backgroundColor: C.primaryLight }]}>
                    <Ionicons name="pencil-outline" size={18} color={C.primary} />
                  </View>
                  <Text style={s.moreOptionTxt}>{isRTL ? 'ערוך ספר' : 'Edit book'}</Text>
                </TouchableOpacity>

                {/* Toggle visibility */}
                <TouchableOpacity
                  style={[s.moreOption, isRTL && { flexDirection: 'row-reverse' }]}
                  onPress={() => handleToggleStatus(moreBook)}
                >
                  <View style={[s.moreIcon, {
                    backgroundColor: moreBook.status === 'active' ? '#fff7ed' : C.emeraldLight
                  }]}>
                    <Ionicons
                      name={moreBook.status === 'completed' ? 'arrow-undo-outline' : moreBook.status === 'active' ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={moreBook.status === 'active' ? C.amber : C.emerald}
                    />
                  </View>
                  <Text style={s.moreOptionTxt}>
                    {moreBook.status === 'completed'
                      ? (isRTL ? 'פרסם שוב' : 'Re-list')
                      : moreBook.status === 'active'
                        ? (isRTL ? 'הסתר מודעה' : 'Hide listing')
                        : (isRTL ? 'הצג מודעה' : 'Show listing')}
                  </Text>
                </TouchableOpacity>

                {/* Mark as sold */}
                {moreBook.status !== 'completed' && (
                  <TouchableOpacity
                    style={[s.moreOption, isRTL && { flexDirection: 'row-reverse' }]}
                    onPress={() => handleMarkAsSold(moreBook)}
                  >
                    <View style={[s.moreIcon, { backgroundColor: C.emeraldLight }]}>
                      <Ionicons name="checkmark-done-outline" size={18} color={C.emerald} />
                    </View>
                    <Text style={s.moreOptionTxt}>{isRTL ? 'סמן כנמכר' : 'Mark as sold'}</Text>
                  </TouchableOpacity>
                )}

                {/* Duplicate */}
                <TouchableOpacity
                  style={[s.moreOption, isRTL && { flexDirection: 'row-reverse' }]}
                  onPress={() => handleDuplicate(moreBook)}
                >
                  <View style={[s.moreIcon, { backgroundColor: '#f5f5f4' }]}>
                    <Ionicons name="copy-outline" size={18} color={C.sub} />
                  </View>
                  <Text style={s.moreOptionTxt}>{isRTL ? 'שכפל מודעה' : 'Duplicate listing'}</Text>
                </TouchableOpacity>

                {/* Delete */}
                <TouchableOpacity
                  style={[s.moreOption, isRTL && { flexDirection: 'row-reverse' }]}
                  onPress={() => handleDelete(moreBook.id)}
                >
                  <View style={[s.moreIcon, { backgroundColor: C.redLight }]}>
                    <Ionicons name="trash-outline" size={18} color={C.red} />
                  </View>
                  <Text style={[s.moreOptionTxt, { color: C.red }]}>{isRTL ? 'מחק ספר' : 'Delete book'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.moreCancelBtn} onPress={() => setMoreBook(null)}>
                  <Text style={s.moreCancelTxt}>{isRTL ? 'ביטול' : 'Cancel'}</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Quick price edit modal ── */}
      <Modal visible={!!quickEditBook} transparent animationType="fade" onRequestClose={() => setQuickEditBook(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setQuickEditBook(null)}>
            <Pressable style={s.priceSheet}>
              <Text style={[s.priceTitle, isRTL && s.rAlign]}>
                {isRTL ? 'עדכון מחיר' : 'Update price'}
              </Text>
              {quickEditBook && (
                <Text style={[s.priceBookName, isRTL && s.rAlign]} numberOfLines={1}>
                  {quickEditBook.title}
                </Text>
              )}
              <View style={[s.priceInputRow, isRTL && { flexDirection: 'row-reverse' }]}>
                <Text style={s.priceCurrency}>₪</Text>
                <TextInput
                  style={[s.priceInput, isRTL && s.rAlign]}
                  value={quickEditPrice}
                  onChangeText={setQuickEditPrice}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={C.muted}
                  autoFocus
                  selectTextOnFocus
                  textAlign={isRTL ? 'right' : 'left'}
                />
              </View>
              <View style={[s.priceBtns, isRTL && { flexDirection: 'row-reverse' }]}>
                <TouchableOpacity style={s.priceCancelBtn} onPress={() => setQuickEditBook(null)}>
                  <Text style={s.priceCancelTxt}>{isRTL ? 'ביטול' : 'Cancel'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.priceSaveBtn} onPress={handleQuickSavePrice}>
                  <Text style={s.priceSaveTxt}>{isRTL ? 'שמור' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Toast {...toast} />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Summary row ──
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 11,
    backgroundColor: C.white,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  summaryTxt: { fontSize: 13, color: C.sub, fontWeight: '500', flex: 1 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: C.primary + '50',
    backgroundColor: C.primaryLight,
  },
  addBtnTxt: { fontSize: 12, fontWeight: '600', color: C.primary },

  // ── Search + sort row ──
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6,
    backgroundColor: C.white,
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.white,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.text, padding: 0 },
  sortBtn: {
    width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: C.border, backgroundColor: C.white,
  },
  sortBtnActive: { backgroundColor: C.primary, borderColor: C.primary },

  // ── Status tabs ──
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14, paddingBottom: 10, paddingTop: 6,
    gap: 6,
    backgroundColor: C.white,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tabChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, backgroundColor: '#f5f5f4',
    borderWidth: 1, borderColor: 'transparent',
  },
  tabChipActive:     { backgroundColor: C.primaryLight, borderColor: C.primary + '40' },
  tabChipTxt:        { fontSize: 12, fontWeight: '500', color: C.sub },
  tabChipTxtActive:  { color: C.primary, fontWeight: '600' },
  tabCount:          { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#e7e5e4', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  tabCountActive:    { backgroundColor: C.primary },
  tabCountTxt:       { fontSize: 10, fontWeight: '700', color: C.sub },
  tabCountTxtActive: { color: C.white },

  // ── Listing type filter ──
  listingRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: C.bg,
  },
  listingChip: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, backgroundColor: '#f5f5f4',
  },
  listingChipActive:    { backgroundColor: C.primaryLight, borderColor: C.primary + '40' },
  listingChipTxt:       { fontSize: 12, fontWeight: '500', color: C.muted },
  listingChipTxtActive: { color: C.primary, fontWeight: '600' },

  // ── Select mode toolbar ──
  selectBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.primaryLight, borderBottomWidth: 1, borderBottomColor: C.primary + '30',
  },
  selectBarBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  selectBarTxt:   { fontSize: 14, fontWeight: '600', color: C.sub },
  selectBarCount: { fontSize: 14, fontWeight: '700', color: C.primary },

  // ── List ──
  list: { padding: 14 },

  // ── Card ──
  card: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardSelected: { borderColor: C.primary, borderWidth: 1.5 },
  cardRTL:      { flexDirection: 'row-reverse' },

  // Checkbox
  checkWrap:    { paddingLeft: 10, justifyContent: 'center' },
  checkWrapRTL: { paddingLeft: 0, paddingRight: 10 },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxActive: { backgroundColor: C.primary, borderColor: C.primary },

  // Cover — has its own margin + borderRadius so it looks floating inside the card
  coverWrap:     { margin: 12, borderRadius: 10, overflow: 'hidden' },
  cover:         { width: 84, height: 116, backgroundColor: C.border },
  coverFallback: { justifyContent: 'center', alignItems: 'center' },
  coverSold:     { opacity: 0.45 },
  soldOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  soldOverlayTxt: {
    fontSize: 11, fontWeight: '800', color: C.white,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
    transform: [{ rotate: '-20deg' }],
    overflow: 'hidden',
  },

  // Info
  info: { flex: 1, paddingTop: 14, paddingBottom: 12 },

  // Badge row
  badgeRow:    { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginBottom: 7 },
  badgeRowRTL: { flexDirection: 'row-reverse' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusTxt: { fontSize: 11, fontWeight: '600' },
  pricePill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  pricePillTxt: { fontSize: 12, fontWeight: '600' },
  pencilTxt:    { fontSize: 10, fontWeight: '400', color: C.muted },
  wishPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20,
    backgroundColor: '#f5f5f4',
  },
  wishTxt: { fontSize: 10, color: C.sub, fontWeight: '500' },

  // Title + author
  bookTitle:  { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 3, lineHeight: 21 },
  bookAuthor: { fontSize: 12, color: C.sub, marginBottom: 8 },

  // Meta row (condition, city, date)
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  metaRowRTL: { flexDirection: 'row-reverse' },
  condPill: {
    backgroundColor: '#f5f5f4', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  condTxt: { fontSize: 10, color: C.sub, fontWeight: '500' },
  metaTxt: { fontSize: 11, color: C.muted },
  metaDot: { fontSize: 11, color: C.muted },

  // ⋮ button
  dotBtn: {
    width: 36, height: 36, justifyContent: 'center', alignItems: 'center',
    alignSelf: 'flex-start', marginTop: 10, marginRight: 6,
  },

  // Empty
  empty:         { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIconWrap: { width: 88, height: 88, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle:    { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 8, textAlign: 'center' },
  emptySub:      { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 21, marginBottom: 24, paddingHorizontal: 8 },
  publishBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, paddingVertical: 13, paddingHorizontal: 28, borderRadius: 12 },
  publishBtnTxt: { color: C.white, fontSize: 15, fontWeight: '600' },

  // ── Floating bulk bar ──
  bulkBar: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 8,
  },
  bulkBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 13, borderRadius: 12,
  },
  bulkBtnTxt: { color: C.white, fontSize: 13, fontWeight: '700' },

  // ── Overlay ──
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },

  // ── Sort sheet ──
  sortSheet: {
    backgroundColor: C.white, borderRadius: 16,
    margin: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 6,
  },
  sortTitle:        { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 12 },
  sortOption:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  sortOptionTxt:    { fontSize: 14, color: C.sub },
  sortOptionActive: { color: C.primary, fontWeight: '600' },

  // ── More actions sheet ──
  moreSheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 6,
  },
  moreHandle:    { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 12 },
  moreBookTitle: { fontSize: 13, fontWeight: '600', color: C.sub, marginBottom: 12 },
  moreOption:    { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  moreIcon:      { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  moreOptionTxt: { fontSize: 15, color: C.text, fontWeight: '500' },
  moreCancelBtn: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  moreCancelTxt: { fontSize: 15, fontWeight: '600', color: C.sub },

  // ── Quick price edit ──
  priceSheet: {
    backgroundColor: C.white, borderRadius: 16,
    margin: 16, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 6,
  },
  priceTitle:     { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 },
  priceBookName:  { fontSize: 12, color: C.muted, marginBottom: 16 },
  priceInputRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
  priceCurrency:  { fontSize: 22, fontWeight: '700', color: C.text },
  priceInput: {
    flex: 1, fontSize: 28, fontWeight: '700', color: C.text,
    borderBottomWidth: 2, borderBottomColor: C.primary, paddingVertical: 4,
  },
  priceBtns:      { flexDirection: 'row', gap: 10 },
  priceCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  priceCancelTxt: { fontSize: 15, fontWeight: '600', color: C.sub },
  priceSaveBtn:   { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center' },
  priceSaveTxt:   { fontSize: 15, fontWeight: '600', color: C.white },

  rAlign: { textAlign: 'right' },
});

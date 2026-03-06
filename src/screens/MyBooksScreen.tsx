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
type StatusFilter = 'all' | 'active' | 'unlisted' | 'sold';

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

export default function MyBooksScreen() {
  const navigation = useNavigation<Nav>();
  const { user }   = useAuthStore();
  const { isRTL }  = useLanguageStore();
  const insets     = useSafeAreaInsets();

  const { myBooks: books, setMyBooks } = useDataStore();
  const [loading, setLoading]       = useState(
    () => !!user && useDataStore.getState().myBooksFetchedAt === 0
  );
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const { showToast, toast }        = useToast();

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch]             = useState('');

  // Multi-select
  const [selectMode, setSelectMode]   = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Fetch ────────────────────────────────────────────────────────────────

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
      setMyBooks((data as Book[]) || []);
    } catch (error) {
      console.error('Error fetching books:', error);
      setFetchError(true);
      setMyBooks(useDataStore.getState().myBooks);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, setMyBooks]);

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

  // ── Derived lists ─────────────────────────────────────────────────────────

  const activeBooks   = useMemo(() => books.filter(b => b.status === 'active'),    [books]);
  const unlistedBooks = useMemo(() => books.filter(b => b.status === 'unlisted'),  [books]);
  const soldBooks     = useMemo(() => books.filter(b => b.status === 'completed'), [books]);

  const filteredByStatus = useMemo(() => {
    if (statusFilter === 'active')   return activeBooks;
    if (statusFilter === 'unlisted') return unlistedBooks;
    if (statusFilter === 'sold')     return soldBooks;
    return books;
  }, [statusFilter, books, activeBooks, unlistedBooks, soldBooks]);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filteredByStatus;
    return filteredByStatus.filter(b =>
      b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
    );
  }, [filteredByStatus, search]);

  // ── Select mode ───────────────────────────────────────────────────────────

  const enterSelectMode = (id: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const cancelSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const selectAll = () => {
    setSelectedIds(new Set(displayed.map(b => b.id)));
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleDelete = (bookId: string) => {
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
          } catch (e: any) {
            Alert.alert(i18n.t('common.error'), e.message);
          }
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
              const ids = [...selectedIds];
              const { error } = await supabase.from('books').delete().in('id', ids);
              if (error) throw error;
              cancelSelect();
              fetchMyBooks();
              showToast(isRTL ? `${count} ספרים נמחקו` : `${count} books removed`);
            } catch (e: any) {
              Alert.alert(i18n.t('common.error'), e.message);
            }
          },
        },
      ]
    );
  };

  const handleMarkAsSold = (book: Book) => {
    Alert.alert(
      isRTL ? 'סמן כנמכר?' : 'Mark as sold?',
      isRTL ? 'הספר יועבר לארכיון "נמכרו" ולא יוצג יותר במודעות' : 'This book will be archived and hidden from listings',
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
            } catch (e: any) {
              Alert.alert(i18n.t('common.error'), e.message);
            }
          },
        },
      ],
    );
  };

  const handleToggleStatus = async (book: Book) => {
    // Cycle: active ↔ unlisted (also restores completed → active)
    const next = book.status === 'active' ? 'unlisted' : 'active';
    try {
      const { error } = await supabase.from('books').update({ status: next }).eq('id', book.id);
      if (error) throw error;
      fetchMyBooks();
      showToast(
        next === 'active'
          ? (isRTL ? 'הספר פעיל שוב' : 'Book is active again')
          : (isRTL ? 'הספר הוסתר' : 'Book hidden from listings')
      );
    } catch (e: any) {
      Alert.alert(i18n.t('common.error'), e.message);
    }
  };

  // ── Status badge helpers ──────────────────────────────────────────────────

  const getStatusBadge = (status: string) => {
    if (status === 'active')    return { label: isRTL ? 'פעיל'  : 'Active',  color: C.emerald,  bg: C.emeraldLight };
    if (status === 'unlisted')  return { label: isRTL ? 'מוסתר' : 'Hidden',  color: C.amber,    bg: C.amberLight   };
    if (status === 'completed') return { label: isRTL ? 'נמכר'  : 'Sold',    color: C.muted,    bg: '#f5f5f4'      };
    return null;
  };

  const getListingBadge = (type: string, price?: number) => {
    if (type === 'sale' && price) return { label: `₪${price}`, color: C.primary };
    if (type === 'free')          return { label: isRTL ? 'חינם'  : 'Free',  color: C.emerald };
    if (type === 'trade')         return { label: isRTL ? 'החלפה' : 'Trade', color: C.amber   };
    return null;
  };

  // ── Render card ───────────────────────────────────────────────────────────

  const renderBook = useCallback(({ item }: { item: Book }) => {
    const isSelected  = selectedIds.has(item.id);
    const statusBadge = getStatusBadge(item.status);
    const listingBadge = getListingBadge(item.listing_type, item.price);
    const isActive     = item.status === 'active';

    return (
      <TouchableOpacity
        style={[s.card, isSelected && s.cardSelected, isRTL && s.cardRTL]}
        activeOpacity={0.82}
        onPress={() => {
          if (selectMode) { toggleSelect(item.id); return; }
          navigation.navigate('BookDetail', { bookId: item.id });
        }}
        onLongPress={() => enterSelectMode(item.id)}
        delayLongPress={300}
      >
        {/* Select checkbox */}
        {selectMode && (
          <View style={[s.checkWrap, isRTL && s.checkWrapRTL]}>
            <View style={[s.checkbox, isSelected && s.checkboxActive]}>
              {isSelected && <Ionicons name="checkmark" size={13} color={C.white} />}
            </View>
          </View>
        )}

        {/* Cover */}
        <View style={[s.coverWrap, selectMode && s.coverWrapSelect]}>
          {item.images?.[0] ? (
            <Image source={{ uri: item.images[0] }} style={s.cover} contentFit="cover" transition={200} />
          ) : (
            <View style={[s.cover, s.coverFallback]}>
              <Ionicons name="book-outline" size={26} color={C.muted} />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={[s.info, isRTL && { alignItems: 'flex-end' }]}>
          <Text style={[s.bookTitle, isRTL && s.rAlign]} numberOfLines={2}>{item.title}</Text>
          <Text style={[s.bookAuthor, isRTL && s.rAlign]} numberOfLines={1}>{item.author}</Text>

          <View style={[s.badgeRow, isRTL && s.badgeRowRTL]}>
            {listingBadge && (
              <Text style={[s.listingBadge, { color: listingBadge.color }]}>{listingBadge.label}</Text>
            )}
            {statusBadge && (
              <View style={[s.statusPill, { backgroundColor: statusBadge.bg }]}>
                <View style={[s.statusDot, { backgroundColor: statusBadge.color }]} />
                <Text style={[s.statusTxt, { color: statusBadge.color }]}>{statusBadge.label}</Text>
              </View>
            )}
          </View>

          {item.city ? (
            <View style={[s.cityRow, isRTL && s.cityRowRTL]}>
              <Ionicons name="location-outline" size={10} color={C.muted} />
              <Text style={s.cityTxt} numberOfLines={1}>{item.city}</Text>
            </View>
          ) : null}
        </View>

        {/* Actions — hidden in select mode */}
        {!selectMode && (
          <View style={[s.actions, isRTL && s.actionsRTL]}>
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => navigation.navigate('EditBook', { bookId: item.id })}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="pencil-outline" size={17} color={C.primary} />
            </TouchableOpacity>
            {item.status !== 'completed' && (
              <TouchableOpacity
                style={s.actionBtn}
                onPress={() => handleMarkAsSold(item)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="checkmark-done-outline" size={17} color={C.emerald} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => handleToggleStatus(item)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name={item.status === 'completed' ? 'refresh-outline' : isActive ? 'eye-off-outline' : 'eye-outline'}
                size={17}
                color={item.status === 'completed' ? C.primary : isActive ? C.muted : C.emerald}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => handleDelete(item.id)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="trash-outline" size={17} color={C.red} />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [isRTL, selectMode, selectedIds]);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return <View style={s.container}><MyBooksSkeletons /></View>;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const STATUS_TABS: { key: StatusFilter; labelEn: string; labelHe: string; count: number }[] = [
    { key: 'all',      labelEn: 'All',     labelHe: 'הכל',    count: books.length         },
    { key: 'active',   labelEn: 'Active',  labelHe: 'פעילים', count: activeBooks.length   },
    { key: 'unlisted', labelEn: 'Hidden',  labelHe: 'מוסתרים',count: unlistedBooks.length },
    { key: 'sold',     labelEn: 'Sold',    labelHe: 'נמכרו',  count: soldBooks.length     },
  ];

  return (
    <View style={s.container}>
      {/* Stats bar */}
      <View style={s.statsBar}>
        <View style={s.statChip}>
          <Text style={[s.statNum, { color: C.primary }]}>{books.length}</Text>
          <Text style={s.statLbl}>{isRTL ? 'סך הכל' : 'Total'}</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statChip}>
          <Text style={[s.statNum, { color: C.emerald }]}>{activeBooks.length}</Text>
          <Text style={s.statLbl}>{isRTL ? 'פעילים' : 'Active'}</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statChip}>
          <Text style={[s.statNum, { color: C.amber }]}>{unlistedBooks.length}</Text>
          <Text style={s.statLbl}>{isRTL ? 'מוסתרים' : 'Hidden'}</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statChip}>
          <Text style={[s.statNum, { color: C.muted }]}>{soldBooks.length}</Text>
          <Text style={s.statLbl}>{isRTL ? 'נמכרו' : 'Sold'}</Text>
        </View>
      </View>

      {/* Search */}
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

      {/* Status filter tabs */}
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
                {isRTL ? t.labelHe : t.labelEn}
              </Text>
              <View style={[s.tabCount, active && s.tabCountActive]}>
                <Text style={[s.tabCountTxt, active && s.tabCountTxtActive]}>{t.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Select mode toolbar */}
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
            <Text style={[s.selectBarTxt, { color: C.primary }]}>
              {isRTL ? 'בחר הכל' : 'Select all'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Error banner */}
      {fetchError && books.length === 0 && (
        <FetchErrorBanner message={isRTL ? 'לא הצלחנו לטעון — משוך לרענון' : "Couldn't load — pull to refresh"} />
      )}

      {/* List */}
      {displayed.length === 0 ? (
        <View style={s.empty}>
          <View style={[s.emptyIconWrap, { backgroundColor: C.primaryLight }]}>
            <Ionicons name="library-outline" size={40} color={C.primary} />
          </View>
          <Text style={s.emptyTitle}>
            {search.trim()
              ? (isRTL ? 'לא נמצאו ספרים' : 'No books found')
              : (isRTL ? 'אין ספרים כאן' : 'No books here')}
          </Text>
          {!search.trim() && statusFilter === 'all' && (
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
          contentContainerStyle={[s.list, { paddingBottom: selectMode ? 80 : 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        />
      )}

      {/* Floating bulk-delete bar */}
      {selectMode && selectedIds.size > 0 && (
        <View style={[s.bulkBar, { bottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={s.bulkDeleteBtn} onPress={handleBulkDelete} activeOpacity={0.85}>
            <Ionicons name="trash-outline" size={18} color={C.white} />
            <Text style={s.bulkDeleteTxt}>
              {isRTL
                ? `מחק ${selectedIds.size} ספרים`
                : `Delete ${selectedIds.size} book${selectedIds.size !== 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Toast {...toast} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 14,
  },
  statChip:    { flex: 1, alignItems: 'center' },
  statNum:     { fontSize: 18, fontWeight: '700' },
  statLbl:     { fontSize: 10, color: C.muted, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: C.border, marginVertical: 6 },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.white,
    marginHorizontal: 14, marginTop: 12, marginBottom: 6,
    borderRadius: 12, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.text, padding: 0 },

  // Filter tabs
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 6,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tabChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, backgroundColor: '#f5f5f4',
    borderWidth: 1, borderColor: 'transparent',
  },
  tabChipActive:   { backgroundColor: C.primaryLight, borderColor: C.primary + '40' },
  tabChipTxt:      { fontSize: 12, fontWeight: '500', color: C.sub },
  tabChipTxtActive:{ color: C.primary, fontWeight: '600' },
  tabCount:        { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#e7e5e4', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  tabCountActive:  { backgroundColor: C.primary },
  tabCountTxt:     { fontSize: 10, fontWeight: '700', color: C.sub },
  tabCountTxtActive: { color: C.white },

  // Select mode toolbar
  selectBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.primaryLight,
    borderBottomWidth: 1, borderBottomColor: C.primary + '30',
  },
  selectBarBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  selectBarTxt:   { fontSize: 14, fontWeight: '600', color: C.sub },
  selectBarCount: { fontSize: 14, fontWeight: '700', color: C.primary },

  // List
  list: { padding: 14 },

  // Card
  card: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    alignItems: 'center',
  },
  cardSelected: { borderColor: C.primary, borderWidth: 1.5 },
  cardRTL:      { flexDirection: 'row-reverse' },

  // Checkbox (select mode)
  checkWrap:    { paddingLeft: 10 },
  checkWrapRTL: { paddingLeft: 0, paddingRight: 10 },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxActive: { backgroundColor: C.primary, borderColor: C.primary },

  // Cover
  coverWrap:       {},
  coverWrapSelect: {},
  cover:        { width: 80, height: 108, backgroundColor: C.border },
  coverFallback:{ justifyContent: 'center', alignItems: 'center' },

  // Info
  info:       { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  bookTitle:  { fontSize: 14, fontWeight: '600', color: C.text, marginBottom: 2, lineHeight: 19 },
  bookAuthor: { fontSize: 12, color: C.sub, marginBottom: 8 },

  badgeRow:    { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  badgeRowRTL: { flexDirection: 'row-reverse' },
  listingBadge:{ fontSize: 13, fontWeight: '600' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20,
  },
  statusDot:  { width: 5, height: 5, borderRadius: 3 },
  statusTxt:  { fontSize: 11, fontWeight: '600' },

  cityRow:    { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  cityRowRTL: { flexDirection: 'row-reverse' },
  cityTxt:    { fontSize: 11, color: C.muted },

  // Action buttons (3 stacked vertically on right)
  actions:    { paddingRight: 10, paddingVertical: 10, gap: 6 },
  actionsRTL: { paddingRight: 0, paddingLeft: 10 },
  actionBtn:  { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f4' },

  // Empty
  empty:         { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIconWrap: { width: 88, height: 88, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle:    { fontSize: 17, fontWeight: '600', color: C.text, marginBottom: 8, textAlign: 'center' },
  emptySub:      { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 21, marginBottom: 24, paddingHorizontal: 8 },
  publishBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primary, paddingVertical: 13, paddingHorizontal: 28, borderRadius: 12 },
  publishBtnTxt: { color: C.white, fontSize: 15, fontWeight: '600' },

  // Floating bulk delete bar
  bulkBar: {
    position: 'absolute',
    left: 16, right: 16,
    borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 8,
  },
  bulkDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.red,
    paddingVertical: 14, borderRadius: 14,
  },
  bulkDeleteTxt: { color: C.white, fontSize: 15, fontWeight: '700' },

  rAlign: { textAlign: 'right' },
});

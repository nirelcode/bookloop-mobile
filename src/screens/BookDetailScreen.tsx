import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Share,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Book } from '../types';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useDataStore } from '../stores/dataStore';
import i18n from '../lib/i18n';
import { BookDetailSkeleton } from '../components/Skeleton';
import { useToast, Toast } from '../components/Toast';
import { ReportModal } from '../components/ReportModal';
import { useReviewPrompt } from '../hooks/useReviewPrompt';
import { ReviewPromptModal } from '../components/ReviewPromptModal';
import { GENRE_LABEL_MAP, DB_VALUE_TO_LABEL } from '../constants/books';
import { formatLastActive } from '../lib/formatLastActive';

const { width: SCREEN_W } = Dimensions.get('window');

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
  pink: '#db2777',
  pinkLight: '#fce7f3',
};

// Genre label lookup: DB sub-values first, fall back to top-level keys
function getGenreLabel(g: string, lang: string): string {
  const label = DB_VALUE_TO_LABEL[g] ?? GENRE_LABEL_MAP[g];
  if (!label) return g;
  return lang === 'he' ? label.he : label.en;
}


export default function BookDetailScreen() {
  const route      = useRoute();
  const navigation = useNavigation<any>();
  const insets     = useSafeAreaInsets();
  const review     = useReviewPrompt();
  const { bookId } = route.params as { bookId: string };

  // Seed instantly from home cache — skeleton only shows on cold load
  const [book, setBook]             = useState<Book | null>(
    () => useDataStore.getState().homeBooks.find(b => b.id === bookId) ?? null
  );
  const [similarBooks, setSimilarBooks] = useState<Book[]>([]);
  const [loading, setLoading]       = useState(
    () => !useDataStore.getState().homeBooks.some(b => b.id === bookId)
  );
  const [inWishlist, setInWishlist] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [imgIndex, setImgIndex]     = useState(0);
  const [zoomVisible, setZoomVisible]     = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const { showToast, toast } = useToast();

  const { user } = useAuthStore();
  const { isRTL, language } = useLanguageStore();
  const { addFavoriteId, removeFavoriteId, invalidateWishlist, blockedIds } = useDataStore();

  useEffect(() => {
    const isOwn = book?.user_id === user?.id;
    const actionButtons = (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={handleShare} style={{ padding: 8 }}>
          <Ionicons name="share-outline" size={22} color={C.text} />
        </TouchableOpacity>
        {!isOwn && (
          <TouchableOpacity onPress={handleReport} style={{ padding: 8 }}>
            <Ionicons name="flag-outline" size={20} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>
    );
    if (isRTL) {
      navigation.setOptions({
        headerLeft: () => actionButtons,
        headerRight: () => (
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <Ionicons name="chevron-forward" size={26} color={C.text} />
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({
        headerLeft: undefined,
        headerRight: () => actionButtons,
      });
    }
  }, [book, isRTL, user?.id]);

  useEffect(() => {
    fetchBook();
    if (user) checkWishlist();
    // Record view + update genre affinities (fire and forget)
    if (user) {
      supabase.rpc('record_book_view', { p_book_id: bookId });
      supabase.rpc('update_genre_affinities', { p_book_id: bookId });
    }
  }, [bookId, user]);

  // Fetch similar books once the main book loads, excluding blocked users
  useEffect(() => {
    if (!book) return;
    let query = supabase
      .from('books')
      .select('id,title,author,city,images,listing_type,price,condition')
      .eq('status', 'active')
      .eq('city', book.city)
      .neq('id', book.id)
      .limit(8);
    if (blockedIds.length > 0) {
      query = query.not('user_id', 'in', `(${blockedIds.join(',')})`);
    }
    query.then(({ data }) => { if (data) setSimilarBooks(data as Book[]); });
  }, [book?.id, blockedIds]);

  const fetchBook = async () => {
    try {
      const { data, error } = await supabase
        .from('books')
        .select('*, profiles!books_user_id_fkey(*)')
        .eq('id', bookId)
        .single();
      if (error) throw error;
      setBook(data as Book);
      setFetchError(false);
    } catch (error) {
      console.error('Error fetching book:', error);
      if (!book) setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  const checkWishlist = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('book_id', bookId)
        .single();
      const found = !!data;
      setInWishlist(found);
      // Sync with global favorites store
      if (found) addFavoriteId(bookId);
      else removeFavoriteId(bookId);
    } catch {
      setInWishlist(false);
      removeFavoriteId(bookId);
    }
  };

  const toggleWishlist = async () => {
    if (!user) { navigation.navigate('Auth' as never); return; }
    setWishlistLoading(true);
    try {
      if (inWishlist) {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('book_id', bookId);
        setInWishlist(false);
        removeFavoriteId(bookId);
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, book_id: bookId });
        setInWishlist(true);
        addFavoriteId(bookId);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        review.maybeShowAfterWishlist();
      }
      invalidateWishlist();
    } catch (error: any) {
      Alert.alert(i18n.t('common.error'), error.message);
    } finally {
      setWishlistLoading(false);
    }
  };

  const handleShare = async () => {
    if (!book) return;
    const priceStr = book.listing_type === 'sale' && book.price
      ? `₪${book.price}`
      : book.listing_type === 'free'
        ? (isRTL ? 'חינם' : 'Free')
        : (isRTL ? 'להחלפה' : 'Trade');
    const webUrl = `https://www.bookloop.co.il/book/${book.id}`;
    const msg = isRTL
      ? `ראיתם את "${book.title}" מאת ${book.author}?\n${priceStr} · ${book.city} · BookLoop\n${webUrl}`
      : `Check out "${book.title}" by ${book.author}\n${priceStr} · ${book.city} · BookLoop\n${webUrl}`;
    try {
      // url is iOS-only: enables the rich link preview card (OG preview)
      // On Android the URL is already included in the message text
      await Share.share({ message: msg, url: webUrl });
    } catch {}
  };

  const handleReport = () => setReportVisible(true);

  const submitReport = async (category: string, details: string) => {
    if (!user || !book) return;
    await supabase.from('reports').insert({
      reporter_id:      user.id,
      reported_user_id: book.user_id,
      book_id:          book.id,
      reason:           details || 'Book listing reported by user',
      category,
    });
    showToast(isRTL ? 'הדיווח נשלח, תודה' : 'Report submitted, thank you');
  };

  const handleContactSeller = () => {
    if (!user) { navigation.navigate('Auth' as never); return; }
    if (book?.profiles) {
      const imgs = book.images?.length ? book.images : [`https://picsum.photos/seed/${book.id}/400/500`];
      navigation.navigate('Chat', {
        recipientId: book.user_id,
        recipientName: book.profiles.name,
        recipientAvatar: book.profiles.avatar_url ?? undefined,
        bookContext: {
          id: book.id,
          title: book.title,
          author: book.author,
          image: imgs[0],
          listing_type: book.listing_type,
          price: book.price,
        },
      });
    }
  };

  const onImgScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setImgIndex(idx);
  };

  const getListingConfig = (type: string) => ({
    free:  { label: i18n.t('book.listingType.free'),  bg: C.emeraldLight, text: '#065f46' },
    sale:  { label: i18n.t('book.listingType.sale'),  bg: C.primaryLight,  text: C.primary },
    trade: { label: i18n.t('book.listingType.trade'), bg: C.amberLight,    text: '#92400e' },
  }[type] ?? { label: type, bg: C.primaryLight, text: C.primary });

  const getConditionStyle = (condition: string) => ({
    new:      { bg: '#dcfce7', text: '#15803d' },
    like_new: { bg: '#dbeafe', text: '#1d4ed8' },
    good:     { bg: '#fef9c3', text: '#a16207' },
    fair:     { bg: '#ffedd5', text: '#c2410c' },
  }[condition] ?? { bg: '#fef9c3', text: '#a16207' });

  if (loading) {
    return <BookDetailSkeleton />;
  }

  if (!book) {
    return (
      <View style={st.centered}>
        <View style={st.errorIconWrap}>
          <Ionicons name={fetchError ? 'cloud-offline-outline' : 'book-outline'} size={44} color={fetchError ? '#ef4444' : C.muted} />
        </View>
        <Text style={st.notFound}>
          {fetchError
            ? (isRTL ? 'לא הצלחנו לטעון' : "Couldn't load book")
            : i18n.t('book.notFound')}
        </Text>
        <Text style={st.notFoundSub}>
          {fetchError
            ? (isRTL ? 'בדוק את החיבור לאינטרנט ונסה שוב' : 'Check your connection and try again')
            : (isRTL ? 'הספר הוסר או שאינו זמין' : 'This listing may have been removed')}
        </Text>
        {fetchError ? (
          <TouchableOpacity
            style={st.goBackBtn}
            onPress={() => { setLoading(true); setFetchError(false); fetchBook(); }}
            activeOpacity={0.8}
          >
            <Text style={st.goBackTxt}>{isRTL ? 'נסה שוב' : 'Try again'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={st.goBackBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Text style={st.goBackTxt}>{isRTL ? 'חזור' : 'Go back'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const listingConf = getListingConfig(book.listing_type);
  const condStyle   = getConditionStyle(book.condition);
  const images      = book.images?.length ? book.images : [`https://picsum.photos/seed/${book.id}/400/500`];
  const hasMultiple = images.length > 1;
  const genres      = book.genres ?? [];

  const isOwn = user?.id === book.user_id;

  return (
    <View style={st.flex}>
      <ScrollView
        style={st.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: isOwn ? 24 : 100 }}
      >
        {/* ── Image gallery ── */}
        <View style={st.galleryWrap}>
          <FlatList
            data={images}
            keyExtractor={(_, i) => String(i)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onImgScroll}
            scrollEventThrottle={16}
            renderItem={({ item }) => (
              <TouchableOpacity activeOpacity={0.95} onPress={() => setZoomVisible(true)}>
                <Image source={{ uri: item }} style={st.heroImage} contentFit="cover" cachePolicy="disk" />
              </TouchableOpacity>
            )}
          />

          {hasMultiple && (
            <View style={st.dots}>
              {images.map((_, i) => (
                <View key={i} style={[st.dot, i === imgIndex && st.dotActive]} />
              ))}
            </View>
          )}

          {hasMultiple && (
            <View style={[st.imgCounter, isRTL ? { right: 14, left: undefined } : { left: 14 }]}>
              <Text style={st.imgCounterTxt}>{imgIndex + 1} / {images.length}</Text>
            </View>
          )}

          {/* Zoom hint */}
          <View style={st.zoomHint}>
            <Ionicons name="expand-outline" size={14} color="rgba(255,255,255,0.8)" />
          </View>
        </View>

        {/* ── Content ── */}
        <View style={st.content}>

          {/* Badges */}
          <View style={[st.badgeRow, isRTL && st.rowRev]}>
            <View style={[st.badge, { backgroundColor: listingConf.bg }]}>
              <Text style={[st.badgeTxt, { color: listingConf.text }]}>{listingConf.label}</Text>
            </View>
            <View style={[st.badge, { backgroundColor: condStyle.bg }]}>
              <Text style={[st.badgeTxt, { color: condStyle.text }]}>
                {i18n.t(`book.condition.${book.condition}`)}
              </Text>
            </View>
          </View>

          <Text style={[st.title, isRTL && st.rAlign]}>{book.title}</Text>
          <Text style={[st.author, isRTL && st.rAlign]}>
            {i18n.t('book.by')} {book.author || (isRTL ? 'מחבר לא ידוע' : 'Unknown')}
          </Text>

          {book.listing_type === 'sale' && book.price && (
            <Text style={st.price}>₪{book.price}</Text>
          )}

          {genres.length > 0 && (
            <View style={[st.genreRow, isRTL && st.rowRev]}>
              {genres.map(g => (
                <View key={g} style={st.genrePill}>
                  <Text style={st.genrePillTxt}>
                    {getGenreLabel(g, language)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {book.listing_type === 'trade' && book.looking_for && (
            <View style={[st.infoBox, { backgroundColor: C.amberLight }]}>
              <Text style={[st.infoBoxLabel, isRTL && st.rAlign]}>{i18n.t('book.lookingFor')}</Text>
              <Text style={[st.infoBoxTxt, { color: '#78350f' }, isRTL && st.rAlign]}>{book.looking_for}</Text>
            </View>
          )}

          <View style={st.detailsBox}>
            <View style={[st.detailRow, isRTL && st.rowRev]}>
              <Ionicons name="location-outline" size={16} color={C.muted} />
              <Text style={[st.detailLabel, isRTL && st.rAlign]}>{i18n.t('book.location')}</Text>
              <Text style={[st.detailValue, isRTL && st.rAlign]}>{book.city}</Text>
            </View>
            <View style={st.detailDivider} />
            <View style={[st.detailRow, isRTL && st.rowRev]}>
              <Ionicons name="layers-outline" size={16} color={C.muted} />
              <Text style={[st.detailLabel, isRTL && st.rAlign]}>{i18n.t('book.conditionLabel')}</Text>
              <Text style={[st.detailValue, isRTL && st.rAlign]}>{i18n.t(`book.condition.${book.condition}`)}</Text>
            </View>
            <View style={st.detailDivider} />
            <View style={[st.detailRow, isRTL && st.rowRev]}>
              <Ionicons
                name={(book as any).shipping_type === 'shipping' ? 'cube-outline' : 'car-outline'}
                size={16}
                color={C.muted}
              />
              <Text style={[st.detailLabel, isRTL && st.rAlign]}>{isRTL ? 'משלוח' : 'Shipping'}</Text>
              <Text style={[st.detailValue, isRTL && st.rAlign]}>
                {(book as any).shipping_type === 'shipping'
                  ? (isRTL ? 'משלוח זמין' : 'Shipping available')
                  : (isRTL ? 'איסוף עצמי' : 'Pickup only')}
              </Text>
            </View>
            {(book as any).shipping_type === 'shipping' && (book as any).shipping_details ? (
              <Text style={[st.shippingDetails, isRTL && st.rAlign]}>{(book as any).shipping_details}</Text>
            ) : null}
          </View>

          {book.description && (
            <View style={st.section}>
              <Text style={[st.sectionTitle, isRTL && st.rAlign]}>{i18n.t('book.description')}</Text>
              <Text style={[st.description, isRTL && st.rAlign]}>{book.description}</Text>
            </View>
          )}

          {book.profiles && (
            <TouchableOpacity
              style={[st.sellerBox, isRTL && st.rowRev]}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('SellerProfile', {
                sellerId: book.user_id,
                sellerName: book.profiles!.name,
              })}
            >
              <View style={[st.sellerLeft, isRTL && st.rowRev]}>
                <View style={st.sellerAvatar}>
                  {book.profiles.avatar_url ? (
                    <Image
                      source={{ uri: book.profiles.avatar_url }}
                      style={{ width: 48, height: 48, borderRadius: 24 }}
                    />
                  ) : (
                    <Text style={st.sellerInitial}>
                      {book.profiles.name?.charAt(0).toUpperCase() || 'U'}
                    </Text>
                  )}
                </View>
                <View>
                  <Text style={[st.sellerLbl, isRTL && st.rAlign]}>{i18n.t('book.seller')}</Text>
                  <Text style={[st.sellerName, isRTL && st.rAlign]}>{book.profiles.name}</Text>
                  {book.profiles.city && (
                    <View style={[st.sellerCityRow, isRTL && st.rowRev]}>
                      <Ionicons name="location-outline" size={12} color={C.muted} />
                      <Text style={st.sellerCity}>{book.profiles.city}</Text>
                    </View>
                  )}
                  {book.profiles.last_active_at && formatLastActive(book.profiles.last_active_at, isRTL) && (
                    <View style={[st.sellerCityRow, isRTL && st.rowRev, { marginTop: 2 }]}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: (Date.now() - new Date(book.profiles.last_active_at).getTime()) < 3_600_000 ? '#059669' : C.muted }} />
                      <Text style={st.sellerCity}>{formatLastActive(book.profiles.last_active_at, isRTL)}</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={[st.sellerRight, isRTL && st.rowRev]}>
                <Text style={st.viewProfile}>{isRTL ? 'פרופיל' : 'Profile'}</Text>
                <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={C.primary} />
              </View>
            </TouchableOpacity>
          )}

          {/* Similar books */}
          {similarBooks.length > 0 && (
            <View style={st.similarSection}>
              <Text style={[st.sectionTitle, { marginBottom: 12 }]}>
                {isRTL ? 'ספרים נוספים מהאזור' : 'More from this area'}
              </Text>
              <FlatList
                horizontal
                data={similarBooks}
                keyExtractor={b => `sim-${b.id}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
                renderItem={({ item }) => {
                  let badge: { label: string; color: string } | null = null;
                  if (item.listing_type === 'sale' && item.price)
                    badge = { label: `₪${item.price}`, color: C.primary };
                  else if (item.listing_type === 'free')
                    badge = { label: isRTL ? 'חינם' : 'Free', color: C.emerald };
                  else if (item.listing_type === 'trade')
                    badge = { label: isRTL ? 'החלפה' : 'Trade', color: C.amber };
                  return (
                    <TouchableOpacity
                      style={st.simCard}
                      onPress={() => navigation.navigate('BookDetail', { bookId: item.id })}
                      activeOpacity={0.82}
                    >
                      <Image
                        source={{ uri: item.images?.[0] ?? `https://picsum.photos/seed/${item.id}/300/400` }}
                        style={st.simImg}
                        contentFit="cover"
                        cachePolicy="disk"
                      />
                      <View style={st.simBody}>
                        <Text style={st.simTitle} numberOfLines={2}>{item.title}</Text>
                        <Text style={st.simAuthor} numberOfLines={1}>{item.author}</Text>
                        {badge && <Text style={[st.simPrice, { color: badge.color }]}>{badge.label}</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Sticky bottom CTA bar ── */}
      {!isOwn && (
        <View style={[st.stickyBar, { paddingBottom: insets.bottom + 12 }, isRTL && st.rowRev]}>
          <TouchableOpacity style={st.wishlistBtnBar} onPress={toggleWishlist} disabled={wishlistLoading}>
            {wishlistLoading
              ? <ActivityIndicator size="small" color={C.pink} />
              : <Ionicons name={inWishlist ? 'heart' : 'heart-outline'} size={22} color={inWishlist ? C.pink : C.sub} />
            }
          </TouchableOpacity>
          <TouchableOpacity style={[st.contactBtn, isRTL && st.rowRev]} onPress={handleContactSeller} activeOpacity={0.85}>
            <Ionicons name="chatbubble-outline" size={18} color={C.white} />
            <Text style={st.contactTxt}>{i18n.t('book.contactSeller')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Full-screen image zoom modal ── */}
      <Modal visible={zoomVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setZoomVisible(false)}>
        <View style={st.zoomBg}>
          <Image
            source={{ uri: images[imgIndex] }}
            style={st.zoomImg}
            contentFit="contain"
            cachePolicy="disk"
          />
          <TouchableOpacity style={st.zoomClose} onPress={() => setZoomVisible(false)}>
            <Ionicons name="close" size={26} color="#ffffff" />
          </TouchableOpacity>
          {hasMultiple && (
            <View style={st.zoomCounter}>
              <Text style={st.imgCounterTxt}>{imgIndex + 1} / {images.length}</Text>
            </View>
          )}
        </View>
      </Modal>

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        onSubmit={submitReport}
        titleEn={`Report listing`}
        titleHe={`דיווח על מודעה`}
      />

      <Toast {...toast} />

      <ReviewPromptModal
        visible={review.visible}
        onYes={review.handleYes}
        onNotNow={review.handleNotNow}
        onDismiss={review.handleDismiss}
      />
    </View>
  );
}

const SIMILAR_W = 130;

const st = StyleSheet.create({
  flex:      { flex: 1, backgroundColor: C.bg },
  container: { flex: 1, backgroundColor: C.bg },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg, padding: 32 },
  errorIconWrap: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: '#f5f5f4',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  notFound:    { fontSize: 18, fontWeight: '600', color: C.text, marginBottom: 8, textAlign: 'center' },
  notFoundSub: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  goBackBtn:   {
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
    paddingVertical: 11, paddingHorizontal: 28,
  },
  goBackTxt:   { fontSize: 15, fontWeight: '600', color: C.text },

  // ── Gallery ──
  galleryWrap: { position: 'relative' },
  heroImage:   { width: SCREEN_W, height: 400, backgroundColor: C.border },
  dots: {
    position: 'absolute', bottom: 14,
    flexDirection: 'row', alignSelf: 'center', gap: 6,
  },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#ffffff', width: 18 },
  imgCounter: {
    position: 'absolute', top: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  imgCounterTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
  zoomHint: {
    position: 'absolute', bottom: 14, right: 14,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius: 10, padding: 6,
  },

  // ── Content ──
  content: { padding: 20, paddingTop: 18 },

  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  badge:    { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeTxt: { fontSize: 12, fontWeight: '700' },

  title:  { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 5, lineHeight: 30 },
  author: { fontSize: 16, color: C.sub, marginBottom: 12 },
  price:  { fontSize: 28, fontWeight: '600', color: C.primary, marginBottom: 16 },

  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  rowRev:   { flexDirection: 'row-reverse' },
  genrePill:   { backgroundColor: '#f5f5f4', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  genrePillTxt:{ fontSize: 12, fontWeight: '500', color: C.sub },

  infoBox:      { padding: 14, borderRadius: 14, marginBottom: 16 },
  infoBoxLabel: { fontSize: 11, fontWeight: '700', color: '#92400e', textTransform: 'uppercase', marginBottom: 4 },
  infoBoxTxt:   { fontSize: 14, lineHeight: 20 },

  detailsBox: {
    backgroundColor: C.white, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 16, marginBottom: 20,
  },
  detailRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  detailDivider: { height: 1, backgroundColor: C.border },
  detailLabel:     { fontSize: 13, fontWeight: '600', color: C.muted, width: 90 },
  detailValue:     { fontSize: 14, color: C.text, flex: 1, fontWeight: '500' },
  shippingDetails: { fontSize: 13, color: C.sub, paddingHorizontal: 2, paddingBottom: 10, lineHeight: 18 },

  section:      { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 8 },
  description:  { fontSize: 14, color: C.sub, lineHeight: 22 },

  // ── Seller ──
  sellerBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.white, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    padding: 14, marginBottom: 20,
  },
  sellerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  sellerAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  sellerInitial: { fontSize: 20, fontWeight: '700', color: C.primary },
  sellerLbl:     { fontSize: 10, color: C.muted, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  sellerName:    { fontSize: 15, fontWeight: '700', color: C.text },
  sellerCityRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  sellerCity:    { fontSize: 12, color: C.muted },
  sellerRight:   { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewProfile:   { fontSize: 13, fontWeight: '600', color: C.sub },

  // ── Sticky bottom bar ──
  stickyBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border,
  },
  wishlistBtnBar: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#f5f5f4', borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
  },
  contactBtn: {
    flex: 1, backgroundColor: C.primary,
    padding: 15, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  contactTxt: { color: C.white, fontSize: 16, fontWeight: '600' },

  // ── Similar books ──
  similarSection: { marginTop: 24, marginBottom: 8 },
  simCard: {
    width: SIMILAR_W, backgroundColor: C.white, borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: C.border,
  },
  simImg:    { width: '100%', aspectRatio: 3 / 4, backgroundColor: C.border },
  simBody:   { padding: 8 },
  simTitle:  { fontSize: 12, fontWeight: '600', color: C.text, lineHeight: 16, marginBottom: 2 },
  simAuthor: { fontSize: 10, color: C.sub, marginBottom: 4 },
  simPrice:  { fontSize: 12, fontWeight: '600' },

  // ── Zoom modal ──
  zoomBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  zoomImg:   { width: SCREEN_W, height: SCREEN_W * 1.4 },
  zoomClose: {
    position: 'absolute', top: 52, right: 18,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  zoomCounter: {
    position: 'absolute', bottom: 52,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5,
  },

  rAlign: { textAlign: 'right' },
});
